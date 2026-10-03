/**
 * "إقفال الشهر": a month's profit report (profit dated on the Starlink payment day, see
 * accountingStore.ts#shipmentProfitDate), each representative's share of it, and a record that
 * the month was closed. Closing never locks or rewrites anything - it only makes editing an
 * operation of that month ask for confirmation first (reopening the month removes the record).
 */

import { computeShipmentProfit, shipmentProfitDate } from "./accountingStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { ltr, type PrintableDocument } from "./pdfDocument";
import { entryUsdToMru } from "./profitMru";
import { shipmentRepShareUsd } from "./repStore";

// ---- Closed months ----

export interface MonthClosing {
  /** yyyy-mm */
  month: string;
  closedAt: string;
}

export type MonthClosings = Record<string, MonthClosing>;

const CLOSINGS_KEY = "starnet_month_closings_v1";

export function loadMonthClosings(): MonthClosings {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CLOSINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as MonthClosings) : {};
  } catch {
    return {};
  }
}

export function saveMonthClosings(closings: MonthClosings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLOSINGS_KEY, JSON.stringify(closings));
}

export function closeMonth(closings: MonthClosings, month: string, now: Date = new Date()): MonthClosings {
  return { ...closings, [month]: { month, closedAt: now.toISOString() } };
}

export function reopenMonth(closings: MonthClosings, month: string): MonthClosings {
  const next = { ...closings };
  delete next[month];
  return next;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The closed months among the given dates (yyyy-mm-dd), sorted, without repeats. */
export function closedMonthsAmong(closings: MonthClosings, dates: (string | undefined)[]): string[] {
  const months = new Set<string>();
  for (const date of dates) {
    if (!date) continue;
    const month = monthOf(date);
    if (closings[month]) months.add(month);
  }
  return Array.from(months).sort();
}

/** The dates that place a ledger entry in a month: its own date, and for a shipment the day
 * Starlink was paid (the day its profit counts). */
export function ledgerEntryMonthDates(entry: LedgerEntry): string[] {
  const dates = [entry.date];
  if (entry.kind === "debit" && entry.starlinkCost?.status === "settled") dates.push(shipmentProfitDate(entry));
  return dates;
}

/** The dates an edit touches: where the entry is now and where the patch would move it. */
export function ledgerEditMonthDates(entry: LedgerEntry, patch: Partial<LedgerEntry> = {}): string[] {
  return [...ledgerEntryMonthDates(entry), ...ledgerEntryMonthDates({ ...entry, ...patch })];
}

/** The question to ask before changing something dated in a closed month, or null when none is. */
export function closedMonthQuestion(closings: MonthClosings, dates: (string | undefined)[]): string | null {
  const months = closedMonthsAmong(closings, dates);
  if (months.length === 0) return null;
  return `هذه العملية في شهر مُقفل (${months.map(monthLabel).join("، ")}). تعديلها يغيّر أرقام تقرير ذلك الشهر. هل تريد المتابعة؟`;
}

/** Asks (window.confirm) before changing something dated in a closed month; true = go ahead. */
export function confirmClosedMonthChange(dates: (string | undefined)[]): boolean {
  if (typeof window === "undefined") return true;
  const question = closedMonthQuestion(loadMonthClosings(), dates);
  return question === null || window.confirm(question);
}

// ---- Months ----

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "سبتمبر 2026" for "2026-09". */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${year}` : month;
}

/** The last `count` months, newest first, starting with today's. */
export function recentMonths(today: string, count = 12): string[] {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return result;
}

export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-31` };
}

// ---- The month's profit report ----

export interface MonthShipmentRow {
  accountId: string;
  entry: LedgerEntry;
  /** The day Starlink was paid - the day this profit counts. */
  profitDate: string;
  profitUsd: number;
  profitMru: number;
  representativeId?: string;
  repShareMru: number;
  /** False when the MRU figure uses today's rate (no rate was locked at payment). */
  exact: boolean;
}

export interface MonthRepShare {
  representativeId: string;
  shipmentCount: number;
  profitMru: number;
  repShareMru: number;
  ourShareMru: number;
}

export interface MonthReport {
  month: string;
  rows: MonthShipmentRow[];
  profitMru: number;
  repSharesMru: number;
  /** What stays with us: profit minus every rep's share. */
  netMru: number;
  reps: MonthRepShare[];
  exact: boolean;
}

