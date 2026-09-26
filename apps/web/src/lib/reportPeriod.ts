import { shipmentProfitDate } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";

/** The six preset windows the reports page lets the operator pick, each ending today and running
 * back N days/months - "week" through "year" are rolling windows (today minus N), never calendar-
 * aligned (e.g. "month" is NOT "since the 1st"), so the figure always reflects the same span of
 * real time regardless of which day of the month it's viewed on. */
export type ReportPeriod = "today" | "week" | "month" | "quarter" | "halfYear" | "year";

export const REPORT_PERIODS: ReportPeriod[] = ["today", "week", "month", "quarter", "halfYear", "year"];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "اليوم",
  week: "أسبوع",
  month: "شهر",
  quarter: "3 أشهر",
  halfYear: "6 أشهر",
  year: "سنة",
};

/** Midnight (local time) at the start of `period`'s window, ending today. */
export function periodStartDate(period: ReportPeriod, now: Date = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case "today":
      return start;
    case "week":
      start.setDate(start.getDate() - 6);
      return start;
    case "month":
      start.setMonth(start.getMonth() - 1);
      return start;
    case "quarter":
      start.setMonth(start.getMonth() - 3);
      return start;
    case "halfYear":
      start.setMonth(start.getMonth() - 6);
      return start;
    case "year":
      start.setFullYear(start.getFullYear() - 1);
      return start;
  }
}

function parseEntryDate(dateStr: string): Date | null {
  const parsed = new Date(dateStr.replace(/\//g, "-"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Keeps only entries whose `date` falls within `period`'s rolling window (inclusive of today) -
 * an entry with an unparseable date is dropped rather than guessed into the window. Generic over
 * anything with a `date` field (a LedgerEntry, but equally an invoiceStore.ts Invoice) so both the
 * Starlink-ledger and the store's own reports can share one period picker/filter. */
export function filterEntriesByPeriod<T extends { date: string }>(
  entries: T[],
  period: ReportPeriod,
  now: Date = new Date(),
): T[] {
  const start = periodStartDate(period, now);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return entries.filter((entry) => {
    const date = parseEntryDate(entry.date);
    return date !== null && date >= start && date <= endOfToday;
  });
}

/** True when `dateStr` falls in the current calendar month (the 1st through today) - used for the
 * "هذا الشهر" tile, which is deliberately calendar-aligned (unlike the rolling `period` windows
 * above) to match how an operator actually thinks about "this month's" spending. */
export function isThisCalendarMonth(dateStr: string, now: Date = new Date()): boolean {
  const date = parseEntryDate(dateStr);
  if (!date) return false;
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

/** Like filterEntriesByPeriod, but a shipment is placed on the day its profit became real - the
 * day Starlink was paid (accountingStore.ts's shipmentProfitDate) - not the day it was sold. */
export function filterEntriesByProfitDate(entries: LedgerEntry[], period: ReportPeriod, now: Date = new Date()): LedgerEntry[] {
  const keep = new Set(filterEntriesByPeriod(entries.map((e) => ({ id: e.id, date: shipmentProfitDate(e) })), period, now).map((e) => e.id));
  return entries.filter((e) => keep.has(e.id));
}
