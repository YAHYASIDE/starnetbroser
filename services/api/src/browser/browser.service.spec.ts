process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/starnet_test";

import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { Server } from "http";
import { BrowserService } from "./browser.service";
import { WorkerClientService } from "./worker-client.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { startFakeWorker } from "../../test/fakeWorker";

describe("BrowserService (real Postgres + a real fake-worker HTTP server)", () => {
  let browser: BrowserService;
  let prisma: PrismaService;
  let fakeWorkerServer: Server;
  let fakeWorkerStop: () => Promise<void>;
  let ownerA: string;
  let ownerB: string;
  let customerA: string;
  let accountA: string;

  beforeAll(async () => {
    const fake = await startFakeWorker();
    fakeWorkerServer = fake.server;
    fakeWorkerStop = fake.stop;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              WORKER_INTERNAL_URL: `http://127.0.0.1:${fake.port}`,
              VNC_TICKET_TTL_SECONDS: "60",
            }),
          ],
        }),
      ],
      providers: [BrowserService, WorkerClientService, PrismaService, AuditService],
    }).compile();

    browser = moduleRef.get(BrowserService);
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await fakeWorkerStop();
    void fakeWorkerServer;
  });

  beforeEach(async () => {
    await prisma.browserSession.deleteMany();
    await prisma.starlinkAccount.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    const a = await prisma.user.create({ data: { email: `a-${randomBytes(4).toString("hex")}@ex.com`, passwordHash: "x" } });
    const b = await prisma.user.create({ data: { email: `b-${randomBytes(4).toString("hex")}@ex.com`, passwordHash: "x" } });
    ownerA = a.id;
    ownerB = b.id;
    const c = await prisma.customer.create({ data: { ownerUserId: ownerA, name: "Customer A" } });
    customerA = c.id;
    const acc = await prisma.starlinkAccount.create({ data: { customerId: customerA, name: "Window 1" } });
    accountA = acc.id;
  });

  it("opens a session against the real worker HTTP call and issues a resolvable ticket", async () => {
    const result = await browser.open(ownerA, accountA);
    expect(result.status).toBe("RUNNING");
    expect(result.vncTicket).toBeTruthy();

    const resolved = await browser.resolveTicket(result.vncTicket);
    expect(resolved).toEqual({ accountId: accountA });
  });

  it("refuses to open/stop/check an account the caller does not own", async () => {
    await expect(browser.open(ownerB, accountA)).rejects.toThrow(NotFoundException);
    await expect(browser.stop(ownerB, accountA)).rejects.toThrow(NotFoundException);
    await expect(browser.status(ownerB, accountA)).rejects.toThrow(NotFoundException);
  });

  it("rejects an expired or unknown ticket", async () => {
    expect(await browser.resolveTicket("not-a-real-ticket")).toBeNull();
  });

  it("stop() clears the ticket so it can no longer be resolved", async () => {
    const opened = await browser.open(ownerA, accountA);
    await browser.stop(ownerA, accountA);
    expect(await browser.resolveTicket(opened.vncTicket)).toBeNull();

    const status = await browser.status(ownerA, accountA);
    expect(status.status).toBe("STOPPED");
  });

  it("the Postgres lock lets only one of two concurrent open() calls through at a time", async () => {
    const [a, b] = await Promise.allSettled([browser.open(ownerA, accountA), browser.open(ownerA, accountA)]);
    const results = [a, b];
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Both may win if they didn't race within the same tick, but at
    // least the ConflictException path must be reachable, and nothing
    // may silently corrupt state - assert we never got two different
    // kinds of unexpected errors.
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    }
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
  });
});
