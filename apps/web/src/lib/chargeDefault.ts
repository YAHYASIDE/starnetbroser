/**
 * ⏳ The device browser's «شحن بانتظار الفاتورة» filled in by itself (his Nov 12 2026 ask: «اجعل دائمًا السعر يأتي
 * تلقائيًا، مثلًا الزبون كان يدفع بسيفا أن يأتي تلقائيًا بسيفا»): the price and currency of the device's last charge.
 * He can still change both before «سجّل الشحن». Pure.
 */

import type { LedgerEntry } from "./ledgerStore";

const CUSTOMER_CURRENCIES = new Set(["MRU", "SIFA", "USD"]);

/** The last charge (عليه) of the device in a customer currency - its amount and currency; null when none. */
export function lastChargePrice(entries: LedgerEntry[]): { amount: number; currency: string } | null {
  let last: LedgerEntry | null = null;
  for (const e of entries) {
    if (e.kind !== "debit" || e.previousDebtId || !(e.amount > 0) || !CUSTOMER_CURRENCIES.has(e.currency)) continue;
    if (!last || e.date > last.date || (e.date === last.date && e.createdAt > last.createdAt)) last = e;
  }
  return last ? { amount: last.amount, currency: last.currency } : null;
}
