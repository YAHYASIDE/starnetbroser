import { describe, expect, it } from "vitest";
import { buildGoalProgress, forecastMonth, monthDaysSoFar, periodBounds, type GoalActuals } from "./financeGoals";

const rates = { USD: 1, MRU: 40 };
const T = "2026-10-09"; // a Friday
const actuals: GoalActuals = {
  profitDay: 1200,
  profitWeek: 5000,
  profitMonth: 40000,
  profitYear: 300000,
  collectedDay: 0,
  collectedMonth: 52000,
  expensesMonth: 12000,
  newDebtsMonth: 9000,
  openDebtsNow: 80000,
  renewalsMonth: 14,
  newClientsMonth: 2,
};

describe("periodBounds", () => {
  it("week = Monday → Sunday, month and year calendar", () => {
    expect(periodBounds("week", T)).toEqual({ from: "2026-10-05", to: "2026-10-11", days: 7, elapsed: 5 });
    expect(periodBounds("month", T)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31, elapsed: 9 });
    expect(periodBounds("year", T)).toMatchObject({ days: 365, elapsed: 282 });
  });
});

describe("buildGoalProgress", () => {
  it("his example: 100,000 a month, 40,000 so far → 40%, 60,000 left, the daily pace needed", () => {
    const [g] = buildGoalProgress({ profitMonthMru: 100000 }, actuals, T, rates);
    expect(g).toMatchObject({ label: "ربح الشهر", target: 100000, done: 40000, remaining: 60000, ratio: 0.4, status: "progress", daysLeft: 23 });
    expect(g!.perDay).toBeCloseTo(60000 / 23);
    // An even month would be at 9/31 of it by today: 29,032 → he's ahead.
    expect(g!.expected).toBeCloseTo(29032.26, 1);
    expect(g!.pace).toBe("ahead");
  });

  it("passing a goal shows the real % (not capped); a ceiling passed is «over», lower is good", () => {
    const items = buildGoalProgress({ collectionMonthMru: 40000, expensesMaxMru: 10000, openDebtsMaxMru: 100000 }, actuals, T, rates);
    expect(items.find((g) => g.key === "collectionMonthMru")).toMatchObject({ ratio: 1.3, status: "done" });
    expect(items.find((g) => g.key === "expensesMaxMru")).toMatchObject({ ratio: 1.2, status: "over", ceiling: true, remaining: -2000, pace: "behind" });
    expect(items.find((g) => g.key === "openDebtsMaxMru")).toMatchObject({ status: "near" });
    expect(items.find((g) => g.key === "openDebtsMaxMru")!.perDay).toBeUndefined();
  });

  it("a goal in dollars is compared at today's rate and says it; no rate → not shown", () => {
    const [g] = buildGoalProgress({ profitMonthMru: 2000, goalCurrencies: { profitMonthMru: "USD" } }, actuals, T, rates);
    expect(g).toMatchObject({ currency: "USD", done: 1000, ratio: 0.5, rateNote: "1 USD = 40 أوقية (سعر اليوم)" });
    expect(buildGoalProgress({ profitMonthMru: 2000, goalCurrencies: { profitMonthMru: "EUR" } }, actuals, T, rates)).toEqual([]);
  });

  it("counts (renewals, new customers) have no currency", () => {
    const items = buildGoalProgress({ renewals: 20, newClients: 2 }, actuals, T, rates);
    expect(items.map((g) => [g.key, g.currency, g.status])).toEqual([
      ["renewals", "", "progress"],
      ["newClients", "", "done"],
    ]);
  });
});

describe("forecastMonth", () => {
  it("projects the month from its own days, says how, and what each day left must make", () => {
    const f = forecastMonth([1000, 2000, 0, 1500, 1500, 1000, 2000, 0, 0], T, 60000);
    expect(f).toMatchObject({ ok: true, soFar: 9000, elapsed: 9, days: 31, dailyAvg: 1000, projected: 31000, gap: -29000 });
    if (f.ok) {
      expect(f.neededPerDay).toBeCloseTo(51000 / 22);
      expect(f.method).toContain("ليس ربحًا محققًا");
    }
  });

  it("is not shown before day 5, with too few active days, or when one day carries the month", () => {
    expect(forecastMonth([5000, 1000, 1000], "2026-10-03")).toMatchObject({ ok: false });
    expect(forecastMonth([5000, 0, 0, 0, 0, 0, 1000, 0, 0], T)).toMatchObject({ ok: false, reason: expect.stringContaining("لا توجد بيانات كافية") });
    expect(forecastMonth([20000, 500, 500, 500, 0, 0, 0, 0, 0], T)).toMatchObject({ ok: false, reason: expect.stringContaining("متقطع") });
  });

  it("monthDaysSoFar lists the month's days up to today", () => {
    expect(monthDaysSoFar("2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });
});
