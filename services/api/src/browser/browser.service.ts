import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes, randomUUID, createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { BrowserSessionStatus, BrowserStatus } from "@starnet/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { WorkerClientService } from "./worker-client.service";

const LOCK_TTL_MS = 30_000;

export interface OpenSessionResult {
  status: BrowserSessionStatus;
  vncTicket: string;
  expiresInSeconds: number;
}

/**
 * Owns the Postgres-backed per-account lock that stops two requests (two
 * phones opening the same account at once, or a start racing a stop)
 * from both talking to the worker for the same account concurrently.
 * The worker's own SessionManager is separately idempotent (see
 * services/browser-worker), so this lock is about the API layer's own
 * race, not a substitute for that.
 */
@Injectable()
export class BrowserService {
  private readonly ticketTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: WorkerClientService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    this.ticketTtlSeconds = Number(this.config.get("VNC_TICKET_TTL_SECONDS") ?? 60);
  }

  private async assertOwnedAccount(ownerUserId: string, accountId: string) {
    const account = await this.prisma.starlinkAccount.findFirst({
      where: { id: accountId, customer: { ownerUserId } },
    });
    if (!account) {
      throw new NotFoundException("Account not found");
    }
  }

  /**
   * upsert() alone isn't safe against two truly concurrent first-ever
   * calls for the same account: both can see "no row yet" and both
   * attempt the INSERT, and Postgres correctly rejects the loser with a
   * unique-constraint violation rather than silently serializing them.
   * Confirmed for real once (not just in theory): CI's timing hit this
   * race in browser.service.spec.ts's concurrent-open() test even
   * though local runs of the same test hadn't. Caught here and treated
   * as "someone else already created it" rather than an error.
   */
  private async ensureSessionRow(accountId: string) {
    try {
      return await this.prisma.browserSession.upsert({
        where: { accountId },
        update: {},
        create: { accountId, profileVolumeName: `starnet_profile_${accountId}`, status: "STOPPED" },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return this.prisma.browserSession.findUniqueOrThrow({ where: { accountId } });
      }
      throw err;
    }
  }

  private async acquireLock(accountId: string, requestId: string): Promise<boolean> {
    const result = await this.prisma.browserSession.updateMany({
      where: {
        accountId,
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LOCK_TTL_MS) } }],
      },
      data: { lockedAt: new Date(), lockedByRequestId: requestId },
    });
    return result.count === 1;
  }

  private async releaseLock(accountId: string, requestId: string) {
    await this.prisma.browserSession.updateMany({
      where: { accountId, lockedByRequestId: requestId },
      data: { lockedAt: null, lockedByRequestId: null },
    });
  }

  /**
   * Creates the session if needed, or resumes it if already running (the
   * worker's start() is idempotent) - this is both "create" and "open"
   * from the product spec, and what a second device calls too. Always
   * issues a fresh, short-lived VNC ticket.
   */
  async open(ownerUserId: string, accountId: string): Promise<OpenSessionResult> {
    await this.assertOwnedAccount(ownerUserId, accountId);
    await this.ensureSessionRow(accountId);

    const requestId = randomUUID();
    if (!(await this.acquireLock(accountId, requestId))) {
      throw new ConflictException("Another operation is already in progress for this account");
    }

    try {
      const info = await this.worker.start(accountId);

      const rawTicket = randomBytes(32).toString("base64url");
      const ticketHash = createHash("sha256").update(rawTicket).digest("hex");

      await this.prisma.browserSession.update({
        where: { accountId },
        data: {
          status: info.status,
          lastStartedAt: new Date(),
          lastActivityAt: new Date(),
          vncTicketHash: ticketHash,
          vncTicketExpiresAt: new Date(Date.now() + this.ticketTtlSeconds * 1000),
        },
      });

      await this.audit.log({ userId: ownerUserId, accountId, action: "browser_session_opened" });

      return { status: info.status, vncTicket: rawTicket, expiresInSeconds: this.ticketTtlSeconds };
    } finally {
      await this.releaseLock(accountId, requestId);
    }
  }

  async stop(ownerUserId: string, accountId: string): Promise<void> {
    await this.assertOwnedAccount(ownerUserId, accountId);
    await this.ensureSessionRow(accountId);

    const requestId = randomUUID();
    if (!(await this.acquireLock(accountId, requestId))) {
      throw new ConflictException("Another operation is already in progress for this account");
    }

    try {
      await this.worker.stop(accountId);
      await this.prisma.browserSession.update({
        where: { accountId },
        data: {
          status: "STOPPED",
          lastStoppedAt: new Date(),
          vncTicketHash: null,
          vncTicketExpiresAt: null,
        },
      });
      await this.audit.log({ userId: ownerUserId, accountId, action: "browser_session_stopped" });
    } finally {
      await this.releaseLock(accountId, requestId);
    }
  }

  async status(ownerUserId: string, accountId: string): Promise<BrowserStatus> {
    await this.assertOwnedAccount(ownerUserId, accountId);
    const row = await this.ensureSessionRow(accountId);
    const live = await this.worker.status(accountId).catch(() => null);
    return {
      status: live?.status ?? (row.status as BrowserSessionStatus),
      lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
      lastStoppedAt: row.lastStoppedAt?.toISOString() ?? null,
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
    };
  }

  /** Used only by the ticket-gated WS proxy - never exposed as an HTTP response field. */
  async resolveTicket(rawTicket: string): Promise<{ accountId: string } | null> {
    const ticketHash = createHash("sha256").update(rawTicket).digest("hex");
    const row = await this.prisma.browserSession.findFirst({
      where: { vncTicketHash: ticketHash, vncTicketExpiresAt: { gt: new Date() } },
    });
    return row ? { accountId: row.accountId } : null;
  }
}