/** Every shipment whose Starlink cost was paid in `month`, oldest first, with its profit and rep
 * share in أوقية (each at its own locked rate; today's rate only where none was locked). */
export function buildMonthReport(ledgerStore: LedgerByAccount, month: string, currentMruRate: number): MonthReport {
  const rows: MonthShipmentRow[] = [];
  for (const [accountId, entries] of Object.entries(ledgerStore)) {
    for (const entry of entries) {
      if (entry.kind !== "debit" || entry.starlinkCost?.status !== "settled") continue;
      const profitDate = shipmentProfitDate(entry);
      if (monthOf(profitDate) !== month) continue;
      const profit = computeShipmentProfit(entry);
      if (profit.status !== "computed" || profit.profitUsd === undefined) continue;
      const share = shipmentRepShareUsd(entry) ?? 0;
      rows.push({
        accountId,
        entry,
        profitDate,
        profitUsd: profit.profitUsd,
        profitMru: profit.profitMru ?? profit.profitUsd * currentMruRate,
        representativeId: entry.representativeId,
        repShareMru: entryUsdToMru(share, entry, currentMruRate),
        exact: profit.profitMru !== undefined,
      });
    }
  }
  rows.sort((a, b) =>
    a.profitDate !== b.profitDate ? (a.profitDate < b.profitDate ? -1 : 1) : a.entry.createdAt < b.entry.createdAt ? -1 : 1,
  );

  const reps = new Map<string, MonthRepShare>();
  for (const row of rows) {
    if (!row.representativeId) continue;
    const rep = reps.get(row.representativeId) ?? {
      representativeId: row.representativeId,
      shipmentCount: 0,
      profitMru: 0,
      repShareMru: 0,
      ourShareMru: 0,
    };
    rep.shipmentCount += 1;
    rep.profitMru += row.profitMru;
    rep.repShareMru += row.repShareMru;
    rep.ourShareMru += row.profitMru - row.repShareMru;
    reps.set(row.representativeId, rep);
  }

  const profitMru = rows.reduce((sum, r) => sum + r.profitMru, 0);
  const repSharesMru = rows.reduce((sum, r) => sum + r.repShareMru, 0);
  return {
    month,
    rows,
    profitMru,
    repSharesMru,
    netMru: profitMru - repSharesMru,
    reps: Array.from(reps.values()).sort((a, b) => b.repShareMru - a.repShareMru),
    exact: rows.every((r) => r.exact),
  };
}

function mru(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} أوقية`;
}

export interface MonthReportNames {
  accountName: (accountId: string) => string;
  clientName: (accountId: string) => string | undefined;
  repName: (representativeId: string) => string;
}

/** The owner's month-closing PDF: the totals, each rep's share, then every shipment. */
export function buildMonthReportPdf(report: MonthReport, names: MonthReportNames, closedAt?: string): PrintableDocument {
  return {
    title: "إقفال الشهر",
    partyName: `شهر ${monthLabel(report.month)}`,
    subtitle:
      `الربح محسوب بيوم دفع ستارلينك - ${report.rows.length} شحنة` +
      (closedAt ? ` - أُقفل ${ltr(closedAt.slice(0, 10))}` : ""),
    summary: [
      { label: "ربح الشهر", value: mru(report.profitMru), tone: report.profitMru < 0 ? "due" : "clear" },
      { label: "حصص المندوبين", value: mru(report.repSharesMru), tone: "due" },
      { label: "صافي ربحي", value: mru(report.netMru), tone: report.netMru < 0 ? "due" : "clear" },
      ...report.reps.map((rep) => ({
        label: `حصة ${names.repName(rep.representativeId)} (${rep.shipmentCount} شحنة)`,
        value: mru(rep.repShareMru),
      })),
    ],
    columns: ["يوم الدفع", "الجهاز", "الزبون", "المندوب", "الربح", "حصة المندوب"],
    rows: report.rows.map((row) => [
      ltr(row.profitDate),
      names.accountName(row.accountId),
      names.clientName(row.accountId) ?? "—",
      row.representativeId ? names.repName(row.representativeId) : "—",
      `${row.exact ? "" : "≈ "}${mru(row.profitMru)}`,
      row.representativeId ? mru(row.repShareMru) : "—",
    ]),
    footerNote: report.exact ? undefined : "≈ = محسوب بسعر الأوقية اليوم لأن الشحنة لم يُحفظ لها سعر عند الدفع.",
  };
}
