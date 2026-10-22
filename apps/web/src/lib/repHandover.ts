"use client";

/**
 * 🤲 "سلّمت المسؤول" from the reps' money bot: once the operator confirms it on the
 * representatives page it becomes a normal cash-handover settlement (with its cash-register entry),
 * exactly like one typed by hand there - never before. A 🏦 loan (سلفة) is recorded in the account he
 * borrowed from (recordRepLoan).
 */

import { getCurrency, loadCurrencyStore } from "./currencyStore";
import { recordRepMoneyHandover } from "./repClientsSave";
import { CASH_WALLET_FROM, devicePaymentAccountId, loadAccountsBook, type MoneyAccount } from "./moneyAccounts";
import { loadRepSettlements, recordRepSettlement, saveRepSettlements, type RepSettlement } from "./repStore";
import { REP_LOAN_ACCOUNTS, type RepRequest } from "./repRequests";
import {
  addRepLedgerCurrency,
  addRepLedgerEntry,
  createRepLedger,
  hasBotEntry,
  loadRepLedgerBook,
  repLedgersOf,
  saveRepLedgerBook,
  type RepLedger,
  type RepLedgerBook,
} from "./repLedgers";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "./ledgerStore";

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
  const result = recordRepMoneyHandover(request.repId, {
    amount,
    currencyCode,
    date,
    note: `سلّمها المندوب (بوت المال)${request.paymentMethod && request.paymentMethod !== "cash" ? ` · ${PAYMENT_METHOD_LABELS[request.paymentMethod]}` : ""}`,
    rates: lockedRates(currencyCode),
    paymentMethod: request.paymentMethod,
    ...(request.botId ? { botId: request.botId } : {}),
  });
  return result.ok ? { ok: true } : result;
}

/**
 * 🏦 The «حسابي» account a loan left from: the bot's app name («أورانج موني», «بنكيلي»…) → its
 * account in that currency (his Oct 11 2026 report: a 75,000 فرانك loan by أورانج didn't lower
 * أورانج). null = no such account (nothing to lower).
 */
export function loanAccountId(app: string | undefined, currencyCode: string, accounts: MoneyAccount[]): string | null {
  const name = app?.trim();
  const method = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).find((m) => m !== "cash" && PAYMENT_METHOD_LABELS[m] === name);
  return method ? devicePaymentAccountId({ paymentMethod: method, currency: currencyCode }, accounts) : null;
}

const BOT_LOAN_NOTE = /^سلفة عبر (.+?) إلى .*\(بوت المال\)$/;

/**
 * Loans approved from the money bot since `since` (by `createdAt`) before they lowered their app:
 * each gets the account it left from. Older ones are never touched (their balances were settled by
 * hand). The same list when nothing changes.
 */
export function routeBotLoans(settlements: RepSettlement[], accounts: MoneyAccount[], since = CASH_WALLET_FROM): RepSettlement[] {
  let changed = false;
  const next = settlements.map((s) => {
    if (s.kind !== "manualDebit" || s.accountId || s.createdAt < since) return s;
    const app = BOT_LOAN_NOTE.exec(s.note ?? "")?.[1];
    const accountId = app ? loanAccountId(app, s.currencyCode, accounts) : null;
    if (!accountId) return s;
    changed = true;
    return { ...s, accountId };
  });
  return changed ? next : settlements;
}

/** routeBotLoans on the saved settlements (run when «حسابي» or the representatives page loads). */
export function routeSavedBotLoans(): void {
  const settlements = loadRepSettlements();
  const next = routeBotLoans(settlements, loadAccountsBook().accounts);
  if (next !== settlements) saveRepSettlements(next);
}

/** 🏦 The rep's 🟠 أورانج موني / نيتا account (repLedgers.ts) a loan from it goes into - his own account of
 * that name, or a new «سلفة / دين» one when he has none yet; with `currencyCode` added if missing. */
export function loanLedgerFor(book: RepLedgerBook, repId: string, account: "orange" | "nita", currencyCode: string, now = new Date()): { book: RepLedgerBook; ledger: RepLedger } | { ok: false; message: string } {
  const name = account === "orange" ? /orange|oranj|اورانج|أورانج|أورنج|اورنج/i : /نيتا|nita/i;
  const mine = repLedgersOf(book, repId).filter((l) => l.kind !== "travel" && name.test(l.name));
  const found = mine.find((l) => l.currencies.includes(currencyCode)) ?? mine[0];
  if (found) {
    if (found.currencies.includes(currencyCode)) return { book, ledger: found };
    const added = addRepLedgerCurrency(book, found.id, currencyCode);
    return added.ok ? { book: added.book, ledger: added.ledger } : added;
  }
  const created = createRepLedger(book, { repId, name: account === "orange" ? "أورانج موني" : "نيتا", kind: "loan", currencies: [currencyCode] }, now);
  return created.ok ? { book: created.book, ledger: created.ledger } : created;
}

/** 🏦 A loan (سلفة) the operator sent the rep through a banking app, taken out of that app in «حسابي»
 * (no cash-register entry - the money left through the bank) and recorded in the account he borrowed
 * from (his Oct 22 2026 rule «تسلف من الحسابات فقط الاوقية او اورانج موني او نيتا وحساب الربح»):
 * - 🟢 الأوقية (and an older request without an account): an advance he owes in that currency;
 * - 🟠 أورانج موني / نيتا: «عليه» in his account of that name (made when he has none);
 * - 💰 الربح: paid out of his profit - beyond it, his profit becomes «عليه» (his choice). */
export function recordRepLoan(
  request: RepRequest,
  amount: number,
  currencyCode: string,
  date: string,
): { ok: true; target: string } | { ok: false; message: string } {
  const accountId = loanAccountId(request.loanApp, currencyCode, loadAccountsBook().accounts);
  const note = `سلفة عبر ${request.loanApp ?? "تطبيق بنكي"} إلى ${request.loanNumber ?? "—"} (بوت المال)`;
  const account = request.loanAccount;
  if (account === "orange" || account === "nita") {
    let book = loadRepLedgerBook();
    if (hasBotEntry(book, request.botId)) return { ok: true, target: REP_LOAN_ACCOUNTS[account] };
    const place = loanLedgerFor(book, request.repId, account, currencyCode);
    if ("ok" in place) return place;
    const added = addRepLedgerEntry(place.book, place.ledger.id, { direction: "debit", amount, currencyCode, date, note, botId: request.botId, ...(accountId ? { placeId: accountId } : {}) });
    if (!added.ok) return added;
    book = added.book;
    saveRepLedgerBook(book);
    return { ok: true, target: `«${place.ledger.name}»` };
  }
  const fromProfit = account === "profit";
  const result = recordRepSettlement(loadRepSettlements(), {
    representativeId: request.repId,
    kind: fromProfit ? "commissionPayout" : "manualDebit",
    amount,
    currencyCode,
    date,
    note: fromProfit ? `💰 من ربحه - ${note}` : note,
    rates: lockedRates(currencyCode),
    ...(accountId ? { accountId } : {}),
  });
  if (!result.ok) return result;
  saveRepSettlements(result.settlements);
  return { ok: true, target: fromProfit ? REP_LOAN_ACCOUNTS.profit : currencyCode === "MRU" ? REP_LOAN_ACCOUNTS.MRU : "حسابك" };
}
