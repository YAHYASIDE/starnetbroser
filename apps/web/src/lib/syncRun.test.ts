// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { endRun, isRunOver, loadSyncRun, retryIds, runCaption, runCounts, runFill, runRows, RUN_QUIET_MS, saveSyncRun, startRun, withChanges, withCurrent, withOutcomes } from "./syncRun";

const devices = [
  { id: "a", name: "جهاز أ" },
  { id: "b", name: "جهاز ب" },
  { id: "c", name: "جهاز ج" },
];

describe("🟩 the sync run's live line", () => {
  it("fills as the devices finish, the one being read on it", () => {
    let run = startRun(devices, "اليوم", "visible", 1000);
    expect(runFill(run, 1000)).toBe(0);
    run = withCurrent(run, "a", 1100);
    expect(runCaption(run, 1100)).toBe("جهاز أ · 1/3");
    run = withOutcomes(run, [{ accountId: "a", outcome: "ok" }, { accountId: "zz", outcome: "ok" }], 1200);
    expect(run.current).toBeUndefined();
    expect(runFill(run, 1200)).toBeCloseTo(1 / 3);
    run = withOutcomes(run, [{ accountId: "b", outcome: "signedOut" }, { accountId: "c", outcome: "nothing" }], 1300);
    expect(run.endedAt).toBe(1300);
    expect(runFill(run, 1300)).toBe(1);
    expect(runCaption(run, 1300)).toBe("✓ انتهت 3/3 · ❌ 1");
    expect(runCounts(run)).toMatchObject({ total: 3, done: 3, ok: 1, nothing: 1, failed: 1, pending: 0 });
  });

  it("details: failed first with the problem, then not finished, then done with its changes", () => {
    let run = startRun(devices, "اليوم", "visible", 0);
    run = withOutcomes(run, [{ accountId: "a", outcome: "ok" }, { accountId: "b", outcome: "stuck" }], 1);
    run = withChanges(run, [{ accountId: "a", updatedCount: 3 }], 2).run;
    let rows = runRows(run);
    expect(rows.map((r) => [r.id, r.state])).toEqual([["b", "failed"], ["c", "pending"], ["a", "ok"]]);
    expect(rows[0]!.problem).toContain("دقيقتين");
    expect(rows[2]!.status).toBe("✅ تمت · 3 حقول");
    expect(rows[1]!.status).toBe("⏳ في الانتظار");
    run = endRun(run, 3);
    rows = runRows(run);
    expect(rows[1]!.status).toBe("⏹ لم يُحدَّث");
    expect(retryIds(run)).toEqual(["b", "c"]);
  });

  it("🧭 a background run keeps what each page gave, per device", () => {
    let run = startRun(devices, "اليوم", "background", 0);
    run = withOutcomes(run, [{ accountId: "a", outcome: "nothing", trace: "⏳ دخول 4ث · الأجهزة ⚪ 7ث" }], 1);
    expect(runRows(run).find((r) => r.id === "a")!.trace).toBe("⏳ دخول 4ث · الأجهزة ⚪ 7ث");
    expect(runRows(run).find((r) => r.id === "b")!.trace).toBeUndefined();
  });

  it("a read's bubble is absorbed only when all its devices are this run's", () => {
    const run = startRun(devices, "اليوم", "background", 0);
    expect(withChanges(run, [{ accountId: "a", updatedCount: 0 }]).absorbed).toBe(true);
    expect(withChanges(run, [{ accountId: "x", updatedCount: 2 }]).absorbed).toBe(false);
  });

  it("a background run gone quiet (stopped from its notification) is over", () => {
    const run = startRun(devices, "اليوم", "background", 0);
    expect(isRunOver(run, RUN_QUIET_MS - 1)).toBe(false);
    expect(isRunOver(run, RUN_QUIET_MS + 1)).toBe(true);
    expect(isRunOver(startRun(devices, "x", "visible", 0), RUN_QUIET_MS * 3)).toBe(false);
  });

  it("kept on the phone", () => {
    const run = startRun(devices, "اليوم", "visible", 0);
    saveSyncRun(run);
    expect(loadSyncRun()).toEqual(run);
    saveSyncRun(null);
    expect(loadSyncRun()).toBeNull();
  });
});
