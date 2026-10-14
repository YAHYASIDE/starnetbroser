"use client";

/**
 * 🏦 Runs the one-time «MRU = 10 أوقية» fix (bankOuguiya.ts) on the phone's stores - before «حسابي»
 * reads anything, so the new figures are what it shows. Returns what was done, or null when there
 * was nothing to do.
 */

import { loadBankInbox, saveBankInbox } from "./bankNotices";
import { applyOuguiyaFix, needsOuguiyaFix, type OuguiyaFix } from "./bankOuguiya";
import { loadCashEntries, saveCashEntries } from "./cashStore";
import { loadLedgerStore, saveLedgerStore } from "./ledgerStore";
import { loadAccountsBook, saveAccountsBook } from "./moneyAccounts";
import { loadDebtBook, loadIncome, saveDebtBook, saveIncome } from "./myMoney";
import { loadPartyAdjustments, savePartyAdjustments } from "./partyBalanceStore";
import { loadPersonalExpenses, savePersonalExpenses } from "./personalExpenses";
import { loadRepSettlements, saveRepSettlements } from "./repStore";

export function runOuguiyaFixOnce(): OuguiyaFix | null {
  const inbox = loadBankInbox();
  if (!needsOuguiyaFix(inbox)) return null;
  const stores = {
    expenses: loadPersonalExpenses(),
    income: loadIncome(),
    debts: loadDebtBook(),
    party: loadPartyAdjustments(),
    reps: loadRepSettlements(),
    ledger: loadLedgerStore(),
    accounts: loadAccountsBook(),
    cash: loadCashEntries(),
  };
  const result = applyOuguiyaFix(inbox, stores);
  const touched = new Set(result.fix.fixed.map((f) => f.store));
  if (touched.has("expense")) savePersonalExpenses(result.stores.expenses);
  if (touched.has("income")) saveIncome(result.stores.income);
  if (touched.has("debt") || touched.has("debt-payment")) saveDebtBook(result.stores.debts);
  if (touched.has("supplier")) savePartyAdjustments(result.stores.party);
  if (touched.has("rep")) saveRepSettlements(result.stores.reps);
  if (touched.has("customer")) saveLedgerStore(result.stores.ledger);
  if (touched.has("transfer")) {
    saveAccountsBook(result.stores.accounts);
    saveCashEntries(result.stores.cash);
  }
  // Last: once the inbox carries `ouguiyaFix`, it never runs again.
  saveBankInbox(result.inbox);
  return result.fix;
}

/** What he's told once, in his words. */
export function ouguiyaFixMessage(fix: OuguiyaFix): string {
  const lines = ["🏦 مبالغ البنوك صارت بالأوقية القديمة (MRU × 10)."];
  if (fix.pending) lines.push(`• ${fix.pending} عملية بانتظار التأكيد صُحّحت.`);
  if (fix.fixed.length) lines.push(`• ${fix.fixed.length} عملية أكّدتها سابقًا صُحّح مبلغها في سجلّها.`);
  if (fix.unmatched.length) lines.push(`• ${fix.unmatched.length} عملية مؤكدة لم أجد سجلّها بالضبط (غيّرت مبلغها أو تاريخها أو ملاحظتها) - تُركت كما هي، صحّحها بيدك إن لزم.`);
  return lines.join("\n");
}
