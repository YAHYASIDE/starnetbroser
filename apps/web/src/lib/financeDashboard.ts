/**
 * 📊 STAR NET Financial Dashboard (his Oct 9 2026 request, phase 1): the reports' summary - KPI cards,
 * «مقارنة الأداء», «تحليل الأداء الشهري», «من أين جاء صافي الربح». Accuracy first: every profit figure is
 * `buildPeriodNet` (lib/netProfit.ts) - the SAME calculation as «الصافي» and the month closing, only over
 * other days - so a number never differs between screens. Shown in أوقية (his choice): Starlink at each
 * shipment's locked rate, the rest at today's rate (≈, the records keep their own currency).
 *
 * The rules kept apart (his section 7/8/15):
 * - Revenue here is REALIZED: a Starlink renewal counts on the day Starlink was paid (its cost is known),
 *   so revenue − Starlink cost − rep shares + store net − expenses = net profit, exactly.
 * - A renewal whose Starlink cost is still owed (D) is NOT profit: it is «ربح معلّق» (expected) apart.
 * - Money collected (payments) is not revenue and never enters the profit; a debt collected later is
 *   collection, not new profit. Personal expenses are not business expenses.
 * - A figure with nothing behind it is `undefined` → «لا توجد بيانات كافية», never 0 or a guess.
 * Pure.
 */

import { isRenewalEntry } from "./renewals";
import { computeExpectedShipmentProfit } from "./accountingStore";
import type { CashEntryList } from "./cashStore";
import type { InvoiceList } from "./invoiceStore";
import { isShipmentEntry, PAYMENT_METHOD_LABELS, type LedgerByAccount, type PaymentMethod } from "./ledgerStore";
import { buildPeriodNet, type MonthNet } from "./netProfit";
import type { ProfitReset } from "./profitReset";
import type { RepResetPoint } from "./repStore";
import { toMru, type RatesFromUsd } from "./reportsView";
import type { CardTopUpList } from "./starlinkDebt";
import type { StoreTransactionList } from "./storeStore";

export interface DateRange {
  from: string;
  to: string;
}

// ---- Periods (the filter bar) ----

export type DashPeriod = "today" | "yesterday" | "7d" | "month" | "lastMonth" | "3m" | "6m" | "year" | "custom";

export const DASH_PERIODS: { kind: DashPeriod; label: string }[] = [
  { kind: "today", label: "اليوم" },
  { kind: "yesterday", label: "أمس" },
  { kind: "7d", label: "آخر 7 أيام" },
  { kind: "month", label: "هذا الشهر" },
  { kind: "lastMonth", label: "الشهر الماضي" },
  { kind: "3m", label: "آخر 3 أشهر" },
  { kind: "6m", label: "آخر 6 أشهر" },
  { kind: "year", label: "هذه السنة" },
  { kind: "custom", label: "فترة مخصصة" },
];

function parseDay(day: string): Date {
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** The same day `months` months away, clamped to the month's end (31 Oct − 1 month = 30 Sep). */
export function addMonths(day: string, months: number): string {
  const year = Number(day.slice(0, 4));
  const monthIndex = Number(day.slice(5, 7)) - 1 + months;
  const target = new Date(year, monthIndex, 1);
  const d = Math.min(Number(day.slice(8, 10)), lastDayOfMonth(target.getFullYear(), target.getMonth()));
  return dayKey(new Date(target.getFullYear(), target.getMonth(), d));
}

export function periodRange(kind: DashPeriod, today: string, custom?: DateRange): DateRange {
  const month = today.slice(0, 7);
  switch (kind) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: `${month}-01`, to: today };
    case "lastMonth": {
      const first = addMonths(`${month}-01`, -1);
      return { from: first, to: `${first.slice(0, 7)}-${String(lastDayOfMonth(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1)).padStart(2, "0")}` };
    }
    case "3m":
      return { from: addMonths(`${month}-01`, -2), to: today };
    case "6m":
      return { from: addMonths(`${month}-01`, -5), to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      return custom && custom.from && custom.to ? (custom.from <= custom.to ? custom : { from: custom.to, to: custom.from }) : { from: today, to: today };
  }
}

// ---- «مقارنة الأداء» ----

export type CompareMode = "prevDay" | "prevWeek" | "prevMonth" | "prevYear";

export const COMPARE_MODES: { mode: CompareMode; label: string }[] = [
  { mode: "prevMonth", label: "الشهر السابق" },
  { mode: "prevDay", label: "اليوم السابق" },
  { mode: "prevWeek", label: "الأسبوع السابق" },
  { mode: "prevYear", label: "السنة الماضية" },
];

