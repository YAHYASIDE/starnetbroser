import type { Server } from "http";
import { SessionManager } from "../src/browser/sessionManager";
import { removeProfileVolumeForTests, volumeExists } from "../src/docker/volumes";
import { createTestTargetServer, listenOnFreePort } from "./testTargetServer";

/**
 * The real proof the product spec demands: a real Chromium session,
 * driven through a real login form, survives a full worker-process
 * restart without re-authenticating, a second "device" can open the
 * same running session instead of starting a conflicting one, and two
 * different accounts' cookies never cross - all against a local fake
 * login page (test/testTargetServer.ts), never a real Starlink account
 * and never any secret checked into the repo.
 */
describe("Browser session persistence and isolation (real Chromium)", () => {
  const ACCOUNT_A = "e2e-test-account-a";
  const ACCOUNT_B = "e2e-test-account-b";

  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const listening = await listenOnFreePort(createTestTargetServer());
    server = listening.server;
    baseUrl = listening.baseUrl;
    await removeProfileVolumeForTests(ACCOUNT_A);
    await removeProfileVolumeForTests(ACCOUNT_B);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await removeProfileVolumeForTests(ACCOUNT_A);
    await removeProfileVolumeForTests(ACCOUNT_B);
  });

  it(
    "logs in for real, survives a full worker restart, resumes from a second client, and stays isolated between accounts",
    async () => {
      // --- Phase 1: real login via a real Chromium session, first "worker" instance ---
      let manager = new SessionManager();
      try {
        const started = await manager.start(ACCOUNT_A);
        expect(started.status).toBe("RUNNING");
        expect(started.vncWebSocketPort).toBeGreaterThan(0);

        const page = manager.getPage(ACCOUNT_A);
        expect(page).not.toBeNull();

        await page!.goto(baseUrl);
        expect(await page!.locator("#username").isVisible()).toBe(true);

        await page!.fill("#username", "test-account-a");
        await page!.fill("#password", "pass-a-not-real");
        await page!.click("#submit");
        await page!.waitForSelector("#status");
        expect(await page!.locator("#status").textContent()).toBe("logged-in-as-test-account-a");

        // Stopping the session flushes cookies to the Docker volume and
        // tears down Chromium/Xvfb/x11vnc - nothing about the login is
        // held in this process's memory afterward.
        await manager.stop(ACCOUNT_A);
        expect(await volumeExists(ACCOUNT_A)).toBe(true);
      } finally {
        await manager.stopAll();
      }

      // --- Phase 2: brand new SessionManager = simulated full worker restart ---
      manager = new SessionManager();
      try {
        const restarted = await manager.start(ACCOUNT_A);
        expect(restarted.status).toBe("RUNNING");

        const page = manager.getPage(ACCOUNT_A);
        await page!.goto(baseUrl);
        await page!.waitForSelector("#status");
        // Never called fill/click again - if this passes, the cookie
        // came from the Docker volume, not from in-memory state.
        expect(await page!.locator("#status").textContent()).toBe("logged-in-as-test-account-a");

        // --- Phase 3: a "second device" opens the same account ---
        const resumed = await manager.start(ACCOUNT_A);
        expect(resumed.startedAt).toBe(restarted.startedAt);
        expect(resumed.vncWebSocketPort).toBe(restarted.vncWebSocketPort);

        // --- Phase 4: a second, unrelated account must not see A's login ---
        const startedB = await manager.start(ACCOUNT_B);
        expect(startedB.status).toBe("RUNNING");
        const pageB = manager.getPage(ACCOUNT_B);
        await pageB!.goto(baseUrl);
        expect(await pageB!.locator("#username").isVisible()).toBe(true); // not logged in as A

        await pageB!.fill("#username", "test-account-b");
        await pageB!.fill("#password", "pass-b-not-real");
        await pageB!.click("#submit");
        await pageB!.waitForSelector("#status");
        expect(await pageB!.locator("#status").textContent()).toBe("logged-in-as-test-account-b");

        // A must be completely unaffected by B's login.
        const pageAAgain = manager.getPage(ACCOUNT_A);
        await pageAAgain!.reload();
        await pageAAgain!.waitForSelector("#status");
        expect(await pageAAgain!.locator("#status").textContent()).toBe("logged-in-as-test-account-a");
      } finally {
        await manager.stopAll();
      }
    },
    45000,
  );
});
