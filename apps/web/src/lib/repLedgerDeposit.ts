/**
 * 📒 A deposit the rep sent through the money bot into one of his named accounts (repLedgers.ts),
 * approved by the owner: a «له» entry in that account, and the money itself where it arrived - the
 * method's app in «حسابي» (أورانج، بنكيلي…) or الكاش (a linked cash entry carrying the entry's id,
 * removed with it). Never his profit, his normal account or his customers' devices.
 */

import { loadCashEntries, recordCashEntry, removeLinkedCashEntries, saveCashEntries } from "./cashStore";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "./ledgerStore";
import { devicePaymentAccountId, loadAccountsBook, type MoneyAccount } from "./moneyAccounts";
import {
  addRepLedgerEntry,
  hasBotEntry,
  loadRepLedgerBook,
  REP_LEDGER_CASH,
  repLedgerCashEntry,
  saveRepLedgerBook,
  type RepLedgerBook,
} from "./repLedgers";

/** Where a deposit's money went: the method's app (or its currency's cash wallet), else الكاش. */
export function ledgerDepositPlace(method: PaymentMethod | undefined, currency: string, accounts: MoneyAccount[]): string {
  if (!method || method === "cash") return REP_LEDGER_CASH;
  return devicePaymentAccountId({ paymentMethod: method, currency }, accounts) ?? REP_LEDGER_CASH;
}

export function recordRepLedgerDeposit(input: {
  ledgerId: string;
  amount: number;
  currencyCode: string;
  date: string;
  method?: PaymentMethod;
  botId?: string;
  repName: string;
  note?: string;
}): { ok: true } | { ok: false; message: string } {
  const book = loadRepLedgerBook();
  const ledger = book.ledgers.find((l) => l.id === input.ledgerId);
  if (!ledger) return { ok: false, message: "هذا الحساب لم يعد موجوداً" };
  if (!ledger.currencies.includes(input.currencyCode)) return { ok: false, message: `حساب «${ledger.name}» ليس فيه هذه العملة - غيّر العملة أو الحساب` };
  // 🔒 The same bot message twice never makes two entries.
  if (hasBotEntry(book, input.botId)) return { ok: true };
  const placeId = ledgerDepositPlace(input.method, input.currencyCode, loadAccountsBook().accounts);
  const added = addRepLedgerEntry(book, ledger.id, { direction: "credit", amount: input.amount, currencyCode: input.currencyCode, date: input.date, note: input.note ?? (input.method && input.method !== "cash" ? `عبر ${PAYMENT_METHOD_LABELS[input.method]}` : "نقدًا"), placeId, botId: input.botId });
  if (!added.ok) return added;
  if (placeId === REP_LEDGER_CASH) {
    const cashInput = repLedgerCashEntry(added.entry, ledger, input.repName);
    if (cashInput) {
      const posted = recordCashEntry(loadCashEntries(), cashInput);
      if (!posted.ok) return posted;
      saveCashEntries(posted.entries);
    }
  }
  saveRepLedgerBook(added.book);
  return { ok: true };
}

/** Removes the الكاش entries of these ledger entries (an entry or a whole account deleted). */
export function removeLedgerCash(entryIds: string[]): void {
  if (!entryIds.length) return;
  let cash = loadCashEntries();
  for (const id of entryIds) cash = removeLinkedCashEntries(cash, id);
  saveCashEntries(cash);
}

/** The entries a deletion takes with it (for removeLedgerCash). */
export function ledgerEntryIds(book: RepLedgerBook, ledgerId: string): string[] {
  return book.entries.filter((e) => e.ledgerId === ledgerId).map((e) => e.id);
}