/** His example: 9 Oct 2026 is compared with 9 Sep 2026 («نفس اليوم من الشهر الماضي»). */
export function defaultCompareMode(kind: DashPeriod): CompareMode {
  if (kind === "7d") return "prevWeek";
  if (kind === "3m" || kind === "6m" || kind === "year") return "prevYear";
  return "prevMonth";
}

/** The range to compare with: the same days one day / week / month / year earlier. */
export function compareRange(range: DateRange, mode: CompareMode): DateRange {
  switch (mode) {
    case "prevDay":
      return { from: addDays(range.from, -1), to: addDays(range.to, -1) };
    case "prevWeek":
      return { from: addDays(range.from, -7), to: addDays(range.to, -7) };
    case "prevMonth":
      return { from: addMonths(range.from, -1), to: addMonths(range.to, -1) };
    case "prevYear":
      return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
  }
}

// ---- One period's figures ----

export interface DashInput {
  /** For profit: the ledger as «الصافي» uses it (hidden profit days left out). */
  ledgerStore: LedgerByAccount;
  /** For renewals, collections and pending profit: every record (a hidden profit day still
   * happened). Defaults to `ledgerStore`. */
  activityLedger?: LedgerByAccount;
  invoices: InvoiceList;
  transactions: StoreTransactionList;
  cash: CashEntryList;
  rates: RatesFromUsd;
  cardTopUps?: CardTopUpList;
  profitReset?: ProfitReset | null;
  profitResetByAccount?: Record<string, RepResetPoint | null>;
  /** The customer a device belongs to («عدد العملاء الذين جددوا»); none = the device counts alone. */
  clientOf?: (accountId: string) => string | undefined;
}

export interface MethodTotal {
  method: PaymentMethod | "other";
  label: string;
  mru: number;
  count: number;
}

export interface PeriodMetrics {
  range: DateRange;
  net: MonthNet;
  /** Realized: Starlink renewals whose cost was paid in the period + store sales. */
  revenueMru: number;
  starlinkCostMru: number;
  expensesMru: number;
  netMru: number;
  /** Renewals recorded in the period (by their date, D or not). */
  renewals: number;
  renewedClients: number;
  /** Customers' payments for devices dated in the period - money in, not revenue. */
  collectedMru: number;
  collectedCount: number;
  collectedByMethod: MethodTotal[];
  /** Renewals of the period whose Starlink cost is still owed: profit expected, not realized. */
  pendingProfitMru: number;
  pendingCount: number;
  /** Realized Starlink profit ÷ realized renewals; undefined with none. */
  avgProfitPerRenewalMru?: number;
  /** Net ÷ revenue × 100; undefined with no revenue. */
  marginPct?: number;
  /** Something used today's rate instead of a locked one. */
  approximate: boolean;
  missingCurrencies: string[];
  /** Nothing at all happened in the period. */
  empty: boolean;
}

export function buildPeriodMetrics(input: DashInput, range: DateRange): PeriodMetrics {
  const net = buildPeriodNet({ ...input, from: range.from, to: range.to });
  const inRange = (date: string) => date >= range.from && date <= range.to;
  const mruRate = input.rates.MRU;
  const missing = new Set(net.missingCurrencies);
  let approximate = !net.exact;

  let renewals = 0;
  const clients = new Set<string>();
  let collectedMru = 0;
  let collectedCount = 0;
  const methods = new Map<string, MethodTotal>();
  let pendingProfitMru = 0;
  let pendingCount = 0;
  for (const [accountId, entries] of Object.entries(input.activityLedger ?? input.ledgerStore)) {
    for (const entry of entries) {
      if (!inRange(entry.date)) continue;
      if (entry.kind === "credit") {
        const value = toMru(entry.amount, entry.currency, input.rates);
        if (value === undefined) {
          missing.add(entry.currency);
          continue;
        }
        if (entry.currency !== "MRU") approximate = true;
        collectedMru += value;
        collectedCount += 1;
        const method = entry.paymentMethod ?? "other";
        const row = methods.get(method) ?? { method, label: entry.paymentMethod ? PAYMENT_METHOD_LABELS[entry.paymentMethod] : "بدون وسيلة", mru: 0, count: 0 };
        row.mru += value;
        row.count += 1;
        methods.set(method, row);
        continue;
      }
      if (!isShipmentEntry(entry)) continue;
      if (isRenewalEntry(entry, entries)) {
        renewals += 1;
        clients.add(input.clientOf?.(accountId) ?? `device:${accountId}`);
      }
      const expected = computeExpectedShipmentProfit(entry);
      if (expected.status === "expected" && expected.profitUsd !== undefined && mruRate) {
        pendingProfitMru += expected.profitUsd * mruRate;
        pendingCount += 1;
        approximate = true;
      }
    }
  }

  const revenueMru = net.starlinkSalesMru + net.storeSalesMru;
  const empty = revenueMru === 0 && net.expensesMru === 0 && renewals === 0 && collectedCount === 0 && net.storeCogsMru === 0;
  return {
    range,
    net,
    revenueMru,
    starlinkCostMru: net.starlinkCostMru,
    expensesMru: net.expensesMru,
    netMru: net.netMru,
    renewals,
    renewedClients: clients.size,
    collectedMru,
    collectedCount,
    collectedByMethod: [...methods.values()].sort((a, b) => b.mru - a.mru),
    pendingProfitMru,
    pendingCount,
    avgProfitPerRenewalMru: net.starlinkShipments > 0 ? net.starlinkProfitMru / net.starlinkShipments : undefined,
    marginPct: revenueMru > 0 ? (net.netMru / revenueMru) * 100 : undefined,
    approximate,
    missingCurrencies: [...missing],
    empty,
  };
}

