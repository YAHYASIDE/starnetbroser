/**
 * 🎯 أهداف الشهر - the operator sets what he wants each month (renewals, new customers, money
 * collected in one currency) and sees how far along he is and whether he's on pace. Progress is
 * derived from the records every time (never stored). Pure + a small `starnet_` store.
 */

import type { ClientStore } from "./clientStore";
import { isShipmentEntry, type LedgerByAccount } from "./ledgerStore";
import type { MoneyGoals } from "./financeAnalysis";

/** The money goals (أوقية: daily / monthly profit, monthly collection, ceilings on expenses and new
 * debts) live here too - the dashboard's «🎯 الأهداف» (lib/financeAnalysis.ts) reads and sets them. */
export interface MonthlyGoals extends MoneyGoals {
  /** Shipments recorded (renewals + new devices) in the month. */
  renewals?: number;
  newClients?: number;
  collection?: { amount: number; currency: string };
}

export interface GoalProgress {
  key: "renewals" | "newClients" | "collection";
  label: string;
  target: number;
  done: number;
  currency?: string;
  /** done / target, capped at 1. */
  ratio: number;
  /** Where he should be by today if the month is spread evenly. */
  expected: number;
  onPace: boolean;
}

const KEY = "starnet_goals_v1";

export function loadGoals(): MonthlyGoals {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as MonthlyGoals) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveGoals(goals: MonthlyGoals): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(goals));
  } catch {
    // storage full
  }
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m!, 0).getDate();
}

/** `month` yyyy-mm, `today` yyyy-mm-dd (the pace uses today's day when it's in that month). */
export function computeGoalProgress(goals: MonthlyGoals, month: string, today: string, ledger: LedgerByAccount, clients: ClientStore): GoalProgress[] {
  const elapsed = today.startsWith(month) ? Number(today.slice(8, 10)) / daysInMonth(month) : today > month ? 1 : 0;
  let renewals = 0;
  const collected: Record<string, number> = {};
  for (const entries of Object.values(ledger)) {
    for (const entry of entries) {
      if (!entry.date.startsWith(month)) continue;
      if (isShipmentEntry(entry) && !entry.previousDebtId) renewals += 1;
      if (entry.kind === "credit") collected[entry.currency] = (collected[entry.currency] ?? 0) + entry.amount;
    }
  }
  const newClients = Object.values(clients).filter((c) => c.createdAt?.startsWith(month)).length;
  const out: GoalProgress[] = [];
  const push = (key: GoalProgress["key"], label: string, target: number, done: number, currency?: string) => {
    if (!(target > 0)) return;
    const expected = target * elapsed;
    out.push({ key, label, target, done, currency, ratio: Math.min(1, done / target), expected, onPace: done >= expected - 1e-9 });
  };
  push("renewals", "تجديدات وأجهزة", goals.renewals ?? 0, renewals);
  push("newClients", "زبائن جدد", goals.newClients ?? 0, newClients);
  if (goals.collection) push("collection", "التحصيل", goals.collection.amount, collected[goals.collection.currency] ?? 0, goals.collection.currency);
  return out;
}
