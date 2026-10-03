/**
 * The reports page's figures, shown in أوقية: today's registered rates turn any currency into
 * MRU for display only (marked ≈ where it matters) - the stored records keep their own currency.
 * Also the chart buckets and the "most profitable" rankings.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeShipmentProfit, shipmentProfitDate } from "./accountingStore";
import type { Invoice } from "./invoiceStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { buildRepPeriodStatement, makeRepConverter, splitRepRecords } from "./repAccount";
import { buildRepDailyStatement, listRepDeviceCommissions, type Representative, type RepSettlementList } from "./repStore";
import { periodStartDate, type ReportPeriod } from "./reportPeriod";

/** Units of each currency per 1 USD (currencyStore.ts); USD itself is always 1. */
export type RatesFromUsd = Record<string, number | undefined>;

export function toMru(amount: number, currencyCode: string, rates: RatesFromUsd): number | undefined {
  const from = currencyCode === "USD" ? 1 : rates[currencyCode];
  const mru = rates.MRU;
  if (!from || !mru) return undefined;
  return currencyCode === "MRU" ? amount : (amount / from) * mru;
}

/** A per-currency total in أوقية; currencies without a known rate are listed, never guessed. */
export function sumToMru(byCurrency: Record<string, number>, rates: RatesFromUsd): { mru: number; missing: string[] } {
  let mru = 0;
  const missing: string[] = [];
  for (const [code, amount] of Object.entries(byCurrency)) {
    if (Math.abs(amount) < 0.000001) continue;
    const value = toMru(amount, code, rates);
    if (value === undefined) missing.push(code);
    else mru += value;
  }
  return { mru, missing };
}

/** A settled shipment's profit in أوقية - its own locked rate when it has one, else today's. */
export function shipmentProfitMru(entry: LedgerEntry, currentMruRate: number): number | undefined {
  const profit = computeShipmentProfit(entry);
  if (profit.status !== "computed" || profit.profitUsd === undefined) return undefined;
  return profit.profitMru ?? profit.profitUsd * currentMruRate;
}

// ---- Chart ----

export interface SeriesPoint {
  key: string;
  label: string;
  value: number;
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Day by day for up to a month, month by month for longer periods. */
export function isMonthlyChart(period: ReportPeriod): boolean {
  return period === "quarter" || period === "halfYear" || period === "year";
}

/** Sums dated values into the period's chart buckets (oldest first), empty buckets included. */
export function valueSeries(items: { date: string; value: number }[], period: ReportPeriod, now: Date = new Date()): SeriesPoint[] {
  const monthly = isMonthlyChart(period);
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();
  const cursor = periodStartDate(period, now);
  const end = localDay(now);
  if (monthly) cursor.setDate(1);
  for (let guard = 0; guard < 400; guard++) {
    const day = localDay(cursor);
    const key = monthly ? day.slice(0, 7) : day;
    if ((monthly ? key > end.slice(0, 7) : key > end)) break;
    const point = { key, label: monthly ? String(cursor.getMonth() + 1) : String(cursor.getDate()), value: 0 };
    points.push(point);
    index.set(key, point);
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  for (const item of items) {
    const key = monthly ? item.date.slice(0, 7) : item.date.slice(0, 10);
    const point = index.get(key);
    if (point) point.value += item.value;
  }
  return points;
}

/** Profit (أوقية) per chart bucket, each shipment on the day Starlink was paid. */
export function profitSeries(entries: LedgerEntry[], period: ReportPeriod, currentMruRate: number, now: Date = new Date()): SeriesPoint[] {
  const items: { date: string; value: number }[] = [];
  for (const entry of entries) {
    if (entry.kind !== "debit") continue;
    const value = shipmentProfitMru(entry, currentMruRate);
    if (value !== undefined) items.push({ date: shipmentProfitDate(entry), value });
  }
  return valueSeries(items, period, now);
}

// ---- Rankings ----

export interface DeviceProfitRank {
  accountId: string;
  profitMru: number;
  shipments: number;
}

/** Every device's profit in the period (already filtered entries), most profitable first. */
export function rankDeviceProfits(entriesByAccount: Record<string, LedgerEntry[]>, currentMruRate: number): DeviceProfitRank[] {
  const result: DeviceProfitRank[] = [];
  for (const [accountId, entries] of Object.entries(entriesByAccount)) {
    let profitMru = 0;
    let shipments = 0;
    for (const entry of entries) {
      if (entry.kind !== "debit") continue;
      const value = shipmentProfitMru(entry, currentMruRate);
      if (value === undefined) continue;
      profitMru += value;
      shipments += 1;
    }
    if (shipments > 0) result.push({ accountId, profitMru, shipments });
  }
  return result.sort((a, b) => b.profitMru - a.profitMru);
}

export interface ClientProfitRank {
  /** undefined = devices with no client. */
  clientId?: string;
  profitMru: number;
  devices: number;
}

export function rankClientProfits(devices: DeviceProfitRank[], clientOf: (accountId: string) => string | undefined): ClientProfitRank[] {
  const byClient = new Map<string, ClientProfitRank>();
  for (const device of devices) {
    const clientId = clientOf(device.accountId);
    const key = clientId ?? "";
    const row = byClient.get(key) ?? { clientId, profitMru: 0, devices: 0 };
    row.profitMru += device.profitMru;
    row.devices += 1;
    byClient.set(key, row);
  }
  return Array.from(byClient.values()).sort((a, b) => b.profitMru - a.profitMru);
}

// ---- Representatives ----

export interface RepBalance {
  rep: Representative;
  /** Positive = we owe him, negative = he owes us (أوقية; his current account since any reset). */
  balanceMru: number;
}

export function repBalancesMru(
  reps: Representative[],
  ledgerStore: LedgerByAccount,
  invoices: Invoice[],
  settlements: RepSettlementList,
  rates: RatesFromUsd,
): RepBalance[] {
  const convert = makeRepConverter(["MRU"], rates);
  return reps
    .map((rep) => {
      const active = splitRepRecords(rep, { deviceRows: listRepDeviceCommissions(rep.id, ledgerStore), invoices, settlements }, "active");
      const days = buildRepDailyStatement(rep.id, active.deviceRows, active.invoices, active.settlements);
      return { rep, balanceMru: buildRepPeriodStatement(days, {}, convert).closing.MRU ?? 0 };
    })
    .filter((row) => Math.abs(row.balanceMru) > 0.5)
    .sort((a, b) => Math.abs(b.balanceMru) - Math.abs(a.balanceMru));
}

export function activeAccountsOnly(accounts: StarlinkAccountSummary[]): StarlinkAccountSummary[] {
  return accounts.filter((a) => !a.archivedAt && !a.deletedAt);
}