// ---- Comparison rows ----

export interface CompareRow {
  key: string;
  label: string;
  current: number;
  previous: number;
  diff: number;
  /** % change; null when the previous value is 0 or negative («لا توجد قاعدة مقارنة»). */
  pct: number | null;
  /** True when going up is good (false for expenses). */
  upIsGood: boolean;
  /** A count, not money. */
  count?: boolean;
}

export function changePct(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

export function buildComparison(current: PeriodMetrics, previous: PeriodMetrics): CompareRow[] {
  const row = (key: string, label: string, a: number, b: number, upIsGood = true, count = false): CompareRow => ({
    key,
    label,
    current: a,
    previous: b,
    diff: a - b,
    pct: changePct(a, b),
    upIsGood,
    ...(count ? { count: true } : {}),
  });
  return [
    row("revenue", "الإيرادات المحققة", current.revenueMru, previous.revenueMru),
    row("net", "صافي الربح", current.netMru, previous.netMru),
    row("expenses", "المصروفات", current.expensesMru, previous.expensesMru, false),
    row("renewals", "عمليات التجديد", current.renewals, previous.renewals, true, true),
    row("collected", "المحصّل من العملاء", current.collectedMru, previous.collectedMru),
    row("clients", "عملاء جدّدوا", current.renewedClients, previous.renewedClients, true, true),
  ];
}

// ---- «تحليل الأداء الشهري» ----

export type MonthMetricKey = "net" | "revenue" | "expenses" | "starlinkCost" | "collected" | "renewals";

export const MONTH_METRICS: { key: MonthMetricKey; label: string; count?: boolean }[] = [
  { key: "net", label: "صافي الربح" },
  { key: "revenue", label: "الإيرادات" },
  { key: "expenses", label: "المصروفات" },
  { key: "starlinkCost", label: "تكلفة ستارلينك" },
  { key: "collected", label: "المحصّل" },
  { key: "renewals", label: "التجديدات", count: true },
];

export function metricValue(m: PeriodMetrics, key: MonthMetricKey): number {
  switch (key) {
    case "net":
      return m.netMru;
    case "revenue":
      return m.revenueMru;
    case "expenses":
      return m.expensesMru;
    case "starlinkCost":
      return m.starlinkCostMru;
    case "collected":
      return m.collectedMru;
    case "renewals":
      return m.renewals;
  }
}

export interface MonthPoint {
  month: string;
  metrics: PeriodMetrics;
  /** Net change vs the month before, % (null without a positive base). */
  growthPct: number | null;
  future: boolean;
}

export interface YearAnalysis {
  year: number;
  months: MonthPoint[];
  /** Among months that had any activity; undefined when none did. */
  best?: MonthPoint;
  worst?: MonthPoint;
}

/** January → December of `year` (months after `today` marked future, left empty). */
export function buildYearAnalysis(input: DashInput, year: number, today: string): YearAnalysis {
  const months: MonthPoint[] = [];
  let previousNet: number | undefined;
  for (let m = 1; m <= 12; m += 1) {
    const month = `${year}-${String(m).padStart(2, "0")}`;
    const from = `${month}-01`;
    const future = from > today;
    const to = `${month}-${String(lastDayOfMonth(year, m - 1)).padStart(2, "0")}`;
    const metrics = buildPeriodMetrics(input, { from, to: to > today ? today : to });
    months.push({ month, metrics, growthPct: previousNet === undefined ? null : changePct(metrics.netMru, previousNet), future });
    previousNet = metrics.netMru;
  }
  const active = months.filter((p) => !p.future && !p.metrics.empty);
  const best = active.reduce<MonthPoint | undefined>((a, p) => (!a || p.metrics.netMru > a.metrics.netMru ? p : a), undefined);
  const worst = active.reduce<MonthPoint | undefined>((a, p) => (!a || p.metrics.netMru < a.metrics.netMru ? p : a), undefined);
  return { year, months, best, worst: active.length > 1 ? worst : undefined };
}
