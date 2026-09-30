"use client";

/**
 * 🤲 "سلّمت المسؤول" from the reps' money bot: once the operator confirms it on the
 * representatives page it becomes a normal cash-handover settlement (with its cash-register entry),
 * exactly like one typed by hand there - never before. A 🏦 loan (سلفة) becomes an advance he owes.
 */

import { getCurrency, loadCurrencyStore } from "./currencyStore";
import { recordRepMoneyHandover } from "./repClientsSave";
import { loadRepSettlements, recordRepSettlement, saveRepSettlements } from "./repStore";
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
  // First what he owes us for his own customers' devices (repClients.ts), then a cash handover.
  const result = recordRepMoneyHandover(request.repId, { amount, currencyCode, date, note: "سلّمها المندوب (بوت المال)", rates: lockedRates(currencyCode) });
  return result.ok ? { ok: true } : result;
}

/** 🏦 A loan (سلفة) the operator sent the rep through a banking app: recorded as an advance he
 * owes (a manual debit on his account) - no cash-register entry, the money left through the bank. */
export function recordRepLoan(request: RepRequest, amount: number, currencyCode: string, date: string): { ok: true } | { ok: false; message: string } {
  const result = recordRepSettlement(loadRepSettlements(), {
    representativeId: request.repId,
    kind: "manualDebit",
    amount,
    currencyCode,
    date,
    note: `سلفة عبر ${request.loanApp ?? "تطبيق بنكي"} إلى ${request.loanNumber ?? "—"} (بوت المال)`,
    rates: lockedRates(currencyCode),
  });
  if (!result.ok) return result;
  saveRepSettlements(result.settlements);
  return { ok: true };
}
