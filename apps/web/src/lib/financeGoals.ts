/**
 * 🎯 «الأهداف المالية» (his Oct 9 2026 brief, part 4): each goal's target, what is done so far, what
 * is left, the time left, the daily pace it needs and whether he's ahead of it - and an end-of-month
 * forecast that is shown only when the month's days are enough to say something honest.
 *
 * Goals are kept with «أهداف الشهر» (`starnet_goals_v1`, lib/goals.ts). A goal typed in another
 * currency (`goalCurrencies`) is compared in أوقية at TODAY's registered rate, and the rate used is
 * said next to it - never mixed silently. A ceiling (expenses, debts) is good when it stays under.
 * Pure: every «done» figure is handed in, computed by the same functions as the rest of the
 * dashboard (buildPeriodMetrics = «الصافي»).
 */

import type { MoneyGoals } from "./financeAnalysis";
import { toMru, type RatesFromUsd } from "./reportsView";

export type GoalPeriod = "day" | "week" | "month" | "year";

export interface GoalDef {
  key: keyof GoalValues;
  label: string;
  period: GoalPeriod;
  /** Staying under it is the good outcome. */
  ceiling?: boolean;
  /** A count, not money. */
  count?: boolean;
  /** A ceiling on a balance at a moment (not a running period): no daily pace. */
  snapshot?: boolean;
}

/** Every goal he can set (the money ones in `MoneyGoals`, the counts in «أهداف الشهر»). */
export interface GoalValues extends MoneyGoals {
  renewals?: number;
  newClients?: number;
}

export const GOAL_DEFS: GoalDef[] = [
  { key: "profitDayMru", label: "ربح اليوم", period: "day" },
  { key: "profitWeekMru", label: "ربح الأسبوع", period: "week" },
  { key: "profitMonthMru", label: "ربح الشهر", period: "month" },
  { key: "profitYearMru", label: "ربح السنة", period: "year" },
  { key: "collectionDayMru", label: "تحصيل اليوم", period: "day" },
  { key: "collectionMonthMru", label: "تحصيل الشهر", period: "month" },
  { key: "expensesMaxMru", label: "حد مصروفات الشهر", period: "month", ceiling: true },
  { key: "newDebtsMaxMru", label: "حد الديون الجديدة هذا الشهر", period: "month", ceiling: true },
  { key: "openDebtsMaxMru", label: "حد الديون المفتوحة على العملاء", period: "month", ceiling: true, snapshot: true },
  { key: "renewals", label: "عدد التجديدات هذا الشهر", period: "month", count: true },
  { key: "newClients", label: "زبائن جدد هذا الشهر", period: "month", count: true },
];

/** What is done so far, أوقية (counts as numbers). */
export interface GoalActuals {
  profitDay: number;
  profitWeek: number;
  profitMonth: number;
  profitYear: number;
  collectedDay: number;
  collectedMonth: number;
  expensesMonth: number;
  newDebtsMonth: number;
  openDebtsNow?: number;
  renewalsMonth: number;
  newClientsMonth: number;
}

const ACTUAL_OF: Record<keyof GoalValues, keyof GoalActuals> = {
  profitDayMru: "profitDay",
  profitWeekMru: "profitWeek",
  profitMonthMru: "profitMonth",
  profitYearMru: "profitYear",
  collectionDayMru: "collectedDay",
  collectionMonthMru: "collectedMonth",
  expensesMaxMru: "expensesMonth",
  newDebtsMaxMru: "newDebtsMonth",
  openDebtsMaxMru: "openDebtsNow",
  renewals: "renewalsMonth",
  newClients: "newClientsMonth",
};

export type GoalStatus = "progress" | "near" | "done" | "over";

export interface GoalProgressItem {
  key: keyof GoalValues;
  label: string;
  period: GoalPeriod;
  ceiling: boolean;
  count: boolean;
  /** The goal's own currency ("" for a count). */
  currency: string;
  target: number;
  /** In the goal's currency. */
  done: number;
  /** Target − done: still to reach (a ceiling: room left; negative = passed by that much). */
  remaining: number;
  /** done ÷ target, NOT capped (the bar is capped at 100%, the % shown isn't). */
  ratio: number;
  status: GoalStatus;
  /** Days left in the goal's period, today included. */
  daysLeft: number;
  /** What must be done each day left to reach it (not for a ceiling / a snapshot). */
  perDay?: number;
  /** Where an even pace would be by today. */
  expected: number;
  pace: "ahead" | "on" | "behind";
  /** «1 دولار = 40 أوقية (سعر اليوم)» when the goal is in another currency. */
  rateNote?: string;
}

