/**
 * 📒 «كشف الأرباح»: the Starlink profit as a bank-style statement - one row per shipment, grouped
 * by day, each row opening its full story (sale, Starlink cost, locked rates, the representative's
 * share, who has paid). Confirmed rows are dated on the day Starlink was paid (the app's profit
 * rule); expected rows (D) on the day of the sale.
 *
 * «إخفاء يوم»: a day's profit can be left out of the reports without deleting anything - the
 * shipments and balances stay exactly as they are, and showing the day again brings it back.
 */

import { computeExpectedShipmentProfit, shipmentProfitDate } from "./accountingStore";
import { computeBalanceByCurrency, LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { computeShipmentPaymentStatus, PaymentAllocation } from "./paymentAllocationStore";
import { repProfitUsd } from "./repRates";

export type ClientPayment = "paid" | "partial" | "unpaid";

export interface ProfitRow {
  entryId: string;
  accountId: string;
  /** The statement day: Starlink's payment day (confirmed) or the sale day (expected, D). */
  date: string;
  saleDate: string;
  status: "confirmed" | "expected";
  sale: { amount: number; currency: string; usd?: number; rateFromUsd?: number };
  cost: { amount?: number; currency?: string; usd?: number; rateFromUsd?: number; paidAt?: string; viaCard: boolean; waived: boolean };
  profitUsd: number;
  /** In أوقية: the shipment's locked rate when it has one (exact), else today's (≈). */
  profitMru?: number;
  mruExact: boolean;
  rep?: { id: string; percent: number; sharesLosses: boolean; shareUsd: number; shareMru?: number };
  /** What stays with the business after the representative's share. */
  ourMru?: number;
  clientPayment: ClientPayment;
  note: string;
}

export interface ProfitDay {
  date: string;
  rows: ProfitRow[];
  profitMru: number;
  ourMru: number;
}

function clientPayment(entry: LedgerEntry, deviceEntries: LedgerEntry[], allocations: PaymentAllocation[]): ClientPayment {
  // Nothing left owed in this currency means paid, even when payments were never allocated.
  if ((computeBalanceByCurrency(deviceEntries)[entry.currency] ?? 0) <= 0.0001) return "paid";
  return computeShipmentPaymentStatus(entry, allocations);
}

/** One row per shipment with a known profit. `status` picks confirmed (paid to Starlink) or
 * expected (still D) rows; shipments missing a sale or cost value are left out. */
export function buildProfitRows(
  ledger: LedgerByAccount,
  allocations: Record<string, PaymentAllocation[]>,
  currentMruRate: number | undefined,
  status: "confirmed" | "expected",
): ProfitRow[] {
  const rows: ProfitRow[] = [];
  for (const [accountId, entries] of Object.entries(ledger)) {
    for (const entry of entries) {
      if (entry.kind !== "debit") continue;
      const p = computeExpectedShipmentProfit(entry);
      if (p.status !== status || p.profitUsd === undefined) continue;
      const lockedMru = status === "confirmed" ? entry.profitCurrencyRates?.MRU : undefined;
      const mruRate = lockedMru ?? currentMruRate;
      const toMru = (usd: number) => (mruRate !== undefined ? usd * mruRate : undefined);
      const cost = entry.starlinkCost;
      const percent = entry.representativeCommissionPercent;
      const sharesLosses = entry.representativeSharesLosses === true;
      // 💱 his share is of HIS profit - the cost at his own rate (repRates.ts)
      const hisProfit = repProfitUsd(entry, p.profitUsd);
      const shareUsd =
        entry.representativeId && percent !== undefined ? (hisProfit > 0 || sharesLosses ? (hisProfit * percent) / 100 : 0) : undefined;
      const profitMru = toMru(p.profitUsd);
      rows.push({
        entryId: entry.id,
        accountId,
        date: status === "confirmed" ? shipmentProfitDate(entry) : entry.date,
        saleDate: entry.date,
        status,
        sale: {
          amount: entry.amount,
          currency: entry.currency,
          usd: entry.currency === "USD" ? entry.amount : entry.saleRate?.usdValue,
          rateFromUsd: entry.saleRate?.rateFromUsd,
        },
        cost: {
          amount: cost?.amount,
          currency: cost?.currencyCode,
          usd: cost?.currencyCode === "USD" ? cost.amount : cost?.rate?.usdValue,
          rateFromUsd: cost?.rate?.rateFromUsd,
          paidAt: cost?.status === "settled" ? cost.paidAt : undefined,
          viaCard: cost?.paidVia === "card",
          waived: cost?.waived !== undefined,
        },
        profitUsd: p.profitUsd,
        profitMru,
        mruExact: lockedMru !== undefined,
        rep:
          entry.representativeId && percent !== undefined && shareUsd !== undefined
            ? { id: entry.representativeId, percent, sharesLosses, shareUsd, shareMru: toMru(shareUsd) }
            : undefined,
        ourMru: profitMru !== undefined ? profitMru - (shareUsd !== undefined ? (toMru(shareUsd) ?? 0) : 0) : undefined,
        clientPayment: clientPayment(entry, entries, allocations[accountId] ?? []),
        note: entry.note,
      });
    }
  }
  return rows;
}

/** Newest day first; inside a day the biggest profit first. */
export function groupProfitDays(rows: ProfitRow[]): ProfitDay[] {
  const byDate = new Map<string, ProfitRow[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, dayRows]) => ({
      date,
      rows: [...dayRows].sort((a, b) => b.profitUsd - a.profitUsd),
      profitMru: dayRows.reduce((sum, r) => sum + (r.profitMru ?? 0), 0),
      ourMru: dayRows.reduce((sum, r) => sum + (r.ourMru ?? 0), 0),
    }));
}

// ---- 🙈 «إخفاء يوم» ----

/** Hidden statement days: "YYYY-MM-DD" → when it was hidden. Backed up with the business data. */
export type HiddenProfitDays = Record<string, string>;

const HIDDEN_KEY = "starnet_profit_hidden_days_v1";

export function loadHiddenProfitDays(): HiddenProfitDays {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as HiddenProfitDays) : {};
  } catch {
    return {};
  }
}

export function saveHiddenProfitDays(days: HiddenProfitDays): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(days));
  } catch {
    // Storage blocked - the day simply shows again next time.
  }
}

export function hideProfitDay(days: HiddenProfitDays, date: string, now: Date = new Date()): HiddenProfitDays {
  return { ...days, [date]: now.toISOString() };
}

export function showProfitDay(days: HiddenProfitDays, date: string): HiddenProfitDays {
  const next = { ...days };
  delete next[date];
  return next;
}

/** The ledger without the confirmed shipments whose profit day is hidden (everything else - every
 * payment, every D - stays, so balances never change). */
export function withoutHiddenProfitDays(ledger: LedgerByAccount, days: HiddenProfitDays): LedgerByAccount {
  if (Object.keys(days).length === 0) return ledger;
  const result: LedgerByAccount = {};
  for (const [accountId, entries] of Object.entries(ledger)) {
    result[accountId] = entries.filter(
      (e) => e.kind !== "debit" || e.starlinkCost?.status !== "settled" || !(shipmentProfitDate(e) in days),
    );
  }
  return result;
}
