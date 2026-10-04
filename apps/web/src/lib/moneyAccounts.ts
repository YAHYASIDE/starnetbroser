/**
 * 🏦 حساباتي البنكية والمحافظ (بنكيلي، مصرفي، سداد، أورانج موني…) - each one's balance derived,
 * never stored as a counter: the balance typed when it was added (its opening), plus everything
 * that went through it since (customers' device payments by its method, my income / expenses /
 * debts recorded on it) plus «تصحيح الرصيد» entries when the real app shows a different figure.
 */

import type { CashEntryList } from "./cashStore";
import type { LedgerByAccount, PaymentMethod } from "./ledgerStore";

export interface MoneyAccount {
  id: string;
  name: string;
  icon: string;
  currencyCode: string;
  /** Customers' device payments with this method land here (instead of الصندوق). */
  method?: PaymentMethod;
  /** The real balance when it was added, on `openingDate` (yyyy-mm-dd). */
  openingBalance: number;
  openingDate: string;
  createdAt: string;
}

/** «تصحيح الرصيد»: the difference between the real app and what was derived (signed). */
export interface AccountAdjustment {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt: string;
}

export interface AccountsBook {
  accounts: MoneyAccount[];
  adjustments: AccountAdjustment[];
}

export const EMPTY_ACCOUNTS_BOOK: AccountsBook = { accounts: [], adjustments: [] };

/** A record that moved money through an account: + in, − out (in the account's currency). */
export interface AccountFlow {
  accountId?: string;
  currencyCode: string;
  date: string;
  /** Signed. */
  amount: number;
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

export interface AccountInput {
  name: string;
  icon: string;
  currencyCode: string;
  method?: PaymentMethod;
  openingBalance: number;
  openingDate: string;
}

export type AccountResult = { ok: true; book: AccountsBook; account: MoneyAccount } | { ok: false; message: string };

export function addMoneyAccount(book: AccountsBook, input: AccountInput, now = new Date()): AccountResult {
  const name = input.name.trim();
  if (!name) return { ok: false, message: "اكتب اسم الحساب" };
  if (book.accounts.some((a) => a.name === name)) return { ok: false, message: "هذا الحساب موجود" };
  if (!Number.isFinite(input.openingBalance)) return { ok: false, message: "اكتب الرصيد الحالي" };
  if (input.method && book.accounts.some((a) => a.method === input.method)) return { ok: false, message: "طريقة الدفع هذه مربوطة بحساب آخر" };
  const account: MoneyAccount = {
    id: newId("acc"),
    name,
    icon: input.icon.trim() || "🏦",
    currencyCode: input.currencyCode,
    ...(input.method ? { method: input.method } : {}),
    openingBalance: input.openingBalance,
    openingDate: input.openingDate,
    createdAt: now.toISOString(),
  };
  return { ok: true, book: { ...book, accounts: [...book.accounts, account] }, account };
}

export function deleteMoneyAccount(book: AccountsBook, id: string): AccountsBook {
  return { accounts: book.accounts.filter((a) => a.id !== id), adjustments: book.adjustments.filter((x) => x.accountId !== id) };
}

/** Customers' device payments made with `method`, from the account's opening day on (+). */
export function devicePaymentFlows(ledger: LedgerByAccount, account: MoneyAccount): AccountFlow[] {
  if (!account.method) return [];
  const flows: AccountFlow[] = [];
  for (const entries of Object.values(ledger)) {
    for (const e of entries) {
      if (e.kind !== "credit" || e.paymentMethod !== account.method || e.date < account.openingDate) continue;
      flows.push({ accountId: account.id, currencyCode: e.currency, date: e.date, amount: e.amount });
    }
  }
  return flows;
}

/** The account's balance per currency (its own currency first; a flow in another one stays apart). */
export function accountBalance(book: AccountsBook, account: MoneyAccount, flows: AccountFlow[]): Record<string, number> {
  const out: Record<string, number> = { [account.currencyCode]: account.openingBalance };
  const add = (code: string, amount: number) => (out[code] = (out[code] ?? 0) + amount);
  for (const f of flows) if (f.accountId === account.id && f.date >= account.openingDate) add(f.currencyCode, f.amount);
  for (const a of book.adjustments) if (a.accountId === account.id) add(account.currencyCode, a.amount);
  for (const code of Object.keys(out)) out[code] = Math.round(out[code]! * 100) / 100;
  return out;
}

/** «تصحيح الرصيد»: records the difference so the derived balance equals what the app shows. */
export function correctBalance(
  book: AccountsBook,
  account: MoneyAccount,
  flows: AccountFlow[],
  actual: number,
  date: string,
  now = new Date(),
): { ok: true; book: AccountsBook } | { ok: false; message: string } {
  if (!Number.isFinite(actual)) return { ok: false, message: "اكتب الرصيد الحقيقي" };
  const current = accountBalance(book, account, flows)[account.currencyCode] ?? 0;
  const diff = Math.round((actual - current) * 100) / 100;
  if (diff === 0) return { ok: true, book };
  const adjustment: AccountAdjustment = { id: newId("adj"), accountId: account.id, amount: diff, date, note: "تصحيح الرصيد", createdAt: now.toISOString() };
  return { ok: true, book: { ...book, adjustments: [...book.adjustments, adjustment] } };
}

/**
 * الصندوق as cash in hand: the till's entries, without the customers' payments that went into a
 * linked bank/wallet (they're posted to the till as «دفعة جهاز», but the money is in the app).
 */
export function cashInHandEntries(cash: CashEntryList, ledger: LedgerByAccount, book: AccountsBook): CashEntryList {
  const linked = new Set(book.accounts.map((a) => a.method).filter((m): m is PaymentMethod => Boolean(m)));
  if (linked.size === 0) return cash;
  const bankPayments = new Set<string>();
  for (const entries of Object.values(ledger)) {
    for (const e of entries) if (e.kind === "credit" && e.paymentMethod && linked.has(e.paymentMethod)) bankPayments.add(e.id);
  }
  return cash.filter((c) => !(c.sourceKind === "device-payment" && c.sourceId && bankPayments.has(c.sourceId)));
}

const KEY = "starnet_money_accounts_v1";

export function loadAccountsBook(): AccountsBook {
  if (typeof window === "undefined") return EMPTY_ACCOUNTS_BOOK;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AccountsBook>) : {};
    return { accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [], adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [] };
  } catch {
    return EMPTY_ACCOUNTS_BOOK;
  }
}

export function saveAccountsBook(book: AccountsBook): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(book));
}