export function periodBounds(period: GoalPeriod, today: string): { from: string; to: string; days: number; elapsed: number } {
  const d = new Date(`${today}T00:00:00Z`);
  const day = (t: Date) => t.toISOString().slice(0, 10);
  let from: Date;
  let to: Date;
  if (period === "day") from = to = d;
  else if (period === "week") {
    // Monday → Sunday.
    const back = (d.getUTCDay() + 6) % 7;
    from = new Date(d.getTime() - back * 86_400_000);
    to = new Date(from.getTime() + 6 * 86_400_000);
  } else if (period === "month") {
    from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  } else {
    from = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    to = new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const elapsed = Math.round((d.getTime() - from.getTime()) / 86_400_000) + 1;
  return { from: day(from), to: day(to), days, elapsed };
}

export function buildGoalProgress(goals: GoalValues & { goalCurrencies?: Partial<Record<keyof GoalValues, string>> }, actuals: GoalActuals, today: string, rates: RatesFromUsd): GoalProgressItem[] {
  const items: GoalProgressItem[] = [];
  for (const def of GOAL_DEFS) {
    const target = goals[def.key];
    if (!target || !(target > 0)) continue;
    const doneRaw = actuals[ACTUAL_OF[def.key]];
    if (doneRaw === undefined) continue;
    const currency = def.count ? "" : goals.goalCurrencies?.[def.key] ?? "MRU";
    let done = doneRaw;
    let rateNote: string | undefined;
    if (currency && currency !== "MRU") {
      const perUnit = toMru(1, currency, rates);
      if (perUnit === undefined || perUnit <= 0) continue; // no rate: never guessed
      done = doneRaw / perUnit;
      rateNote = `1 ${currency} = ${Math.round(perUnit * 100) / 100} أوقية (سعر اليوم)`;
    }
    const ratio = done / target;
    const ceiling = Boolean(def.ceiling);
    const status: GoalStatus = ceiling ? (ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "progress") : ratio >= 1 ? "done" : ratio >= 0.8 ? "near" : "progress";
    const b = periodBounds(def.period, today);
    const daysLeft = b.days - b.elapsed + 1;
    const expected = def.snapshot ? target : (target * b.elapsed) / b.days;
    const remaining = target - done;
    const pace: GoalProgressItem["pace"] = ceiling
      ? done > expected + 1e-9
        ? "behind"
        : "ahead"
      : done >= expected - 1e-9
        ? done > expected * 1.05
          ? "ahead"
          : "on"
        : "behind";
    items.push({
      key: def.key,
      label: def.label,
      period: def.period,
      ceiling,
      count: Boolean(def.count),
      currency,
      target,
      done,
      remaining,
      ratio,
      status,
      daysLeft,
      ...(!ceiling && !def.snapshot && remaining > 0 ? { perDay: remaining / daysLeft } : {}),
      expected,
      pace,
      ...(rateNote ? { rateNote } : {}),
    });
  }
  return items;
}

// ---- End-of-month forecast ----

export type Forecast =
  | {
      ok: true;
      /** Net profit so far this month. */
      soFar: number;
      elapsed: number;
      days: number;
      /** soFar ÷ elapsed. */
      dailyAvg: number;
      /** dailyAvg × days in the month. */
      projected: number;
      goal?: number;
      /** (goal − soFar) ÷ days left - what each remaining day must make. */
      neededPerDay?: number;
      /** projected − goal. */
      gap?: number;
      method: string;
    }
  | { ok: false; reason: string };

/**
 * A straight-line forecast from the month's own days. Not shown (with the reason) before day 5,
 * with fewer than 3 days that had any profit, or when one day makes more than 60% of the month's
 * profit - an average of such a month would mislead.
 */
export function forecastMonth(dailyNet: number[], today: string, goal?: number): Forecast {
  const b = periodBounds("month", today);
  const days = dailyNet.slice(0, b.elapsed);
  const soFar = days.reduce((s, v) => s + v, 0);
  const active = days.filter((v) => Math.abs(v) > 0.5).length;
  if (b.elapsed < 5) return { ok: false, reason: `مرّ ${b.elapsed} أيام فقط من الشهر - التوقع يحتاج 5 أيام على الأقل.` };
  if (active < 3) return { ok: false, reason: `لا توجد بيانات كافية: ${active} يوم فقط فيه ربح هذا الشهر - المتوسط سيكون مضللًا.` };
  const biggest = Math.max(...days.map((v) => Math.abs(v)));
  const absTotal = days.reduce((s, v) => s + Math.abs(v), 0);
  if (absTotal > 0 && biggest / absTotal > 0.6) return { ok: false, reason: "يوم واحد يصنع أكثر من 60% من ربح الشهر - النشاط متقطع، والمتوسط سيكون مضللًا." };
  const dailyAvg = soFar / b.elapsed;
  const projected = dailyAvg * b.days;
  const left = b.days - b.elapsed;
  return {
    ok: true,
    soFar,
    elapsed: b.elapsed,
    days: b.days,
    dailyAvg,
    projected,
    ...(goal && goal > 0 ? { goal, gap: projected - goal, ...(left > 0 ? { neededPerDay: Math.max(0, goal - soFar) / left } : {}) } : {}),
    method: `صافي الربح حتى اليوم ÷ ${b.elapsed} يومًا مضت × ${b.days} يوم الشهر. توقع حسابي، ليس ربحًا محققًا.`,
  };
}

/** The month's days up to today, for forecastMonth (yyyy-mm-dd each). */
export function monthDaysSoFar(today: string): string[] {
  const b = periodBounds("month", today);
  const out: string[] = [];
  for (let i = 0; i < b.elapsed; i++) out.push(new Date(Date.parse(`${b.from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}
