"use client";

/**
 * 🏦 Confirming a bank-notification suggestion (bankNotices.ts): the operator says what it was and
 * it becomes the same record he'd type by hand - in the chosen bank / wallet of «حسابي», never
 * through الكاش - with the notification's details (person, number, app, transaction) as its note.
 */

import { saveClientDevicePayment } from "./clientDevicePaymentSave";
import { loadCurrencyStore } from "./currencyStore";
import { loadLedgerStore, type LedgerByAccount } from "./ledgerStore";
import { addAccountTransfer, CASH_ACCOUNT_ID, loadAccountsBook, saveAccountsBook, transferCashEntry, type MoneyAccount } from "./moneyAccounts";
import { loadCashEntries, recordCashEntry, saveCashEntries } from "./cashStore";
import { addDebt, addDebtPayment, addIncome, incomeCategoryOf, loadDebtBook, loadIncome, loadIncomeCategories, saveDebtBook, saveIncome } from "./myMoney";
import { loadPartyAdjustments, recordPartyAdjustment, savePartyAdjustments } from "./partyBalanceStore";
import { categoryPath } from "./categoryTree";
import { loadExpenseTree } from "./expenseTreeStore";
import { addPersonalExpense, categoryOf, loadPersonalExpenses, savePersonalExpenses } from "./personalExpenses";
import { loadRepSettlements, recordRepSettlement, saveRepSettlements, type RepSettlementKind } from "./repStore";

export type SuggestionChoice =
  | { type: "expense"; categoryId: string }
  | { type: "income"; categoryId: string }
  /** out = «دين أعطيته», in = «دين أخذته». */
  | { type: "new-debt"; person: string }
  /** out = I repaid a debt I took, in = a debt I gave was repaid. */
  | { type: "debt-payment"; debtId: string }
  | { type: "supplier"; supplierId: string; supplierName: string }
  | { type: "rep"; repId: string; repName: string; kind: RepSettlementKind }
  | { type: "customer"; device: { id: string; name: string; email?: string } }
  | { type: "transfer"; otherAccount: MoneyAccount }
  /** in = cash deposited into the account («Versement espèces»), out = cash withdrawn. */
  | { type: "cash" };

export interface SuggestionSaveInput {
  account: MoneyAccount;
  direction: "in" | "out";
  amount: number;
  currencyCode: string;
  date: string;
  note: string;
  choice: SuggestionChoice;
}

export type SuggestionSaveResult = { ok: true; outcome: string; ledgerStore?: LedgerByAccount } | { ok: false; message: string };

function lockedRates(currencyCode: string): Record<string, number> {
  const store = loadCurrencyStore();
  const result: Record<string, number> = {};
  for (const code of ["MRU", "SIFA", currencyCode]) {
    const rate = code === "USD" ? 1 : store[code]?.rateFromUsd;
    if (rate) result[code] = rate;
  }
  return result;
}

