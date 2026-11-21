import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { addSpend, allRead, asksAboutDevice, costOf, devicesToRefresh, newResults, NO_SPEND, REFRESH_GAP_MS, REFRESH_STALE_MS, spendLine, spendWords } from "./agentRefresh";

// Fake devices only.
const NOW = Date.parse("2026-11-21T12:00:00Z");
const dev = (id: string, readHoursAgo: number | null) =>
  ({ id, name: id, lastSuccessfulScanAt: readHoursAgo === null ? null : new Date(NOW - readHoursAgo * 3600_000).toISOString() }) as StarlinkAccountSummary;

describe("🔄 the agent reads a device again (Nov 21 2026)", () => {
  it("knows a question about the device - Arabic or French", () => {
    expect(asksAboutDevice("متى ينتهي اشتراكي؟")).toBe(true);
    expect(asksAboutDevice("الإنترنت مقطوع")).toBe(true);
    expect(asksAboutDevice("Mon abonnement expire quand ?")).toBe(true);
    expect(asksAboutDevice("السلام عليكم")).toBe(false);
    expect(asksAboutDevice("كم ربحكم")).toBe(false);
  });

  it("reads only stale devices, oldest first, not asked again within 6 hours, at most 2", () => {
    const devices = [dev("fresh", 1), dev("old", 10), dev("never", null), dev("older", 30)];
    expect(devicesToRefresh(devices, {}, NOW).map((d) => d.id)).toEqual(["never", "older"]);
    expect(devicesToRefresh(devices, { never: NOW - 60_000 }, NOW).map((d) => d.id)).toEqual(["older", "old"]);
    expect(devicesToRefresh([dev("old", 10)], { old: NOW - REFRESH_GAP_MS - 1 }, NOW)).toHaveLength(1);
    expect(devicesToRefresh([dev("edge", REFRESH_STALE_MS / 3600_000 - 0.1)], {}, NOW)).toHaveLength(0);
  });

  it("takes only this read's results", () => {
    const pending = [
      { syncId: "s0", accountId: "a", fields: {} },
      { syncId: "s1", accountId: "a", fields: {} },
      { syncId: "s2", accountId: "other", fields: {} },
    ];
    const got = newResults(pending, ["a", "b"], new Set(["s0"]));
    expect(got.map((s) => s.syncId)).toEqual(["s1"]);
    expect(allRead(got, ["a"])).toBe(true);
    expect(allRead(got, ["a", "b"])).toBe(false);
  });
});

describe("💰 the agent's estimated spend", () => {
  it("prices a reply and adds it up per day and month", () => {
    expect(costOf("claude-haiku-5-5", 3000, 200)).toBeCloseTo(0.0004, 6);
    expect(costOf("claude-opus-5-5", 3000, 200)).toBeCloseTo(0.016, 6);
    expect(costOf("unknown", 1000, 1000)).toBe(0);
    let s = addSpend(NO_SPEND, "2026-11-21", 0.01);
    s = addSpend(s, "2026-11-21", 0.02);
    expect(s).toMatchObject({ dayCost: 0.03, monthCost: 0.03, monthCalls: 2 });
    s = addSpend(s, "2026-11-22", 0.01);
    expect(s).toMatchObject({ day: "2026-11-22", dayCost: 0.01, monthCalls: 3 });
    expect(s.monthCost).toBeCloseTo(0.04, 6);
    s = addSpend(s, "2026-12-01", 0.005);
    expect(s).toMatchObject({ month: "2026-12", monthCost: 0.005, monthCalls: 1 });
  });

  it("says it in his words", () => {
    expect(spendWords(0)).toBe("$0");
    expect(spendWords(0.004)).toBe("أقل من سنت");
    expect(spendWords(0.123)).toBe("$0.123");
    expect(spendWords(2.5)).toBe("$2.50");
    const s = addSpend(NO_SPEND, "2026-11-21", 0.05);
    expect(spendLine(s, "2026-11-21")).toBe("💰 استهلاك تقديري: اليوم $0.050 · هذا الشهر $0.050 (1 رد)");
    expect(spendLine(s, "2026-11-22")).toBe("💰 استهلاك تقديري: اليوم $0 · هذا الشهر $0.050 (1 رد)");
  });
});
