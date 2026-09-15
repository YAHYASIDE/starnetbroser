process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/starnet_test";

import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { WebSocket } from "ws";
import { randomBytes } from "crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";
import { startFakeWorker } from "./fakeWorker";

/**
 * Boots the REAL, full Nest app (not a slice) against a real fake-worker
 * HTTP+WS server standing in for services/browser-worker, and proves the
 * whole "open button" path end to end: JWT auth -> ownership check ->
 * POST /accounts/:id/session/open -> a short-lived ticket -> a real
 * WebSocket client connecting through /ws/vnc/:ticket gets proxied all
 * the way to the (fake) worker and can exchange real bytes with it.
 */
describe("VNC WebSocket proxy (e2e, real Nest app + real WebSocket client)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseHttpUrl: string;
  let baseWsUrl: string;
  let fakeWorkerStop: () => Promise<void>;
  let accessToken: string;
  let accountId: string;

  beforeAll(async () => {
    const fakeWorker = await startFakeWorker();
    fakeWorkerStop = fakeWorker.stop;
    process.env.WORKER_INTERNAL_URL = `http://127.0.0.1:${fakeWorker.port}`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const server = await app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseHttpUrl = `http://127.0.0.1:${port}`;
    baseWsUrl = `ws://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);
    const auth = app.get(AuthService);

    await prisma.starlinkAccount.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();

    const email = `vnc-${randomBytes(4).toString("hex")}@example.com`;
    const tokens = await auth.register(email, "correct-horse-battery");
    accessToken = tokens.accessToken;

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const customer = await prisma.customer.create({ data: { ownerUserId: user.id, name: "Customer" } });
    const account = await prisma.starlinkAccount.create({ data: { customerId: customer.id, name: "Window 1" } });
    accountId = account.id;
  });

  afterAll(async () => {
    await app.close();
    await fakeWorkerStop();
  });

  it("opens a session over authenticated HTTP and streams real WebSocket bytes through the proxy to the worker", async () => {
    const openRes = await fetch(`${baseHttpUrl}/accounts/${accountId}/session/open`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(openRes.status).toBe(201);
    const body = (await openRes.json()) as { status: string; vncTicket: string };
    expect(body.status).toBe("RUNNING");
    expect(body.vncTicket).toBeTruthy();

    const ws = new WebSocket(`${baseWsUrl}/ws/vnc/${body.vncTicket}`);
    const echoed = await new Promise<string>((resolve, reject) => {
      ws.on("open", () => ws.send("hello-through-the-real-tunnel"));
      ws.on("message", (data) => resolve(data.toString()));
      ws.on("error", reject);
      setTimeout(() => reject(new Error("WS proxy timed out")), 5000);
    });
    ws.close();

    expect(echoed).toBe("echo:hello-through-the-real-tunnel");
  });

  it("rejects a WebSocket upgrade with an invalid ticket", async () => {
    const ws = new WebSocket(`${baseWsUrl}/ws/vnc/not-a-real-ticket`);
    const failed = await new Promise<boolean>((resolve) => {
      ws.on("open", () => resolve(false));
      ws.on("error", () => resolve(true));
      ws.on("close", () => resolve(true));
    });
    expect(failed).toBe(true);
  });
});
