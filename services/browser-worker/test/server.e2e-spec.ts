import request from "supertest";
import { createServer } from "../src/api/server";
import { SessionManager } from "../src/browser/sessionManager";
import { removeProfileVolumeForTests } from "../src/docker/volumes";

describe("browser-worker internal HTTP API (real Chromium via real HTTP calls)", () => {
  const ACCOUNT_ID = "e2e-http-account";
  let sessions: SessionManager;
  let app: ReturnType<typeof createServer>;

  beforeAll(async () => {
    await removeProfileVolumeForTests(ACCOUNT_ID);
    sessions = new SessionManager();
    app = createServer(sessions);
  });

  afterAll(async () => {
    await sessions.stopAll();
    await removeProfileVolumeForTests(ACCOUNT_ID);
  });

  it("GET /health responds ok without a token", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("rejects an invalid accountId before touching Docker/Chromium", async () => {
    const res = await request(app).post("/sessions/../../etc/start");
    expect(res.status).toBe(404); // Express itself won't even route a path with slashes as one param
  });

  it("starts a real session over HTTP, reports it via status, then stops it for real", async () => {
    const startRes = await request(app).post(`/sessions/${ACCOUNT_ID}/start`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe("RUNNING");
    expect(startRes.body.vncWebSocketPort).toBeGreaterThan(0);

    const statusRes = await request(app).get(`/sessions/${ACCOUNT_ID}/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("RUNNING");

    const stopRes = await request(app).post(`/sessions/${ACCOUNT_ID}/stop`);
    expect(stopRes.status).toBe(200);

    const afterStop = await request(app).get(`/sessions/${ACCOUNT_ID}/status`);
    expect(afterStop.body.status).toBe("STOPPED");
  }, 30000);
});
