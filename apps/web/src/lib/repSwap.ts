/**
 * 💱 «سعر البديل» (his Oct 22 2026 ask): the rep pays in أوقية into one of his سيفا accounts (or the other
 * way), at «1,000 سيفا = X أوقية» - today's rate, changed by him in the bot or by the owner on approval,
 * locked on the records. Three records with one handoverId (one line in his statement):
 * - the money as it was paid (a cash handover in its currency → الكاش / its app in «حسابي»);
 * - «💱 حُوّلت» out of his account of that currency (عليه, so it stays as it was);
 * - «💱 حُوّلت» into the account he chose: له toAmount in its currency (his normal one, or a named one).
 * Nothing is converted silently: each record keeps its own currency, the rate is written on them.
 */
import { formatAmount } from "./formatAmount";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "./ledgerStore";
import { devicePaymentAccountId, loadAccountsBook } from "./moneyAccounts";
import { loadCashEntries, postRepSettlementToCash, saveCashEntries } from "./cashStore";
import { addRepLedgerEntry, hasBotEntry, loadRepLedgerBook, saveRepLedgerBook } from "./repLedgers";
import { loadRepSettlements, recordRepSettlement, saveRepSettlements, type RepSettlement } from "./repStore";

/** أوقية ↔ سيفا only. */
export function swapOther(currency: string): "MRU" | "SIFA" | null {
  return currency === "MRU" ? "SIFA" : currency === "SIFA" ? "MRU" : null;
}

/** `amount` of `from` at «1,000 سيفا = rate أوقية», to the cent (the bot computes it the same way). */
export function swapAmount(amount: number, from: string, rate: number): number {
  if (!(rate > 0) || !(amount > 0)) return 0;
  const value = from === "MRU" ? (amount * 1000) / rate : (amount * rate) / 1000;
  return Math.round(value * 100) / 100;
}

export function swapRateLabel(rate: number): string {
  return `1,000 سيفا = ${formatAmount(rate)} أوقية`;
}

/** The three records' notes. */
export function swapNotes(input: { amount: number; currency: string; toAmount: number; toCurrency: string; rate: number; target: string; method?: PaymentMethod }) {
  const cur = (c: string) => (c === "SIFA" ? "سيفا" : c === "MRU" ? "أوقية" : c);
  const rate = swapRateLabel(input.rate);
  const via = input.method && input.method !== "cash" ? ` · ${PAYMENT_METHOD_LABELS[input.method]}` : "";
  return {
    money: `سلّمها المندوب (بوت المال)${via} · 💱 إلى ${input.target}`,
    out: `💱 حُوّلت إلى ${input.target}: ${formatAmount(input.toAmount)} ${cur(input.toCurrency)} (${rate})`,
    into: `💱 من دفعة ${formatAmount(input.amount)} ${cur(input.currency)} (${rate})`,
  };
}

export function recordRepSwapHandover(input: {
  repId: string;
  repName: string;
  amount: number;
  currency: string;
  rate: number;
  date: string;
  method?: PaymentMethod;
  /** A named account (repLedgers.ts) of `swapOther(currency)`; absent = his normal one. */
  ledgerId?: string;
  botId?: string;
  /** Locked rates for the settlements (units per 1 USD), as the representatives page passes. */
  rates?: Record<string, number>;
}): { ok: true; toAmount: number; toCurrency: string; target: string } | { ok: false; message: string } {
  const toCurrency = swapOther(input.currency);
  if (!toCurrency) return { ok: false, message: "سعر البديل للأوقية والسيفا فقط" };
  const toAmount = swapAmount(input.amount, input.currency, input.rate);
  if (!(toAmount > 0)) return { ok: false, message: "اكتب سعر البديل" };
  const book = loadRepLedgerBook();
  const ledger = input.ledgerId ? book.ledgers.find((l) => l.id === input.ledgerId && l.repId === input.repId) : undefined;
  if (input.ledgerId && !ledger) return { ok: false, message: "هذا الحساب لم يعد موجوداً" };
  if (ledger && !ledger.currencies.includes(toCurrency)) return { ok: false, message: `حساب «${ledger.name}» ليس فيه هذه العملة` };
  if (ledger && hasBotEntry(book, input.botId)) return { ok: true, toAmount, toCurrency, target: `«${ledger.name}»` };
  const target = ledger ? `«${ledger.name}»` : toCurrency === "SIFA" ? "🟠 شخصي" : "🟢 الأوقية";
  const notes = swapNotes({ amount: input.amount, currency: input.currency, toAmount, toCurrency, rate: input.rate, target, method: input.method });
  const handoverId = `ho-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const accountId = input.method && input.method !== "cash" ? devicePaymentAccountId({ paymentMethod: input.method, currency: input.currency }, loadAccountsBook().accounts) : null;
  const swap: RepSettlement["swap"] = { toAmount, toCurrency, rate: input.rate, ...(ledger ? { toLedgerName: ledger.name } : {}) };
  // 1. The money as it was paid.
  let settlements = loadRepSettlements();
  const money = recordRepSettlement(settlements, {
    representativeId: input.repId,
    kind: "cashHandover",
    amount: input.amount,
    currencyCode: input.currency,
    date: input.date,
    note: notes.money,
    rates: input.rates,
    handoverId,
    swap,
    ...(accountId ? { accountId } : {}),
  });
  if (!money.ok) return money;
  settlements = money.settlements;
  // 2. Out of his account of that currency (it stays as it was).
  const out = recordRepSettlement(settlements, { representativeId: input.repId, kind: "manualDebit", amount: input.amount, currencyCode: input.currency, date: input.date, note: notes.out, rates: input.rates, handoverId });
  if (!out.ok) return out;
  settlements = out.settlements;
  // 3. Into the account he chose.
  if (!ledger) {
    const into = recordRepSettlement(settlements, { representativeId: input.repId, kind: "manualCredit", amount: toAmount, currencyCode: toCurrency, date: input.date, note: notes.into, rates: input.rates, handoverId });
    if (!into.ok) return into;
    settlements = into.settlements;
  } else {
    const added = addRepLedgerEntry(book, ledger.id, { direction: "credit", amount: toAmount, currencyCode: toCurrency, date: input.date, note: notes.into, botId: input.botId });
    if (!added.ok) return added;
    saveRepLedgerBook(added.book);
  }
  saveRepSettlements(settlements);
  if (!accountId) saveCashEntries(postRepSettlementToCash(loadCashEntries(), money.settlement, input.repName));
  return { ok: true, toAmount, toCurrency, target };
}
