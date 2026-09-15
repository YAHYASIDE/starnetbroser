import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { authenticator } from "otplib";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "../vault/vault.service";
import { AuditService } from "../audit/audit.service";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  expiresIn: number;
}

/**
 * Rotating refresh tokens: only a SHA-256 hash of each refresh token is
 * ever stored. Each use of a refresh token revokes it and issues a new
 * one (chained via replacedById). If a REVOKED token is presented again,
 * that is a replay of a stolen/rotated-away token, so every refresh
 * token for that user is revoked as a precaution and the caller is
 * forced back to a full login.
 */
@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly vault: VaultService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private async issueTokenPair(userId: string, deviceId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, deviceId },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    const rawRefreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        deviceId,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { accessToken, refreshToken: rawRefreshToken, deviceId, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  private checkLoginRateLimit(key: string) {
    const limit = Number(this.config.get("LOGIN_RATE_LIMIT_PER_MINUTE") ?? 10);
    const now = Date.now();
    const windowStart = now - 60_000;
    const attempts = (this.loginAttempts.get(key) ?? []).filter((t) => t > windowStart);
    if (attempts.length >= limit) {
      throw new UnauthorizedException("Too many login attempts, try again shortly");
    }
    attempts.push(now);
    this.loginAttempts.set(key, attempts);
  }

  async register(email: string, password: string, deviceName?: string): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({ data: { email, passwordHash } });
    const device = await this.prisma.device.create({
      data: { userId: user.id, name: deviceName || "جهاز غير مسمى" },
    });
    await this.audit.log({ userId: user.id, deviceId: device.id, action: "register" });
    return this.issueTokenPair(user.id, device.id);
  }

  async login(
    email: string,
    password: string,
    opts: { deviceName?: string; deviceId?: string; totpCode?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    this.checkLoginRateLimit(opts.ipAddress ? `${email}:${opts.ipAddress}` : email);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await this.audit.log({ action: "login_failed", detail: "invalid credentials", ipAddress: opts.ipAddress });
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.totpEnabled) {
      if (!opts.totpCode) {
        throw new UnauthorizedException("TOTP code required");
      }
      const secret = this.vault.decrypt(user.totpSecretEncrypted ?? "");
      if (!authenticator.check(opts.totpCode, secret)) {
        await this.audit.log({ userId: user.id, action: "login_failed", detail: "bad totp", ipAddress: opts.ipAddress });
        throw new UnauthorizedException("Invalid TOTP code");
      }
    }

    let device = opts.deviceId
      ? await this.prisma.device.findFirst({
          where: { id: opts.deviceId, userId: user.id, revokedAt: null },
        })
      : null;

    if (!device) {
      device = await this.prisma.device.create({
        data: { userId: user.id, name: opts.deviceName || "جهاز غير مسمى" },
      });
    } else {
      await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    }

    await this.audit.log({ userId: user.id, deviceId: device.id, action: "login", ipAddress: opts.ipAddress });
    return this.issueTokenPair(user.id, device.id);
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (stored.revokedAt) {
      // Replay of an already-rotated-away token: treat as a compromise and
      // revoke every refresh token this user holds.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        userId: stored.userId,
        deviceId: stored.deviceId,
        action: "refresh_token_reuse_detected",
        detail: "all refresh tokens revoked",
      });
      throw new UnauthorizedException("Refresh token reuse detected; please log in again");
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    const device = await this.prisma.device.findUnique({ where: { id: stored.deviceId } });
    if (!device || device.revokedAt) {
      throw new UnauthorizedException("Device has been revoked");
    }

    const next = await this.issueTokenPair(stored.userId, stored.deviceId);
    const nextHash = this.hashToken(next.refreshToken);
    const nextRow = await this.prisma.refreshToken.findUnique({ where: { tokenHash: nextHash } });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: nextRow?.id },
    });

    return next;
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) {
      throw new UnauthorizedException("Device not found");
    }
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({ userId, deviceId, action: "device_revoked" });
  }

  async setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEncrypted: this.vault.encrypt(secret) },
    });
    const otpauthUrl = authenticator.keyuri(user.email, "STAR NET", secret);
    return { secret, otpauthUrl };
  }

  async enableTotp(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecretEncrypted) {
      throw new UnauthorizedException("Call totp/setup first");
    }
    const secret = this.vault.decrypt(user.totpSecretEncrypted);
    if (!authenticator.check(code, secret)) {
      throw new UnauthorizedException("Invalid TOTP code");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    await this.audit.log({ userId, action: "totp_enabled" });
  }

  async disableTotp(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabled || !user.totpSecretEncrypted) {
      return;
    }
    const secret = this.vault.decrypt(user.totpSecretEncrypted);
    if (!authenticator.check(code, secret)) {
      throw new UnauthorizedException("Invalid TOTP code");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecretEncrypted: null },
    });
    await this.audit.log({ userId, action: "totp_disabled" });
  }
}
