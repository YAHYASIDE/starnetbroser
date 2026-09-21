import { describe, expect, it } from "vitest";
import { LocalBrowserWeb } from "./web";

/**
 * The web build (GitHub Pages) has no native WebView and therefore no way
 * to give two accounts isolated cookie jars. This locks down the one
 * safety property that matters here: the web fallback must never resolve
 * openAccountBrowser() as if an isolated session was opened - a silent
 * success would be indistinguishable from a real isolated browser to the
 * caller, and could lead to two accounts sharing state.
 */
describe("LocalBrowserWeb", () => {
  it("reports Multi-Profile as unsupported", async () => {
    const plugin = new LocalBrowserWeb();
    await expect(plugin.isSupported()).resolves.toEqual({ supported: false });
  });

  it("rejects openAccountBrowser instead of silently opening a shared session", async () => {
    const plugin = new LocalBrowserWeb();
    await expect(
      plugin.openAccountBrowser({ accountId: "acc-1", accountName: "Test" }),
    ).rejects.toThrow();
  });

  it("never reports a session as deleted (there is nothing native to delete)", async () => {
    const plugin = new LocalBrowserWeb();
    await expect(plugin.deleteAccountSession({ accountId: "acc-1" })).resolves.toEqual({
      deleted: false,
    });
  });

  it("always reports an empty pending-sync list (there is no native staging store)", async () => {
    const plugin = new LocalBrowserWeb();
    await expect(plugin.listPendingAccountSyncs()).resolves.toEqual({ syncs: [] });
  });

  it("accepts ackPendingAccountSyncs as a harmless no-op", async () => {
    const plugin = new LocalBrowserWeb();
    await expect(plugin.ackPendingAccountSyncs({ syncIds: ["sync-1"] })).resolves.toBeUndefined();
  });
});
