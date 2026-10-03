import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { localToday, nextQueuedAccount, pickSyncAccounts, queueProgressLabel, startSyncQueue, syncQueueFor, type SyncWindow } from "./syncQueue";

const TODAY = "2026-10-03";
const FAULT = { reason: "burned", note: "", reportedAt: "2026-09-01" } as StarlinkAccountSummary["deviceFault"];
function device(id: string, rechargeDate: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return { id, name: id, rechargeDate, serviceStatus: "active", ...extra } as StarlinkAccountSummary;
}

const accounts = [
  device("d5", "2026/10/05"),
  device("d3", "2026/10/03"),
  device("d4", "2026/10/04"),
  device("d6", "2026/10/06"),
  device("expired", "2026/09/28"),
  device("stopped", "2026/12/01", { serviceStatus: "suspended" }),
  device("faultyToday", "2026/10/03", { deviceFault: FAULT }),
  device("limitedToday", "2026/10/03", { limitedAccess: true }),
  device("limitedStopped", "2026/12/01", { limitedAccess: true, serviceStatus: "suspended" }),
  device("archived", "2026/10/03", { archivedAt: "2026-09-01" }),
  device("noDate", ""),
  device("new", "2026/11/02", { addedAt: "2026-10-03T09:30:00" }),
  device("newByRep", "2026/11/20", { addedByRepAt: "2026-10-03T12:00:00" }),
  device("old", "2026/11/21", { addedAt: "2026-09-01T09:30:00" }),
];

const ids = (window: SyncWindow) => pickSyncAccounts(accounts, window, TODAY).map((a) => a.id);

describe("«مزامنة الآن» choices", () => {
  it("«اليوم» is today only - no expired, stopped, faulty or limited device", () => {
    expect(ids({ kind: "days", days: 1 })).toEqual(["d3"]);
  });

  it("«3 أيام» is today and the next two days (3, 4, 5)", () => {
    expect(ids({ kind: "days", days: 3 })).toEqual(["d3", "d4", "d5"]);
    expect(ids({ kind: "days", days: 7 })).toEqual(["d3", "d4", "d5", "d6"]);
  });

  it("stopped for billing only, never a limited email", () => {
    expect(ids({ kind: "suspended" })).toEqual(["stopped"]);
  });

  it("added today (by the operator or approved from a rep)", () => {
    expect(ids({ kind: "addedToday" })).toEqual(["new", "newByRep"]);
  });

  it("«كل الأجهزة» is every live device except the faulty and limited ones", () => {
    const all = ids({ kind: "all" });
    expect(all[0]).toBe("stopped");
    expect(all).not.toContain("faultyToday");
    expect(all).not.toContain("limitedToday");
    expect(all).not.toContain("archived");
    expect(all).toContain("noDate");
  });

  it("the faulty and the limited ones each have their own choice", () => {
    expect(ids({ kind: "faulty" })).toEqual(["faultyToday"]);
    expect(ids({ kind: "limited" })).toEqual(["limitedStopped", "limitedToday"]);
  });
});

describe("the queue", () => {
  it("is empty-safe and labelled", () => {
    expect(startSyncQueue([device("x", "2027/01/01")], { kind: "days", days: 3 }, TODAY)).toBeNull();
    const queue = startSyncQueue(accounts, { kind: "days", days: 3 }, TODAY)!;
    expect(queue.label).toBe("3 أيام");
    expect(queueProgressLabel(queue, 1)).toBe("2 / 3");
    expect(syncQueueFor([], "يوم 4")).toBeNull();
  });

  it("skips a device deleted meanwhile and ends after the last one", () => {
    const queue = { ids: ["gone", "d4"], index: 0, label: "" };
    expect(nextQueuedAccount(queue, accounts)).toEqual({ account: accounts[2], index: 1 });
    expect(nextQueuedAccount({ ...queue, index: 2 }, accounts)).toBeNull();
  });

  it("today is the phone's local date", () => {
    expect(localToday(new Date(2026, 9, 3, 23, 30))).toBe("2026-10-03");
  });
});
