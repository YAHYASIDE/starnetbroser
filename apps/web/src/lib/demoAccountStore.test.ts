// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { commitDemoAccounts, LINK_REMOVED_EVENT, loadDemoAccounts } from "./demoAccountStore";

const dev = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: id, ...extra }) as StarlinkAccountSummary;
const KEY = "starnet_demo_accounts_v1";

describe("🔗 commitDemoAccounts", () => {
  beforeEach(() => window.localStorage.clear());

  it("a Starlink read saved from an older list keeps the customer linked meanwhile", () => {
    const older = [dev("d1"), dev("d2")];
    window.localStorage.setItem(KEY, JSON.stringify([dev("d1", { clientId: "c1" }), dev("d2")]));
    const removed: unknown[] = [];
    const listen = (e: Event) => removed.push((e as CustomEvent).detail);
    window.addEventListener(LINK_REMOVED_EVENT, listen);
    const saved = commitDemoAccounts(older, [dev("d1", { rechargeDate: "2026/10/16" }), dev("d2")], "sync");
    window.removeEventListener(LINK_REMOVED_EVENT, listen);
    expect(saved[0]).toEqual(dev("d1", { clientId: "c1", rechargeDate: "2026/10/16" }));
    expect(loadDemoAccounts([])).toEqual(saved);
    expect(removed).toEqual([]);
  });

  it("a link taken off by something other than him is reported (🔔); his own unlink is not", () => {
    const linked = [dev("d1", { clientId: "c1" })];
    window.localStorage.setItem(KEY, JSON.stringify(linked));
    const removed: { source: string }[] = [];
    const listen = (e: Event) => removed.push((e as CustomEvent).detail);
    window.addEventListener(LINK_REMOVED_EVENT, listen);
    commitDemoAccounts(linked, [dev("d1")], "sync");
    window.localStorage.setItem(KEY, JSON.stringify(linked));
    commitDemoAccounts(linked, [dev("d1")], "edit", { unlink: true });
    window.removeEventListener(LINK_REMOVED_EVENT, listen);
    expect(removed).toEqual([{ source: "sync", devices: [{ id: "d1", name: "d1", clientId: "c1" }] }]);
  });

  it("nothing stored yet: the list is saved as is", () => {
    expect(commitDemoAccounts([], [dev("d1")], "edit")).toEqual([dev("d1")]);
    expect(loadDemoAccounts([])).toEqual([dev("d1")]);
  });
});
