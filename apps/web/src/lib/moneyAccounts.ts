/**
 * 🏦 حساباتي البنكية والمحافظ (بنكيلي، مصرفي، سداد، أورانج موني…) - each one's balance derived,
 * never stored as a counter: the balance typed when it was added (its opening), plus everything
 * that went through it since (customers' device payments by its method, my income / expenses /
 * debts recorded on it, supplier / representative payments recorded from a bank notification,
 * transfers between my own accounts) plus «تصحيح الرصيد» entries when the real app shows a
 * different figure.
 */

import type { CashEntryList, CreateCashEntryInput } from "./cashStore";
import type { LedgerByAccount, PaymentMethod } from "./ledgerStore";
import type { PartyAdjustment } from "./partyBalanceStore";
import type { RepSettlement } from "./repStore";

export interface MoneyAccount {
  id: string;
  name: string;
  icon: string;
  currencyCode: string;
  /** Customers' device payments with this method land here (instead of الكاش). */
  method?: PaymentMethod;
  /** The phone number it's on (shown only). */
  number?: string;
  /** False for a ready-made account whose real balance hasn't been typed yet. */
  balanceSet?: boolean;
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

/** 🔁 Money moved between two of my own accounts (e.g. GIMTEL سداد → بنكيلي): minus from one, plus
 * to the other - neither income nor expense. */
export interface AccountTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  createdAt: string;
}

export interface AccountsBook {
  accounts: MoneyAccount[];
  adjustments: AccountAdjustment[];
  transfers?: AccountTransfer[];
  /** The ready-made accounts were added once (never again, even if deleted). */
  seeded?: boolean;
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
  number?: string;
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
    ...(input.number ? { number: input.number } : {}),
    openingBalance: input.openingBalance,
    openingDate: input.openingDate,
    createdAt: now.toISOString(),
  };
  return { ok: true, book: { ...book, accounts: [...book.accounts, account] }, account };
}

export function deleteMoneyAccount(book: AccountsBook, id: string): AccountsBook {
  return { ...book, accounts: book.accounts.filter((a) => a.id !== id), adjustments: book.adjustments.filter((x) => x.accountId !== id) };
}

/** The operator's own apps and wallets (KAST is the card, tracked on its own). */
export const DEFAULT_ACCOUNTS: Omit<AccountInput, "openingBalance" | "openingDate">[] = [
  { name: "بنكيلي", icon: "🟢", currencyCode: "MRU", method: "bankily", number: "22227268" },
  { name: "مصرفي", icon: "🔵", currencyCode: "MRU", method: "masrvi", number: "22227268" },
  { name: "سداد", icon: "🟣", currencyCode: "MRU", method: "sedad", number: "22227268" },
  { name: "كليك", icon: "🔴", currencyCode: "MRU", number: "22227268" },
  { name: "أمانتي", icon: "🟤", currencyCode: "MRU", number: "22227268" },
  { name: "أورانج موني (مالي)", icon: "🟠", currencyCode: "SIFA", method: "orange", number: "74646158" },
  { name: "نيتا (النيجر)", icon: "🟡", currencyCode: "SIFA", method: "nita", number: "22227268" },
  { name: "محفظة بينانس", icon: "🔶", currencyCode: "USD" },
];

/** The ready-made accounts, once, each waiting for its real balance. */
export function seedDefaultAccounts(book: AccountsBook, today: string, now = new Date()): AccountsBook {
  if (book.seeded) return book;
  let next: AccountsBook = { ...book, seeded: true };
  for (const preset of DEFAULT_ACCOUNTS) {
    if (next.accounts.some((a) => a.name === preset.name || (preset.method && a.method === preset.method))) continue;
    const made = addMoneyAccount(next, { ...preset, openingBalance: 0, openingDate: today }, now);
    if (made.ok) next = { ...made.book, accounts: made.book.accounts.map((a) => (a.id === made.account.id ? { ...a, balanceSet: false } : a)) };
  }
  return next;
}

