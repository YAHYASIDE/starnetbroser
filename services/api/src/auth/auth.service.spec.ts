process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/starnet_test";

import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { randomBytes } from "crypto";
import { authenticator } from "otplib";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { VaultService } from "../vault/vault.service";
import { AuditService } from "../audit/audit.service";

describe("AuthService (real Postgres)", () => {
  let auth: AuthService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: "test-jwt-secret",
              VAULT_KEY: randomBytes(32).toString("base64"),
              LOGIN_RATE_LIMIT_PER_MINUTE: "1000",
            }),
          ],
        }),
        JwtModule.register({ secret: "test-jwt-secret" }),
      ],
      providers: [AuthService, PrismaService, VaultService, AuditService],
    }).compile();

    auth = moduleRef.get(AuthService);
    prisma = moduleRef.get(PrismaService);
    const vault = moduleRef.get(VaultService);
    vault.onModuleInit();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();
  });

  function uniqueEmail() {
    return `test-${randomBytes(6).toString("hex")}@example.com`;
  }

  it("registers a user and issues a working token pair", async () => {
    const email = uniqueEmail();
    const tokens = await auth.register(email, "correct-horse-battery", "Test Phone");
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toContain("correct-horse-battery");

    const device = await prisma.device.findUniqueOrThrow({ where: { id: tokens.deviceId } });
    expect(device.name).toBe("Test Phone");
  });

  it("rejects registering the same email twice", async () => {
    const email = uniqueEmail();
    await auth.register(email, "correct-horse-battery");
    await expect(auth.register(email, "another-password-1")).rejects.toThrow();
  });

  it("logs in with correct credentials and rejects wrong password", async () => {
    const email = uniqueEmail();
    await auth.register(email, "correct-horse-battery");

    const tokens = await auth.login(email, "correct-horse-battery", {});
    expect(tokens.accessToken).toBeTruthy();

    await expect(auth.login(email, "wrong-password", {})).rejects.toThrow(UnauthorizedException);
  });

  it("rotates the refresh token on use and rejects the old one on replay (reuse detection)", async () => {
    const email = uniqueEmail();
    const first = await auth.register(email, "correct-horse-battery");

    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Using the rotated-away token again must fail...
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);

    // ...and must have revoked the still-valid second token too (breach response).
    await expect(auth.refresh(second.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it("revoking a device invalidates its refresh tokens", async () => {
    const email = uniqueEmail();
    const tokens = await auth.register(email, "correct-horse-battery");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    await auth.revokeDevice(user.id, tokens.deviceId);

    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it("enforces TOTP once enabled", async () => {
    const email = uniqueEmail();
    const tokens = await auth.register(email, "correct-horse-battery");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    const { secret } = await auth.setupTotp(user.id);
    await auth.enableTotp(user.id, authenticator.generate(secret));

    await expect(auth.login(email, "correct-horse-battery", {})).rejects.toThrow("TOTP code required");

    const good = await auth.login(email, "correct-horse-battery", {
      totpCode: authenticator.generate(secret),
    });
    expect(good.accessToken).toBeTruthy();
    void tokens;
  });
});
