/**
 * 💸 المصاريف حسب الفئة - the operator's own expenses (standalone cash "out" entries: rent,
 * transport, fuel...) for a month, grouped by category per currency (never mixed), with last
 * month next to it. Pure.
 */

import { type CashEntryList, listStandaloneCashEntries } from "./cashStore";

export interface ExpenseCategoryRow {
  category: string;
  amount: number;
  previous: number;
  count: number;
}

/** currency -> rows (biggest first) */
export type ExpenseReport = Record<string, { total: number; previousTotal: number; rows: ExpenseCategoryRow[] }>;

export const UNCATEGORISED = "بدون فئة";

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y!, m! - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildExpenseReport(cash: CashEntryList, month: string): ExpenseReport {
  const prev = previousMonth(month);
  const report: ExpenseReport = {};
  for (const entry of listStandaloneCashEntries(cash)) {
    if (entry.kind !== "out") continue;
    const isNow = entry.date.startsWith(month);
    const isPrev = entry.date.startsWith(prev);
    if (!isNow && !isPrev) continue;
    const bucket = (report[entry.currencyCode] ??= { total: 0, previousTotal: 0, rows: [] });
    const category = entry.category?.trim() || UNCATEGORISED;
    let row = bucket.rows.find((r) => r.category === category);
    if (!row) {
      row = { category, amount: 0, previous: 0, count: 0 };
      bucket.rows.push(row);
    }
    if (isNow) {
      row.amount += entry.amount;
      row.count += 1;
      bucket.total += entry.amount;
    } else {
      row.previous += entry.amount;
      bucket.previousTotal += entry.amount;
    }
  }
  for (const bucket of Object.values(report)) bucket.rows.sort((a, b) => b.amount - a.amount || b.previous - a.previous);
  return report;
}
