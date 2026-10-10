/**
 * 🗑️ «حذف كل المعاملات وتصفير كل الحسابات» («حسابي»): every money record goes - shipments and
 * payments, الكاش, invoices and stock movements, expenses, income, debts, supplier / customer
 * balance entries, rep settlements and books, card top-ups, previous debts, month closings - so
 * every balance reads 0. Devices, customers, reps, suppliers, store items, categories, monthly
 * rules and settings stay (his choice: «المعاملات فقط»). The banks / wallets stay with a 0
 * balance from today; a 🔁 monthly rule restarts from its next day (no past month is re-made).
 *
 * Before anything is removed, everything it touches is kept on this phone as one undo snapshot
 * («↩️ استرجاع ما حُذف»), replaced by the next wipe.
 */

import { firstRecurringMonth, type RecurringList } from "./myMoney";
import type { AccountsBook } from "./moneyAccounts";

/** Removed entirely. */
export const TRANSACTION_KEYS = [
  "starnet_customer_ledger_v1",
  "starnet_payment_allocations_v1",
  "starnet_cash_entries_v1",
  "starnet_cash_closings_v1",
  "starnet_store_invoices_v1",
  "starnet_store_transactions_v1",
  "starnet_party_adjustments_v1",
  "starnet_rep_settlements_v1",
  "starnet_rep_book_v1",
  "starnet_rep_past_ledger_v1",
  "starnet_previous_debts_v1",
  "starnet_card_topups_v1",
  "starnet_card_deposits_v1",
  "starnet_month_closings_v1",
  "starnet_profit_reset_v1",
  "starnet_profit_hidden_days_v1",
  "starnet_client_profit_resets_v1",
  "starnet_personal_expenses_v1",
  "starnet_personal_income_v1",
  "starnet_personal_debts_v1",
  "starnet_payment_promises_v1",
  "starnet_payment_proofs_v1",
  "starnet_remittances_v1",
] as const;

const ACCOUNTS_BOOK_KEY = "starnet_money_accounts_v1";
const RECURRING_KEY = "starnet_recurring_v1";
/** On this phone only (not a business-data key: never in a backup). */
const UNDO_KEY = "starnet.wipeUndo";

/** The banks / wallets kept, each at 0 from today - corrections and transfers gone. */
export function zeroAccountsBook(book: AccountsBook, today: string): AccountsBook {
  return {
    ...book,
    accounts: book.accounts.map((a) => ({ ...a, openingBalance: 0, openingDate: today })),
    adjustments: [],
    transfers: [],
  };
}

/** Each 🔁 rule starts again from its next day - the months before were wiped, not to be re-made. */
export function restartRecurring(rules: RecurringList, today: string): RecurringList {
  return rules.map((r) => ({ ...r, startMonth: firstRecurringMonth(today, r.day), skipped: [] }));
}

export interface WipeUndo {
  at: string;
  /** key → its raw value before the wipe (null = it didn't exist). */
  values: Record<string, string | null>;
}

export type WipeResult = { ok: true } | { ok: false; message: string };

/** Runs the wipe (snapshot first - nothing is removed if the snapshot can't be kept). */
export function wipeAllTransactions(storage: Storage, today: string, now = new Date()): WipeResult {
  const keys = [...TRANSACTION_KEYS, ACCOUNTS_BOOK_KEY, RECURRING_KEY];
  const undo: WipeUndo = { at: now.toISOString(), values: Object.fromEntries(keys.map((k) => [k, storage.getItem(k)])) };
  try {
    storage.setItem(UNDO_KEY, JSON.stringify(undo));
  } catch {
    return { ok: false, message: "ذاكرة الهاتف لا تتسع لنسخة الاسترجاع - خذ نسخة احتياطية من الإعدادات أولاً. لم يُحذف شيء." };
  }
  for (const key of TRANSACTION_KEYS) storage.removeItem(key);
  const bookRaw = storage.getItem(ACCOUNTS_BOOK_KEY);
  if (bookRaw) {
    try {
      const book = JSON.parse(bookRaw) as AccountsBook;
      if (Array.isArray(book.accounts)) storage.setItem(ACCOUNTS_BOOK_KEY, JSON.stringify(zeroAccountsBook({ ...book, adjustments: book.adjustments ?? [] }, today)));
    } catch {
      // an unreadable book stays as it is
    }
  }
  const rulesRaw = storage.getItem(RECURRING_KEY);
  if (rulesRaw) {
    try {
      const rules = JSON.parse(rulesRaw) as RecurringList;
      if (Array.isArray(rules)) storage.setItem(RECURRING_KEY, JSON.stringify(restartRecurring(rules, today)));
    } catch {
      // an unreadable list stays as it is
    }
  }
  return { ok: true };
}

export function loadWipeUndo(storage: Storage): WipeUndo | null {
  try {
    const raw = storage.getItem(UNDO_KEY);
    const parsed = raw ? (JSON.parse(raw) as WipeUndo) : null;
    return parsed && parsed.values && typeof parsed.at === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Puts back everything the last wipe removed or changed. */
export function undoWipe(storage: Storage): WipeResult {
  const undo = loadWipeUndo(storage);
  if (!undo) return { ok: false, message: "لا يوجد ما يُسترجع" };
  try {
    for (const [key, value] of Object.entries(undo.values)) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch {
    return { ok: false, message: "ذاكرة الهاتف ممتلئة - لم يكتمل الاسترجاع" };
  }
  storage.removeItem(UNDO_KEY);
  return { ok: true };
}
