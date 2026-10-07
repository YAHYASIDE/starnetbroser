/**
 * 🟠 How a customer's payment is typed in the app's forms - the same rule as the money bot (his Oct
 * 2026 words «اورانج موني هو لفرانك فقط وليس سيفا، سيفا تدفع فقط كاش»): a payment's currency is أوقية,
 * «سيفا (كاش)», دولار or «🟠 فرانك (أورانج / نيتا)». سيفا is cash only; فرانك goes through أورانج موني
 * or نيتا only, and is stored as سيفا ÷5 (his rate: 5 فرانك = 1 سيفا) - «10,000 فرانك = 2,000 سيفا».
 * Nothing new is stored: a فرانك payment is a سيفا entry whose method is أورانج / نيتا. Pure.
 */

import { formatAmount } from "./formatAmount";
import { PAYMENT_METHOD_LABELS, type LedgerCurrency, type PaymentMethod } from "./ledgerStore";
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

/** A money account that counts in فرانك: أورانج موني / نيتا (a سيفا wallet). */
export function isFrancAccount(account: { currencyCode?: string; method?: string } | null | undefined): boolean {
  return Boolean(account && account.currencyCode === "SIFA" && isFrancMethod(account.method as PaymentMethod));
}

/** فرانك → سيفا (÷5) and back (×5). */
export function francToSifa(franc: number): number {
  return franc / FRANC_PER_SIFA;
}
export function sifaToFranc(sifa: number): number {
  return sifa * FRANC_PER_SIFA;
}

/** 🟠 The note shown wherever money is typed for أورانج / نيتا: what the typed فرانك are in سيفا,
 * or how to type it while the amount is still empty. */
export function francHint(francAmount: number, where = "أورانج / نيتا"): string {
  if (!Number.isFinite(francAmount) || francAmount <= 0) return `${where} بالفرانك - اكتب المبلغ كما يظهر في التطبيق (5 فرانك = 1 سيفا)`;
  return `${where} بالفرانك: ${formatAmount(francAmount)} فرانك = ${formatAmount(francToSifa(francAmount))} سيفا`;
}

/** 🟠 A fixed سيفا amount that goes through أورانج / نيتا: «8,000 سيفا = 40,000 فرانك». */
export function sifaAsFranc(sifa: number): string {
  return `${formatAmount(sifa)} سيفا = ${formatAmount(sifaToFranc(sifa))} فرانك`;
}

/** The فرانك badge for a saved سيفا record by أورانج / نيتا (a payment, a transfer…), or "". */
export function francBadge(record: { currencyCode?: string; currency?: string; amount: number }, viaFranc: boolean): string {
  const code = record.currencyCode ?? record.currency;
  return viaFranc && code === "SIFA" ? `🟠 ${formatAmount(sifaToFranc(record.amount))} فرانك` : "";
}

/** A payment's method as shown or sent: «أورانج موني · 🟠 10,000 فرانك» for a سيفا payment by
 * أورانج / نيتا, the plain name otherwise. */
export function methodLabel(method: PaymentMethod, currency: string, amount: number): string {
  const name = PAYMENT_METHOD_LABELS[method];
  return isFrancMethod(method) && currency === "SIFA" ? `${name} · 🟠 ${formatAmount(sifaToFranc(amount))} فرانك` : name;
}