/** The first real balance of a ready-made account: it becomes its opening, from today. */
export function setOpeningBalance(book: AccountsBook, accountId: string, amount: number, today: string): { ok: true; book: AccountsBook } | { ok: false; message: string } {
  if (!Number.isFinite(amount)) return { ok: false, message: "اكتب الرصيد الحقيقي" };
  return {
    ok: true,
    book: { ...book, accounts: book.accounts.map((a) => (a.id === accountId ? { ...a, openingBalance: amount, openingDate: today, balanceSet: true } : a)) },
  };
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
  for (const t of book.transfers ?? []) {
    if (t.date < account.openingDate) continue;
    if (t.fromAccountId === account.id) add(t.currencyCode, -t.amount);
    if (t.toAccountId === account.id) add(t.currencyCode, t.amount);
  }
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

/** الكاش as one side of a transfer (cash deposited at an agent, cash withdrawn): it has no
 * account of its own - its linked cash entry (sourceId = the transfer's id) moves الكاش. */
export const CASH_ACCOUNT_ID = "cash";

export type TransferResult = { ok: true; book: AccountsBook; transfer: AccountTransfer } | { ok: false; message: string };

export function addAccountTransfer(
  book: AccountsBook,
  input: { fromAccountId: string; toAccountId: string; amount: number; currencyCode: string; date: string; note?: string },
  now = new Date(),
): TransferResult {
  if (!input.fromAccountId || !input.toAccountId) return { ok: false, message: "اختر الحسابين" };
  if (input.fromAccountId === input.toAccountId) return { ok: false, message: "اختر حسابين مختلفين" };
  const exists = (id: string) => id === CASH_ACCOUNT_ID || book.accounts.some((a) => a.id === id);
  if (!exists(input.fromAccountId) || !exists(input.toAccountId)) return { ok: false, message: "الحساب غير موجود" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "أدخل المبلغ" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  const transfer: AccountTransfer = {
    id: newId("trf"),
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: now.toISOString(),
  };
  return { ok: true, book: { ...book, transfers: [...(book.transfers ?? []), transfer] }, transfer };
}

/** The الكاش entry of a transfer with الكاش (none for a transfer between two accounts). */
export function transferCashEntry(transfer: AccountTransfer, accountName: string): CreateCashEntryInput | null {
  const toCash = transfer.toAccountId === CASH_ACCOUNT_ID;
  if (!toCash && transfer.fromAccountId !== CASH_ACCOUNT_ID) return null;
  return {
    kind: toCash ? "in" : "out",
    amount: transfer.amount,
    currencyCode: transfer.currencyCode,
    date: transfer.date,
    category: toCash ? `سحب من ${accountName}` : `إيداع في ${accountName}`,
    ...(transfer.note ? { note: transfer.note } : {}),
    sourceId: transfer.id,
    sourceKind: "account-transfer",
  };
}

export function deleteAccountTransfer(book: AccountsBook, id: string): AccountsBook {
  return { ...book, transfers: (book.transfers ?? []).filter((t) => t.id !== id) };
}

/** Supplier / client balance entries and representative settlements that went through a bank /
 * wallet (their `accountId`), signed for that account: a payment I made (to a supplier, to a rep)
 * is −, money I received (a client's payment, a rep handing over, a supplier refund) is +. */
export function partyFlows(
  adjustments: Pick<PartyAdjustment, "accountId" | "partyKind" | "direction" | "amount" | "currencyCode" | "date">[],
  settlements: Pick<RepSettlement, "accountId" | "kind" | "amount" | "currencyCode" | "date">[],
): AccountFlow[] {
  const flows: AccountFlow[] = [];
  for (const a of adjustments) {
    if (!a.accountId) continue;
    // A client's «له» (he paid) or a supplier's «له» (money back) is money in; «عليه» is money out.
    const incoming = a.direction === "weOwe";
    flows.push({ accountId: a.accountId, currencyCode: a.currencyCode, date: a.date, amount: incoming ? a.amount : -a.amount });
  }
  for (const s of settlements) {
    if (!s.accountId) continue;
    flows.push({ accountId: s.accountId, currencyCode: s.currencyCode, date: s.date, amount: s.kind === "cashHandover" ? s.amount : -s.amount });
  }
  return flows;
}

/**
 * الكاش as cash in hand: the till's entries, without the customers' payments that went into a
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
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
      ...(Array.isArray(parsed.transfers) && parsed.transfers.length ? { transfers: parsed.transfers } : {}),
      ...(parsed.seeded ? { seeded: true } : {}),
    };
  } catch {
    return EMPTY_ACCOUNTS_BOOK;
  }
}

export function saveAccountsBook(book: AccountsBook): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(book));
}
