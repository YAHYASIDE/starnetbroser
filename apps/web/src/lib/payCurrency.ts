/**
 * 🟠 How a customer's payment is typed in the app's forms - the same rule as the money bot (his Oct
 * 2026 words «اورانج موني هو لفرانك فقط وليس سيفا، سيفا تدفع فقط كاش»): a payment's currency is أوقية,
 * «سيفا (كاش)», دولار or «🟠 فرانك (أورانج / نيتا)». سيفا is cash only; فرانك goes through أورانج موني
 * or نيتا only, and is stored as سيفا ÷5 (his rate: 5 فرانك = 1 سيفا) - «10,000 فرانك = 2,000 سيفا».
 * Nothing new is stored: a فرانك payment is a سيفا entry whose method is أورانج / نيتا. Pure.
 */

import { formatAmount } from "./formatAmount";
import type { LedgerCurrency, PaymentMethod } from "./ledgerStore";
import { FRANC_PER_SIFA } from "./moneyAccounts";

export type PayCurrency = LedgerCurrency | "FRANC";

export const PAY_CURRENCIES: PayCurrency[] = ["MRU", "SIFA", "USD", "FRANC"];

export const PAY_CURRENCY_LABELS: Record<PayCurrency, string> = {
  MRU: "أوقية",
  SIFA: "سيفا (كاش)",
  USD: "دولار",
  FRANC: "🟠 فرانك (أورانج / نيتا)",
};

const METHODS: Record<PayCurrency, PaymentMethod[]> = {
  MRU: ["cash", "bankily", "masrvi", "sedad"],
  SIFA: ["cash"],
  USD: ["cash"],
  FRANC: ["orange", "nita"],
};

/** أورانج موني / نيتا - the apps that count in فرانك. */
export function isFrancMethod(method: PaymentMethod | undefined): boolean {
  return method === "orange" || method === "nita";
}

/** The methods a payment in this currency can come by. `keep` (an old entry's own method) stays
 * listed so editing an older payment never changes its method by itself. */
export function payMethodsFor(currency: PayCurrency, keep?: PaymentMethod): PaymentMethod[] {
  const list = METHODS[currency];
  return keep && !list.includes(keep) ? [...list, keep] : list;
}

/** The chosen method if it fits the currency, else the currency's first one. */
export function fitPayMethod(currency: PayCurrency, method: PaymentMethod | undefined, keep?: PaymentMethod): PaymentMethod {
  const list = payMethodsFor(currency, keep);
  return method && list.includes(method) ? method : list[0];
}

/** What the ledger stores for a typed payment: فرانك → سيفا ÷5, anything else unchanged. */
export function toLedgerPayment(currency: PayCurrency, amount: number): { currency: LedgerCurrency; amount: number } {
  return currency === "FRANC" ? { currency: "SIFA", amount: amount / FRANC_PER_SIFA } : { currency, amount };
}

/** How a saved payment shows in a form: a سيفا payment by أورانج / نيتا is فرانك ×5. */
export function payFormOf(entry: { currency: LedgerCurrency; amount: number; paymentMethod?: PaymentMethod }): { currency: PayCurrency; amount: number } {
  return entry.currency === "SIFA" && isFrancMethod(entry.paymentMethod)
    ? { currency: "FRANC", amount: entry.amount * FRANC_PER_SIFA }
    : { currency: entry.currency, amount: entry.amount };
}

/** «10,000 فرانك = 2,000 سيفا» under the amount, or "" when it isn't a فرانك amount. */
export function francNote(currency: PayCurrency, amount: number): string {
  if (currency !== "FRANC" || !Number.isFinite(amount) || amount <= 0) return "";
  return `${formatAmount(amount)} فرانك = ${formatAmount(amount / FRANC_PER_SIFA)} سيفا`;
}
