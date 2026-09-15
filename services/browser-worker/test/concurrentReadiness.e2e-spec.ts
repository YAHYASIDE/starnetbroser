import { WebSocket } from "ws";
import { SessionManager } from "../src/browser/sessionManager";
import { removeProfileVolumeForTests } from "../src/docker/volumes";

/**
 * Regression test for a real bug found via manual testing: x11vnc/
 * websockify readiness was a fixed sleep (300-400ms), which was long
 * enough when nothing else was running, but under concurrent load
 * (several sessions' Xvfb/Chromium/x11vnc/websockify competing for CPU
 * at once) the real startup time exceeded that, and a client connecting
 * immediately after start() resolved got a connection reset. Fixed by
 * polling for the port to actually accept connections instead of
 * guessing a fixed delay - see src/vnc/waitForPort.ts.
 */
describe("Concurrent session start readiness (real Chromium/Xvfb/x11vnc/websockify)", () => {
  const ACCOUNT_IDS = ["e2e-race-a", "e2e-race-b", "e2e-race-c"];
  let manager: SessionManager;

  beforeAll(async () => {
    for (const id of ACCOUNT_IDS) await removeProfileVolumeForTests(id);
  });

  afterAll(async () => {
    await manager.stopAll();
    for (const id of ACCOUNT_IDS) await removeProfileVolumeForTests(id);
  });

  it("every session's VNC WebSocket port is immediately connectable the instant start() resolves, even started concurrently", async () => {
    manager = new SessionManager();

    const infos = await Promise.all(ACCOUNT_IDS.map((id) => manager.start(id)));

    // No delay here on purpose - this is exactly the race the real bug
    // hit: connecting the moment start() resolves, not "a bit later."
    const results = await Promise.all(
      infos.map(
        (info) =>
          new Promise<string>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${info.vncWebSocketPort}`);
            const timer = setTimeout(() => reject(new Error(`timed out waiting on port ${info.vncWebSocketPort}`)), 8000);
            ws.on("message", (data) => {
              clearTimeout(timer);
              ws.close();
              resolve(data.toString("latin1"));
            });
            ws.on("error", (err) => {
              clearTimeout(timer);
              reject(err);
            });
          }),
      ),
    );

    for (const greeting of results) {
      expect(greeting).toBe("RFB 003.008\n");
    }
  }, 60000);
});
