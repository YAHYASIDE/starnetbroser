import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { nextQueuedAccount, pickSyncAccounts, queueProgressLabel, startSyncQueue } from "./syncQueue";

const TODAY = "2026-10-03";
function device(id: string, rechargeDate: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return { id, name: id, rechargeDate, serviceStatus: "active", ...extra } as StarlinkAccountSummary;
}

const accounts = [
  device("in10", "2026/10/13"),
  device("today", "2026/10/03"),
  device("in3", "2026/10/06"),
  device("stopped", "2026/12/01", { serviceStatus: "suspended" }),
  device("expired5", "2026/09/28"),
  device("expiredLongAgo", "2026/06/01"),
  device("in25", "2026/10/28"),
  device("faulty", "2026/10/04", { deviceFault: { at: "2026-09-01" } as never }),
  device("archived", "2026/10/04", { archivedAt: "2026-09-01" }),
  device("noDate", ""),
];

const ids = (list: StarlinkAccountSummary[]) => list.map((a) => a.id);

describe("pickSyncAccounts - the «مزامنة الآن» windows", () => {
  it("today: stopped first, then those ran out in the last month and ending today", () => {
    expect(ids(pickSyncAccounts(accounts, 0, TODAY))).toEqual(["stopped", "expired5", "today"]);
  });

  it("3 / 10 days include everything up to that day, never a faulty or archived device", () => {
    expect(ids(pickSyncAccounts(accounts, 3, TODAY))).toEqual(["stopped", "expired5", "today", "in3"]);
    expect(ids(pickSyncAccounts(accounts, 10, TODAY))).toEqual(["stopped", "expired5", "today", "in3", "in10"]);
  });

  it("a device that ran out months ago is left to «كل الأجهزة»", () => {
    expect(ids(pickSyncAccounts(accounts, 20, TODAY))).not.toContain("expiredLongAgo");
  });

  it("all: every live device (faulty and undated too), archived never", () => {
    const all = ids(pickSyncAccounts(accounts, "all", TODAY));
    expect(all).toHaveLength(9);
    expect(all).toContain("faulty");
    expect(all).toContain("noDate");
    expect(all).not.toContain("archived");
    expect(all[0]).toBe("stopped");
    expect(all[all.length - 1]).toBe("noDate");
  });
});

describe("the queue", () => {
  it("is empty-safe and labelled", () => {
    expect(startSyncQueue([device("x", "2027/01/01")], 3, TODAY)).toBeNull();
    const queue = startSyncQueue(accounts, 3, TODAY)!;
    expect(queue.label).toBe("3 أيام");
    expect(queueProgressLabel(queue, 2)).toBe("3 / 4");
  });

  it("skips a device deleted meanwhile and ends after the last one", () => {
    const queue = { ids: ["gone", "in3"], index: 0, label: "" };
    expect(nextQueuedAccount(queue, accounts)).toEqual({ account: accounts[2], index: 1 });
    expect(nextQueuedAccount({ ...queue, index: 2 }, accounts)).toBeNull();
  });
});
