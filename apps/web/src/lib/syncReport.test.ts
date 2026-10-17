import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { applyOutcomes, buildSyncReport, outcomeLabel, QUEUE_GAP_SECONDS, RATE_LIMIT_NOTE, signedOutAlert } from "./syncReport";

const accounts = ["a", "b", "c", "d"].map((id) => ({ id, name: `جهاز ${id}` }) as StarlinkAccountSummary);
const queue = { ids: ["a", "b", "c", "d"], index: 0, label: "3 أيام" };

describe("applyOutcomes", () => {
  it("keeps only the queue's devices, the latest outcome wins, and flags a new sign-out once", () => {
    const first = applyOutcomes(queue, [
      { accountId: "a", outcome: "ok" },
      { accountId: "other", outcome: "ok" },
      { accountId: "b", outcome: "signedOut" },
    ]);
    expect(first.queue.results).toEqual({ a: "ok", b: "signedOut" });
    expect(first.newlySignedOut).toEqual(["b"]);
    const again = applyOutcomes(first.queue, [{ accountId: "b", outcome: "signedOut" }, { accountId: "a", outcome: "nothing" }]);
    expect(again.newlySignedOut).toEqual([]);
    expect(again.queue.results).toEqual({ a: "nothing", b: "signedOut" });
  });
});

describe("buildSyncReport", () => {
  it("lists every device tried with its status, and how many were done", () => {
    const done = { ...queue, index: 4, results: { a: "ok", b: "signedOut", c: "stuck" } as const };
    expect(buildSyncReport(done, accounts)).toBe(
      [
        "🔄 انتهت المزامنة (3 أيام): تمت 1 من 4",
        "✅ تمت · جهاز a",
        "🔒 غير مسجّل في Starlink · جهاز b",
        "⏳ تعلّقت - تُخطّيت · جهاز c",
        "❔ بلا نتيجة · جهاز d",
      ].join("\n"),
    );
  });

  it("a stopped run reports only the devices it reached", () => {
    const report = buildSyncReport({ ...queue, index: 1, results: { a: "ok" } }, accounts, true);
    expect(report).toBe("⏹ أُوقفت المزامنة (3 أيام): تمت 1 من 1\n✅ تمت · جهاز a");
  });

  it("labels and the sign-in alert", () => {
    expect(outcomeLabel("closed")).toBe("✋ أُغلقت باليد");
    expect(signedOutAlert(accounts[0])).toContain("«جهاز a» غير مسجّل في Starlink");
  });
});

describe("⏸ Starlink's «429 Too many requests» stops the run (his Oct 17 2026 report)", () => {
  it("a 429 on one device flags the run to stop, and the report says why", () => {
    const applied = applyOutcomes({ ...queue, index: 2 }, [{ accountId: "a", outcome: "ok" }, { accountId: "b", outcome: "rateLimited" }]);
    expect(applied.rateLimited).toBe(true);
    expect(applyOutcomes(queue, [{ accountId: "a", outcome: "ok" }]).rateLimited).toBe(false);
    expect(buildSyncReport(applied.queue, accounts, true)).toBe(
      ["⏹ أُوقفت المزامنة (3 أيام): تمت 1 من 2", "✅ تمت · جهاز a", "⏸ ستارلينك طلبت التمهّل (429) · جهاز b", RATE_LIMIT_NOTE].join("\n"),
    );
    expect(outcomeLabel("rateLimited")).toBe("⏸ ستارلينك طلبت التمهّل (429)");
  });

  it("a visible run waits between devices - never a burst of page loads", () => {
    expect(QUEUE_GAP_SECONDS).toBeGreaterThanOrEqual(8);
  });
});
