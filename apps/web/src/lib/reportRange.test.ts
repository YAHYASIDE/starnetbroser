import { describe, expect, it } from "vitest";
import { canGoForward, inWindow, previousWindow, rangeForDay, rangeLabel, rangeWindow, shiftRange, windowSeries } from "./reportRange";

const today = "2026-10-22";

describe("📅 the reports period bar", () => {
  it("a week = the 7 days ending on the day, a month = 30", () => {
    expect(rangeWindow({ span: "day", end: today })).toEqual({ from: today, to: today });
    expect(rangeWindow({ span: "week", end: today })).toEqual({ from: "2026-10-16", to: today });
    expect(rangeWindow({ span: "month", end: today })).toEqual({ from: "2026-09-23", to: today });
    expect(previousWindow({ span: "week", end: today })).toEqual({ from: "2026-10-09", to: "2026-10-15" });
  });

  it("‹ steps back a whole window, › never passes today", () => {
    expect(shiftRange({ span: "day", end: today }, -1, today)).toEqual({ span: "day", end: "2026-10-21" });
    expect(shiftRange({ span: "week", end: today }, -1, today).end).toBe("2026-10-15");
    expect(shiftRange({ span: "month", end: "2026-10-10" }, 1, today).end).toBe(today);
    expect(canGoForward({ span: "day", end: today }, today)).toBe(false);
    expect(canGoForward({ span: "day", end: "2026-10-21" }, today)).toBe(true);
  });

  it("📅 a chosen day shows that day; a future one is today", () => {
    expect(rangeForDay("2026-10-15", today)).toEqual({ span: "day", end: "2026-10-15" });
    expect(rangeForDay("2026-11-01", today)).toEqual({ span: "day", end: today });
    expect(rangeForDay("", today)).toEqual({ span: "day", end: today });
  });

  it("labels in his words", () => {
    expect(rangeLabel({ span: "day", end: today }, today)).toBe("اليوم");
    expect(rangeLabel({ span: "day", end: "2026-10-21" }, today)).toBe("أمس");
    expect(rangeLabel({ span: "day", end: "2026-10-15" }, today)).toBe("الخميس 15 أكتوبر");
    expect(rangeLabel({ span: "week", end: today }, today)).toBe("16 - 22 أكتوبر");
    expect(rangeLabel({ span: "month", end: today }, today)).toBe("23 سبتمبر - 22 أكتوبر");
    expect(rangeLabel({ span: "week", end: "2026-01-03" }, today)).toBe("28 ديسمبر 2025 - 3 يناير 2026");
  });

  it("inWindow reads yyyy-mm-dd and yyyy/mm/dd, drops a bad date", () => {
    const w = { from: "2026-10-16", to: today };
    expect(inWindow("2026-10-16", w)).toBe(true);
    expect(inWindow("2026/10/22", w)).toBe(true);
    expect(inWindow("2026-10-23T01:00:00Z", w)).toBe(false);
    expect(inWindow("", w)).toBe(false);
  });

  it("series day by day, empty days included", () => {
    const points = windowSeries([{ date: "2026-10-21", value: 5 }, { date: "2026-10-21", value: 2 }, { date: "2026-09-01", value: 9 }], { from: "2026-10-20", to: today });
    expect(points.map((p) => [p.label, p.value])).toEqual([["20", 0], ["21", 7], ["22", 0]]);
  });
});
