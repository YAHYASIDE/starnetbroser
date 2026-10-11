/**
 * 💱 «سعر المندوب» (his Oct 10 2026 request: «سعر الدولار مثلاً 430 ولكن أريد أحسبه للمندوب بـ450»;
 * his choices: «حساب ربحه ونصيبه»، «الدولار والسيفا»، «من تاريخ أختاره»). A rep can have his own
 * dollar rate in أوقية and in سيفا. His profit on a shipment sold in that currency counts Starlink's
 * cost at HIS rate: sold 30,000 أوقية, cost 50 $ → at the real 430 the profit is 8,500; at his 450 it
 * is 7,500 - his percent is of 7,500 and the 1,000 stays ours. Our own profit never changes.
 *
 * The rates are locked onto each of his shipments (`LedgerEntry.representativeRates`), like his
 * percent: setting them «من تاريخ» stamps his shipments from that day on, and new ones get them when
 * recorded. Shipments before that day keep what they had. Pure.
 */

import { starlinkCostUsd } from "./accountingStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";

/** His own rates: how many أوقية / سيفا one dollar is FOR HIM (like the currencies page's rate).
 * `base`: the real rates when his were set - a rate of his in one currency only (460 أوقية) is the
 * same markup on the dollar for a sale in the other (460 ÷ 435 on a سيفا sale too - his Oct 11 2026
 * case: his rep sells in سيفا, he set only the أوقية). */
export interface RepRates {
  MRU?: number;
  SIFA?: number;
  base?: { MRU?: number; SIFA?: number };
}

/** On the rep: his rates and the day they start (yyyy-mm-dd). */
export interface RepRatePlan extends RepRates {
  since: string;
}

const ok = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0;

function clean(rates: RepRates | undefined): RepRates | undefined {
  if (!rates) return undefined;
  const out: RepRates = {};
  if (ok(rates.MRU)) out.MRU = rates.MRU;
  if (ok(rates.SIFA)) out.SIFA = rates.SIFA;
  if (out.MRU === undefined && out.SIFA === undefined) return undefined;
  const base = { ...(ok(rates.base?.MRU) ? { MRU: rates.base!.MRU } : {}), ...(ok(rates.base?.SIFA) ? { SIFA: rates.base!.SIFA } : {}) };
  return Object.keys(base).length ? { ...out, base } : out;
}

/** The rates a new shipment of his on `date` is locked with (none before the plan's day). */
export function repRatesFor(plan: RepRatePlan | undefined, date: string): RepRates | undefined {
  if (!plan || date < plan.since) return undefined;
  return clean(plan);
}

/** How much more Starlink's cost weighs for him: his rate ÷ the sale's locked rate (1 = no change -
 * no rate of his for the sale's currency, a dollar sale, or no locked sale rate). */
export function repCostFactor(entry: Pick<LedgerEntry, "currency" | "saleRate" | "representativeRates">): number {
  const cur = entry.currency;
  const rates = entry.representativeRates;
  if ((cur !== "MRU" && cur !== "SIFA") || !rates) return 1;
  const his = rates[cur];
  const sale = entry.saleRate?.rateFromUsd;
  if (ok(his) && ok(sale)) return his / sale;
  // No rate of his in the sale's currency: the markup he set on the dollar in the other one.
  for (const code of ["MRU", "SIFA"] as const) {
    const mine = rates[code];
    const real = rates.base?.[code];
    if (ok(mine) && ok(real)) return mine / real;
  }
  return 1;
}

/** His view of a shipment's profit (USD): the cost counted at his rate. `profitUsd` is the real one. */
export function repProfitUsd(entry: LedgerEntry, profitUsd: number): number {
  const factor = repCostFactor(entry);
  if (factor === 1) return profitUsd;
  const cost = starlinkCostUsd(entry) ?? 0;
  return profitUsd - cost * (factor - 1);
}

/** His view of Starlink's cost (USD) - shown in his statement. */
export function repCostUsd(entry: LedgerEntry, costUsd: number): number {
  return costUsd * repCostFactor(entry);
}

/** «من تاريخ»: locks `rates` (or removes his rates when null) onto every shipment of his dated
 * `since` or later. Returns the new ledger and how many shipments changed. */
export function stampRepRates(ledger: LedgerByAccount, repId: string, rates: RepRates | null, since: string): { ledger: LedgerByAccount; count: number } {
  const locked = clean(rates ?? undefined);
  let count = 0;
  const next: LedgerByAccount = {};
  for (const [accountId, entries] of Object.entries(ledger)) {
    next[accountId] = entries.map((e) => {
      if (e.kind !== "debit" || e.representativeId !== repId || e.date < since) return e;
      const same = JSON.stringify(e.representativeRates ?? null) === JSON.stringify(locked ?? null);
      if (same) return e;
      count += 1;
      const { representativeRates: _old, ...rest } = e;
      return locked ? { ...rest, representativeRates: locked } : rest;
    });
  }
  return { ledger: count ? next : ledger, count };
}

/** Every rep's plan stamped on his shipments that don't carry it yet (one recorded on his phone, or
 * before the plan) - run when the ledger loads; nothing changes when all are already stamped. */
export function applyRepRatePlans(ledger: LedgerByAccount, reps: { id: string; usdRates?: RepRatePlan }[]): { ledger: LedgerByAccount; count: number } {
  let next = ledger;
  let count = 0;
  for (const rep of reps) {
    if (!rep.usdRates) continue;
    const stamped = stampRepRates(next, rep.id, rep.usdRates, rep.usdRates.since);
    next = stamped.ledger;
    count += stamped.count;
  }
  return { ledger: next, count };
}

/** A plan saved before `base` existed gets today's real rates as its base (once). */
export function withBaseRates(plan: RepRatePlan, real: { MRU?: number; SIFA?: number }): RepRatePlan {
  if (plan.base && (ok(plan.base.MRU) || ok(plan.base.SIFA))) return plan;
  const base = { ...(ok(real.MRU) ? { MRU: real.MRU } : {}), ...(ok(real.SIFA) ? { SIFA: real.SIFA } : {}) };
  return Object.keys(base).length ? { ...plan, base } : plan;
}
