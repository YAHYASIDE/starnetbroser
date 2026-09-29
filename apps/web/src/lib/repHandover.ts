"use client";

/**
 * 🤲 "سلّمت المسؤول" from the reps' money bot: once the operator confirms it on the
 * representatives page it becomes a normal cash-handover settlement (with its cash-register entry),
 * exactly like one typed by hand there - never before.
 */

import { loadCashEntries, postRepSettlementToCash, saveCashEntries } from "./cashStore";
import { getCurrency, loadCurrencyStore } from "./currencyStore";
import { loadRepresentativeStore, loadRepSettlements, recordRepSettlement, saveRepSettlements } from "./repStore";
import type { RepRequest } from "./repRequests";

/** Rates (units per 1 USD) locked on the settlement, as the representatives page does. */
function lockedRates(currencyCode: string): Record<string, number> {
  const store = loadCurrencyStore();
  const result: Record<string, number> = {};
  for (const code of ["MRU", "SIFA", currencyCode]) {
    const rate = code === "USD" ? 1 : getCurrency(store, code)?.rateFromUsd;
    if (rate) result[code] = rate;
  }
  return result;
}

export function recordRepHandover(request: RepRequest, amount: number, currencyCode: string, date: string): { ok: true } | { ok: false; message: string } {
  const result = recordRepSettlement(loadRepSettlements(), {
    representativeId: request.repId,
    kind: "cashHandover",
    amount,
    currencyCode,
    date,
    note: "سلّمها المندوب (بوت المال)",
    rates: lockedRates(currencyCode),
  });
  if (!result.ok) return result;
  saveRepSettlements(result.settlements);
  saveCashEntries(postRepSettlementToCash(loadCashEntries(), result.settlement, loadRepresentativeStore()[request.repId]?.name ?? ""));
  return { ok: true };
}
