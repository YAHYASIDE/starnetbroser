import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { daysLeftLabel, isOutsideHome, outsideHomeDaysLeft, outsideHomeEnd, outsideHomeSchedule } from "./outsideHome";

const at = (local: string) => new Date(`${local}T10:00:00`).toISOString();
const dev = (id: string, days: number | null, readOn = "2026-10-21", extra: Partial<StarlinkAccountSummary> = {}) =>
  ({ id, name: id, outsideHome: days === null ? null : { daysRemaining: days, allowanceDays: 30, readAt: at(readOn) }, ...extra }) as StarlinkAccountSummary;

describe("🌍 outside the home country, day by day (his Oct 21 2026 ask)", () => {
  it("the day it runs out = the day read + the days left; counted down from today", () => {
    const a = dev("a", 9);
    expect(outsideHomeEnd(a)).toBe("2026-10-30");
    expect(outsideHomeDaysLeft(a, "2026-10-21")).toBe(9);
    expect(outsideHomeDaysLeft(a, "2026-10-28")).toBe(2);
    expect(isOutsideHome(dev("b", null))).toBe(false);
    expect(isOutsideHome(dev("c", 5, "2026-10-21", { deletedAt: "x" } as never))).toBe(false);
  });

  it("every day from today to the last, in order, each with its devices; the over ones first", () => {
    const days = outsideHomeSchedule([dev("late", 3), dev("soon", 1), dev("same", 1), dev("over", 2, "2026-10-10"), dev("home", null)], "2026-10-21");
    expect(days.map((d) => [d.date, d.daysLeft, d.accounts.map((a) => a.id)])).toEqual([
      ["2026-10-20", -1, ["over"]],
      ["2026-10-21", 0, []],
      ["2026-10-22", 1, ["soon", "same"]],
      ["2026-10-23", 2, []],
      ["2026-10-24", 3, ["late"]],
    ]);
    expect(outsideHomeSchedule([dev("home", null)], "2026-10-21")).toEqual([]);
  });

  it("in his words", () => {
    expect(daysLeftLabel(0)).toBe("يتوقف اليوم");
    expect(daysLeftLabel(1)).toBe("يتوقف غدًا");
    expect(daysLeftLabel(9)).toBe("بعد 9 أيام");
    expect(daysLeftLabel(-1)).toBe("انتهت أيامه - يُقيَّد الآن");
  });
});