export function saveSuggestionChoice(input: SuggestionSaveInput): SuggestionSaveResult {
  const { account, direction, amount, currencyCode, date, note, choice } = input;
  const out = direction === "out";
  if (!(amount > 0)) return { ok: false, message: "أدخل المبلغ" };

  switch (choice.type) {
    case "expense": {
      const tree = loadExpenseTree();
      const result = addPersonalExpense(loadPersonalExpenses(), { categoryId: choice.categoryId, amount, currencyCode, date, note, fromCash: false, accountId: account.id });
      if (!result.ok) return result;
      savePersonalExpenses(result.list);
      const cat = categoryOf(choice.categoryId, tree);
      return { ok: true, outcome: `🧾 مصروف: ${cat.icon} ${categoryPath(tree, choice.categoryId) || cat.name}` };
    }
    case "income": {
      const result = addIncome(loadIncome(), { categoryId: choice.categoryId, amount, currencyCode, date, note, toCash: false, accountId: account.id });
      if (!result.ok) return result;
      saveIncome(result.list);
      const incomeTree = loadIncomeCategories();
      const cat = incomeCategoryOf(choice.categoryId, incomeTree);
      return { ok: true, outcome: `💵 دخل: ${cat.icon} ${categoryPath(incomeTree, choice.categoryId) || cat.name}` };
    }
    case "new-debt": {
      const result = addDebt(loadDebtBook(), { kind: out ? "lent" : "borrowed", person: choice.person, amount, currencyCode, date, note, viaCash: false, accountId: account.id });
      if (!result.ok) return result;
      saveDebtBook(result.book);
      return { ok: true, outcome: out ? `🤝 دين أعطيته لـ ${result.debt.person}` : `🤝 دين أخذته من ${result.debt.person}` };
    }
    case "debt-payment": {
      const book = loadDebtBook();
      const debt = book.debts.find((d) => d.id === choice.debtId);
      if (!debt) return { ok: false, message: "اختر الدين" };
      const result = addDebtPayment(book, { debtId: debt.id, amount, date, viaCash: false, accountId: account.id });
      if (!result.ok) return result;
      saveDebtBook(result.book);
      return { ok: true, outcome: debt.kind === "borrowed" ? `🤝 سدّدت لـ ${debt.person}` : `🤝 ${debt.person} ردّ دينه` };
    }
    case "supplier": {
      const result = recordPartyAdjustment(loadPartyAdjustments(), {
        partyKind: "supplier",
        partyId: choice.supplierId,
        // I paid him = «عليه» on his account; money back from him = «له».
        direction: out ? "owesUs" : "weOwe",
        amount,
        currencyCode,
        date,
        note,
        ...(account.method ? { paymentMethod: account.method } : {}),
      });
      if (!result.ok) return result;
      savePartyAdjustments(result.list.map((a) => (a.id === result.adjustment.id ? { ...a, accountId: account.id } : a)));
      return { ok: true, outcome: out ? `🏭 دفعة للمورد ${choice.supplierName}` : `🏭 من المورد ${choice.supplierName}` };
    }
    case "rep": {
      const result = recordRepSettlement(loadRepSettlements(), {
        representativeId: choice.repId,
        kind: choice.kind,
        amount,
        currencyCode,
        date,
        note,
        rates: lockedRates(currencyCode),
      });
      if (!result.ok) return result;
      saveRepSettlements(result.settlements.map((s) => (s.id === result.settlement.id ? { ...s, accountId: account.id } : s)));
      const what = choice.kind === "cashHandover" ? "سلّم المندوب" : choice.kind === "commissionPayout" ? "عمولة المندوب" : "سلفة للمندوب";
      return { ok: true, outcome: `🧑‍💼 ${what} ${choice.repName}` };
    }
    case "customer": {
      if (!account.method) return { ok: false, message: "هذا الحساب غير مربوط بطريقة دفع للزبائن" };
      const result = saveClientDevicePayment(loadLedgerStore(), choice.device, { amount, currencyCode, date, note, paymentMethod: account.method, cashMoved: false });
      if (!result.ok) return result;
      return { ok: true, outcome: `👤 دفعة زبون: ${choice.device.name}`, ledgerStore: result.ledgerStore };
    }
    case "transfer": {
      const book = loadAccountsBook();
      const result = addAccountTransfer(book, {
        fromAccountId: out ? account.id : choice.otherAccount.id,
        toAccountId: out ? choice.otherAccount.id : account.id,
        amount,
        currencyCode,
        date,
        note,
      });
      if (!result.ok) return result;
      saveAccountsBook(result.book);
      return { ok: true, outcome: out ? `🔁 تحويل إلى ${choice.otherAccount.name}` : `🔁 تحويل من ${choice.otherAccount.name}` };
    }
    case "cash": {
      const book = loadAccountsBook();
      const result = addAccountTransfer(book, {
        fromAccountId: out ? account.id : CASH_ACCOUNT_ID,
        toAccountId: out ? CASH_ACCOUNT_ID : account.id,
        amount,
        currencyCode,
        date,
        note,
      });
      if (!result.ok) return result;
      const cashInput = transferCashEntry(result.transfer, account.name);
      const posted = cashInput ? recordCashEntry(loadCashEntries(), cashInput) : null;
      if (posted && !posted.ok) return posted;
      saveAccountsBook(result.book);
      if (posted) saveCashEntries(posted.entries);
      return { ok: true, outcome: out ? `💵 سحب إلى الكاش من ${account.name}` : `💵 إيداع من الكاش في ${account.name}` };
    }
  }
}
