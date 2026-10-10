/**
 * Profit is always SHOWN in أوقية (MRU), the business's own currency, even though it's computed
 * in USD underneath (Starlink costs come in several currencies). A settled shipment uses the MRU
 * rate locked at settlement (exact); anything else - an expected (D) profit, a sum already in USD -
 * uses today's registered MRU rate and is marked approximate.
 */

import { computeExpectedShipmentProfit } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";

export interface MruProfitTotals {
  /** Confirmed profit in MRU: locked rate per shipment where it exists, else today's rate. */
  confirmedMru: number;
  /** True when every confirmed shipment had its own locked MRU rate. */
  confirmedExact: boolean;
  expectedMru: number;
  expectedCount: number;
  confirmedCount: number;
}

export function sumProfitMru(entries: LedgerEntry[], currentMruRate: number): MruProfitTotals {
  const totals: MruProfitTotals = { confirmedMru: 0, confirmedExact: true, expectedMru: 0, expectedCount: 0, confirmedCount: 0 };
  for (const entry of entries) {
    if (entry.kind !== "debit") continue;
    const p = computeExpectedShipmentProfit(entry);
    if (p.status === "confirmed") {
      totals.confirmedCount += 1;
      if (p.profitMru !== undefined) totals.confirmedMru += p.profitMru;
      else {
        totals.confirmedExact = false;
        totals.confirmedMru += (p.profitUsd ?? 0) * currentMruRate;
      }
    } else if (p.status === "expected") {
      totals.expectedCount += 1;
      totals.expectedMru += (p.profitUsd ?? 0) * currentMruRate;
    }
  }
  return totals;
}

/** A USD amount tied to one shipment (e.g. a rep's share of it), in MRU at that shipment's locked
 * rate when it has one, else today's. */
export function entryUsdToMru(usd: number, entry: LedgerEntry, currentMruRate: number): number {
  return usd * (entry.profitCurrencyRates?.MRU ?? currentMruRate);
}

/** One profit figure for display: in أوقية when a rate is known (exact when `lockedMru` is given,
 * else approximate at today's rate), otherwise the original USD. Always the absolute value -
 * callers say "ربح"/"خسارة" themselves. */
export function formatProfitMru(usd: number, currentMruRate: number | undefined, lockedMru?: number): string {
  const fmt = (v: number) => Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (lockedMru !== undefined) return `${fmt(lockedMru)} أوقية`;
  if (currentMruRate !== undefined) return `≈ ${fmt(usd * currentMruRate)} أوقية`;
  return `${Math.abs(usd).toLocaleString("en-US", { maximumFractionDigits: 2 })} USD`;
}
