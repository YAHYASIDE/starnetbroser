"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { AccountsManager, IncomeTab, RecurringSection, today, WealthCard, WealthLineDetail } from "@/components/MyMoney";
import { BankInboxCard, BankInboxList, SuggestionConfirm, type ConfirmData, type ConfirmInput } from "@/components/BankInbox";
import { decideSuggestion, decidedSuggestions, EMPTY_BANK_INBOX, loadBankInbox, pendingSuggestions, reopenSuggestion, saveBankInbox, type BankInbox, type BankSuggestion } from "@/lib/bankNotices";
import { saveSuggestionChoice } from "@/lib/bankSuggestionSave";
import { RemittanceSection } from "@/components/RemittanceSection";
import { PlaceStatement } from "@/components/PlaceStatement";
import { loadPlaceLedger } from "@/lib/placeLedgerData";
import { CASH_PLACE } from "@/lib/moneyMovements";
import { addRemittancePayment, createRemittance, deleteRemittance, deleteRemittancePayment, loadRemittances, updateRemittance, remittanceCashEntries, remittanceMonth, saveRemittances, type Remittance, type RemittanceList } from "@/lib/remittances";
import { ouguiyaFixMessage, runOuguiyaFixOnce } from "@/lib/bankOuguiyaRun";
import { askDeleteCode } from "@/components/DeleteCodePrompt";
import { loadProfitReset, saveProfitReset, startProfitFresh, undoProfitFresh, type ProfitReset } from "@/lib/profitReset";
import { loadRepresentativeStore as loadReps, saveRepresentativeStore } from "@/lib/repStore";
import { loadWipeUndo, undoWipe, wipeAllTransactions, type WipeUndo } from "@/lib/wipeTransactions";
import { listClients, loadClientStore } from "@/lib/clientStore";
import { drainBankNotices, kastNotificationsEnabled, openKastNotificationAccess } from "@/lib/localBrowser";
import { listRepresentatives, loadRepresentativeStore } from "@/lib/repStore";
import { listSuppliers, loadSupplierStore } from "@/lib/supplierStore";
import { PartySheet } from "@/components/AccountsSection";
import { PersonalExpensesTab } from "@/components/PersonalExpensesTab";
import { computeCashBalanceByCurrency, hasCashReset, loadCashEntries, recordCashEntry, removeLinkedCashEntries, resetCashToZero, saveCashEntries, undoCashReset } from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";
import { monthLabel } from "@/lib/monthClosing";
import {
  addIncome,
  addRecurringRule,
  deleteIncome,
  deleteRecurringRule,
  dueRecurring,
  editIncome,
  loadDebtBook,
  loadIncome,
  loadIncomeCategories,
  loadRecurring,
  monthLeft,
  buildWealth,
  personalFlows,
  saveIncome,
  saveIncomeCategories,
  saveRecurring,
  skipRecurringMonth,
  syncIncomeCash,
  addIncomeCategory,
  removeIncomeCategory,
  type DebtBook,
  type IncomeList,
  type RecurringList,
  type WealthLine,
} from "@/lib/myMoney";
import { businessNetForMonth, loadAccountFlows, loadMoneyAccounts, loadRates, loadWealthInput } from "@/lib/myMoneyData";
import {
  accountBalance,
  addMoneyAccount,
  cashInHandEntries,
  correctBalance,
  deleteAccountTransfer,
  deleteMoneyAccount,
  loadAccountsBook,
  saveAccountsBook,
  seedDefaultAccounts,
  setOpeningBalance,
  hasAccountsReset,
  undoAccountsReset,
  zeroAccountsBalances,
  type AccountsBook,
} from "@/lib/moneyAccounts";
import { currentCardBalanceUsd, hasCardReset, loadCardTopUps, saveCardTopUps, undoCardReset, zeroCardBalance } from "@/lib/starlinkDebt";
import { loadLedgerStore } from "@/lib/ledgerStore";
import { loadExpenseTree } from "@/lib/expenseTreeStore";
import {
  loadPersonalExpenses,
  savePersonalExpenses,
  syncExpenseCash,
  type ExpenseCategory,
  type PersonalExpenseList,
} from "@/lib/personalExpenses";
import type { RatesFromUsd } from "@/lib/reportsView";
import { ADD_MONEY_ROUTE, parseAddMoney, SAME_PAGE_ROUTE_EVENT } from "@/lib/shortcuts";

type MoneyTab = "income" | "expense";
const TABS: { id: MoneyTab; label: string }[] = [
  { id: "income", label: "الدخل" },
  { id: "expense", label: "المصروف" },
];
const TAB_KEY = "starnet.moneyTab";
/** His public numbers (business.md) - money between his own apps on them is a transfer. */
const OWN_NUMBERS = ["22227268", "74646158"];

function mru(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(value)))}`;
}

function Line({ icon, label, value, minus }: { icon: string; label: string; value: number; minus?: boolean }) {
  const shown = minus ? -value : value;
  return (
    <li>
      <span>
        {icon} {label}
      </span>
      <bdi dir="ltr" className={shown < 0 ? "money-out" : shown > 0 ? "money-in" : undefined}>
        {`${shown > 0 ? "+" : ""}${mru(shown)}`}
      </bdi>
    </li>
  );
}

/**
 * 💰 «حسابي»: الدخل / المصروف / الديون like a personal finance app, and two final figures - what's
 * left for me this month (the business «الصافي» + my income − my spending) and everything I own
 * (الكاش + البطاقة + what's owed to me − what I owe). Logic: lib/myMoney.ts.
 */
export default function MoneyPage() {
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>([]);
  const [rates, setRates] = useState<RatesFromUsd>({});
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [tab, setTab] = useState<MoneyTab>("income");
  const [incomes, setIncomes] = useState<IncomeList>([]);
  const [incomeCats, setIncomeCats] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<PersonalExpenseList>([]);
  const [expenseCats, setExpenseCats] = useState<ExpenseCategory[]>([]);
  const [rules, setRules] = useState<RecurringList>([]);
  const [debts, setDebts] = useState<DebtBook>({ debts: [], payments: [] });
  const [book, setBook] = useState<AccountsBook>({ accounts: [], adjustments: [] });
  const [openLine, setOpenLine] = useState<WealthLine | null>(null);
  /** 📄 The place whose «كشف حساب» is open (an account id, or الكاش). */
  const [statementOf, setStatementOf] = useState<string | null>(null);
  // Bumped whenever الكاش changes, so «كل ما تملك» is recomputed.
  const [cashVersion, setCashVersion] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 🏦 bank / wallet notifications waiting for his confirmation (lib/bankNotices.ts).
  const [inbox, setInbox] = useState<BankInbox>(EMPTY_BANK_INBOX);
  const [remittances, setRemittances] = useState<RemittanceList>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [picked, setPicked] = useState<BankSuggestion | null>(null);
  const [notifEnabled, setNotifEnabled] = useState<boolean | null>(null);
  // Bumped when a confirmed notification wrote a supplier / rep / customer record.
  const [inboxVersion, setInboxVersion] = useState(0);
  // «🔄 الأرباح والخسائر من 0» (the same reset as the reports') and the last «حذف كل المعاملات».
  const [profitReset, setProfitReset] = useState<ProfitReset | null>(null);
  const [wipeUndo, setWipeUndo] = useState<WipeUndo | null>(null);
  // «↩️ تراجع عن تصفير الكاش» is shown only while reset entries exist.
  const [cashResetOn, setCashResetOn] = useState(false);
  // 💳 KAST brought to 0 by «🔄 البداية من جديد» (its correction movement exists).
  const [cardResetOn, setCardResetOn] = useState(false);

  function chooseTab(next: MoneyTab) {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      // per-phone convenience only
    }
  }

  function startNew() {
    setNewRecord(true);
  }
  const consumed = () => setNewRecord(false);

  useEffect(() => {
    // 🏦 Once: the bank amounts read before the «MRU = 10 أوقية» rule ×10 (bankOuguiya.ts) - before
    // anything below reads the stores.
    const ouguiyaFix = runOuguiyaFixOnce();
    if (ouguiyaFix) window.setTimeout(() => window.alert(ouguiyaFixMessage(ouguiyaFix)), 600);
    // First, the expense groups (set up once: the old أكل/شرب… expenses go, his choice).
    const expenseCustom = loadExpenseTree();
    const ruleList = loadRecurring();
    let incomeList = loadIncome();
    let expenseList = loadPersonalExpenses();
    const incomeCustom = loadIncomeCategories();
    // 🔁 the salary / the rent: whatever came due since the last visit records itself now.
    const due = dueRecurring(ruleList, incomeList, expenseList, today());
    if (due.incomes.length || due.expenses.length) {
      let cash = loadCashEntries();
      for (const income of due.incomes) cash = syncIncomeCash(cash, income, incomeCustom);
      for (const expense of due.expenses) cash = syncExpenseCash(cash, expense, expenseCustom);
      incomeList = [...incomeList, ...due.incomes];
      expenseList = [...expenseList, ...due.expenses];
      saveCashEntries(cash);
      saveIncome(incomeList);
      savePersonalExpenses(expenseList);
    }
    setRules(ruleList);
    setIncomes(incomeList);
    setExpenses(expenseList);
    setIncomeCats(incomeCustom);
    setExpenseCats(expenseCustom);
    setDebts(loadDebtBook());
    // 🏦 the operator's apps and wallets, ready the first time (each waits for its balance).
    const storedBook = loadAccountsBook();
    const readyBook = seedDefaultAccounts(storedBook, today());
    if (readyBook !== storedBook) saveAccountsBook(readyBook);
    setBook(readyBook);
    setRates(loadRates());
    setInbox(loadBankInbox());
    setRemittances(loadRemittances());
    setProfitReset(loadProfitReset());
    setWipeUndo(loadWipeUndo(window.localStorage));
    setCashResetOn(hasCashReset(loadCashEntries()));
    setCardResetOn(hasCardReset(loadCardTopUps()));
    const ownNumbers = Array.from(new Set([...OWN_NUMBERS, ...readyBook.accounts.map((a) => a.number ?? "").filter(Boolean)]));
    const readNotices = () => {
      void drainBankNotices(ownNumbers).then((result) => {
        if (result) setInbox(result.inbox);
      });
      void kastNotificationsEnabled().then(setNotifEnabled);
    };
    readNotices();
    // Back from a bank app / Android's «Notification access»: read again.
    const onVisible = () => {
      if (document.visibilityState === "visible") readNotices();
    };
    document.addEventListener("visibilitychange", onVisible);
    try {
      const saved = window.localStorage.getItem(TAB_KEY);
      if (saved === "income" || saved === "expense") setTab(saved);
    } catch {
      // ignored
    }
    void loadMoneyAccounts().then((list) => {
      setAccounts(list);
      setLoaded(true);
    });
    // 📌 «إضافة دخل/مصروف» from the home screen.
    if (parseAddMoney(window.location.search)) {
      window.history.replaceState(null, "", window.location.pathname);
      startNew();
    }
    const onRoute = (event: Event) => {
      const route = (event as CustomEvent<string>).detail ?? "";
      if (route.includes("?") && parseAddMoney(route.slice(route.indexOf("?")))) startNew();
    };
    window.addEventListener(SAME_PAGE_ROUTE_EVENT, onRoute);
    return () => {
      window.removeEventListener(SAME_PAGE_ROUTE_EVENT, onRoute);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2, 3, 4].map((i) => new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString().slice(0, 7));
  }, []);

  const business = useMemo(() => (loaded ? businessNetForMonth(month, accounts, rates) : { netMru: 0, missing: [] }), [loaded, month, accounts, rates, cashVersion]);
  const remittanceMru = useMemo(() => remittanceMonth(remittances, month, profitReset?.date).profitMru, [remittances, month, profitReset]);
  const left = useMemo(
    () => monthLeft({ month, businessNetMru: business.netMru, incomes, expenses, rates, since: profitReset?.date, remittanceMru }),
    [month, business, incomes, expenses, rates, profitReset, remittanceMru],
  );
  const wealth = useMemo(
    () => buildWealth(loadWealthInput({ accounts, rates, incomes, expenses, debts, book })),
    // الكاش changes (cashVersion) are read from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, rates, incomes, expenses, debts, book, cashVersion, loaded, inboxVersion, remittances],
  );
  const accountBalances = useMemo(() => {
    const ledger = loadLedgerStore();
    const flows = personalFlows(incomes, expenses, debts);
    return Object.fromEntries(book.accounts.map((a) => [a.id, accountBalance(book, a, loadAccountFlows(ledger, a, flows, book.accounts))]));
    // Supplier / rep payments from a bank notification are read from storage (inboxVersion).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, incomes, expenses, debts, inboxVersion, remittances]);
  const sources = book.accounts.map((a) => ({ id: a.id, name: a.name, icon: a.icon, currencyCode: a.currencyCode, method: a.method }));
  const missing = Array.from(new Set([...business.missing, ...left.missing, ...wealth.missing]));
  const shownLine = openLine ? wealth.lines.find((l) => l.key === openLine.key) ?? openLine : null;
  const statement = useMemo(
    () => (statementOf && loaded ? loadPlaceLedger(statementOf, accounts) : null),
    // Read from storage: recomputed whenever a record here changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statementOf, loaded, accounts, book, incomes, expenses, debts, cashVersion, inboxVersion, remittances],
  );

  function updateCash(change: (cash: ReturnType<typeof loadCashEntries>) => ReturnType<typeof loadCashEntries>) {
    saveCashEntries(change(loadCashEntries()));
    setCashVersion((v) => v + 1);
  }

  // ---- الدخل ----
  function saveIncomeRecord(input: Parameters<typeof addIncome>[1], editingId?: string): string | null {
    const result = editingId ? editIncome(incomes, editingId, input) : addIncome(incomes, input);
    if (!result.ok) return result.message;
    updateCash((cash) => syncIncomeCash(cash, result.income, incomeCats));
    saveIncome(result.list);
    setIncomes(result.list);
    return null;
  }

  function removeIncome(income: IncomeList[number]) {
    const next = deleteIncome(incomes, income.id);
    updateCash((cash) => removeLinkedCashEntries(cash, income.id));
    saveIncome(next);
    setIncomes(next);
    if (income.recurringId) {
      const nextRules = skipRecurringMonth(rules, income.recurringId, income.date.slice(0, 7));
      saveRecurring(nextRules);
      setRules(nextRules);
    }
  }

  // ---- 🔁 ----
  function addRule(input: Parameters<typeof addRecurringRule>[1]): string | null {
    const result = addRecurringRule(rules, input, today());
    if (!result.ok) return result.message;
    saveRecurring(result.list);
    setRules(result.list);
    // Its first month may already be due (the rule's day is today).
    const due = dueRecurring([result.rule], incomes, expenses, today());
    if (due.incomes.length || due.expenses.length) {
      updateCash((cash) => {
        let next = cash;
        for (const income of due.incomes) next = syncIncomeCash(next, income, incomeCats);
        for (const expense of due.expenses) next = syncExpenseCash(next, expense, expenseCats);
        return next;
      });
      const nextIncomes = [...incomes, ...due.incomes];
      const nextExpenses = [...expenses, ...due.expenses];
      saveIncome(nextIncomes);
      savePersonalExpenses(nextExpenses);
      setIncomes(nextIncomes);
      setExpenses(nextExpenses);
    }
    return null;
  }

  function removeRule(id: string) {
    const next = deleteRecurringRule(rules, id);
    saveRecurring(next);
    setRules(next);
  }

  // ---- 🏦 عمليات البنوك ----
  const pending = useMemo(() => pendingSuggestions(inbox), [inbox]);
  const decided = useMemo(() => decidedSuggestions(inbox), [inbox]);
  const confirmData = useMemo<ConfirmData | null>(() => {
    if (!inboxOpen) return null;
    const clients: ConfirmData["clients"] = {};
    for (const c of listClients(loadClientStore())) clients[c.id] = { name: c.name, ...(c.phone ? { phone: c.phone } : {}) };
    return {
      accounts: book.accounts,
      expenseCustom: expenseCats,
      incomeCustom: incomeCats,
      debts,
      suppliers: listSuppliers(loadSupplierStore()).map((x) => ({ id: x.id, name: x.name })),
      reps: listRepresentatives(loadRepresentativeStore()).map((x) => ({ id: x.id, name: x.name })),
      devices: accounts,
      clients,
    };
  }, [inboxOpen, book, expenseCats, incomeCats, debts, accounts]);

  function storeInbox(next: BankInbox) {
    saveBankInbox(next);
    setInbox(next);
  }

  function confirmSuggestion(s: BankSuggestion, input: ConfirmInput): string | null {
    const result = saveSuggestionChoice(input);
    if (!result.ok) return result.message;
    storeInbox(decideSuggestion(inbox, s.id, "done", result.outcome));
    // The record went to its own store - read them again.
    setIncomes(loadIncome());
    setExpenses(loadPersonalExpenses());
    setDebts(loadDebtBook());
    setBook(loadAccountsBook());
    setInboxVersion((v) => v + 1);
    setPicked(null);
    return null;
  }

  // ---- 💸 تحويل الأموال (remittances.ts) ----
  // Its الكاش legs are cash entries carrying the transfer's id: rewritten whole on every change.
  function storeRemittances(next: RemittanceList, changed: Remittance | null, removedId?: string) {
    let cash = loadCashEntries();
    const id = changed?.id ?? removedId;
    if (id) cash = removeLinkedCashEntries(cash, id);
    if (changed) {
      for (const entry of remittanceCashEntries(changed)) {
        const posted = recordCashEntry(cash, entry);
        if (posted.ok) cash = posted.entries;
      }
    }
    saveCashEntries(cash);
    saveRemittances(next);
    setRemittances(next);
    setCashVersion((v) => v + 1);
  }

  function addRemittance(input: Parameters<typeof createRemittance>[1]): string | null {
    const result = createRemittance(remittances, input);
    if (!result.ok) return result.message;
    storeRemittances(result.list, result.remittance);
    return null;
  }

  function payRemittance(id: string, input: { amount: number; date: string; accountId: string }): string | null {
    const result = addRemittancePayment(remittances, id, input);
    if (!result.ok) return result.message;
    storeRemittances(result.list, result.list.find((r) => r.id === id) ?? null);
    return null;
  }

  function editRemittance(id: string, input: Parameters<typeof createRemittance>[1]): string | null {
    const result = updateRemittance(remittances, id, input);
    if (!result.ok) return result.message;
    storeRemittances(result.list, result.remittance);
    return null;
  }

  function removeRemittancePayment(id: string, paymentId: string) {
    const next = deleteRemittancePayment(remittances, id, paymentId);
    storeRemittances(next, next.find((r) => r.id === id) ?? null);
  }

  function removeRemittance(id: string) {
    storeRemittances(deleteRemittance(remittances, id), null, id);
  }

  // ---- 🔄 البداية من جديد / 🗑️ حذف الكل ----
  // His Oct 2026 rule: one permanent button. Each press starts profits & losses from today AND brings
  // الكاش, every bank/wallet and the KAST card to 0 (one correction each - nothing is deleted). The
  // debts stay: customers, suppliers, D (Starlink), representatives. «↩️» undoes every press at once.
  async function resetProfits() {
    const ok = await askDeleteCode(
      "البداية من جديد اليوم؟\n\n• الأرباح والخسائر (الصافي، الدخل، المصروف) تُحسب من اليوم، وكل المندوبين يبدأون حسابًا جديدًا.\n• الكاش وكل البنوك والمحافظ وبطاقة KAST تصير 0 (قيد تصحيح، ليس مصروفًا).\n• تبقى الديون: الزبائن، الموردون، D لستارلينك، المندوبون.\n• «↩️ إرجاع كل شيء كما كان» يعيده.",
    );
    if (!ok) return;
    const day = today();
    const reps = loadReps();
    const { reset: next, repStore: nextReps } = startProfitFresh(reps);
    const merged = profitReset ? { ...next, previousRepResets: { ...next.previousRepResets, ...profitReset.previousRepResets } } : next;
    saveRepresentativeStore(nextReps);
    saveProfitReset(merged);
    setProfitReset(merged);
    // الكاش → 0
    const ledger = loadLedgerStore();
    const cashBalance = computeCashBalanceByCurrency(cashInHandEntries(loadCashEntries(), ledger, book));
    saveCashEntries(resetCashToZero(loadCashEntries(), cashBalance, day));
    setCashResetOn(hasCashReset(loadCashEntries()));
    // every bank / wallet → 0
    const zeroedBook = zeroAccountsBalances(book, accountBalances, day);
    saveAccountsBook(zeroedBook);
    setBook(zeroedBook);
    // 💳 KAST → 0
    const cardList = zeroCardBalance(loadCardTopUps(), currentCardBalanceUsd(ledger), day);
    saveCardTopUps(cardList);
    setCardResetOn(hasCardReset(cardList));
    setCashVersion((v) => v + 1);
  }

  async function undoResetProfits() {
    if (!(await askDeleteCode("إرجاع كل شيء كما كان؟\n\nالأرباح والخسائر القديمة، حسابات المندوبين، ورصيد الكاش والبنوك والمحافظ وبطاقة KAST قبل التصفير."))) return;
    if (profitReset) saveRepresentativeStore(undoProfitFresh(profitReset, loadReps()));
    saveProfitReset(null);
    setProfitReset(null);
    saveCashEntries(undoCashReset(loadCashEntries()));
    setCashResetOn(false);
    const restoredBook = undoAccountsReset(book);
    saveAccountsBook(restoredBook);
    setBook(restoredBook);
    saveCardTopUps(undoCardReset(loadCardTopUps()));
    setCardResetOn(false);
    setCashVersion((v) => v + 1);
  }

  // ↩️ ارجاع الكاش إلى 0: a correction entry per currency offsets الكاش to 0 (undoable, nothing deleted).
  async function resetCash() {
    const ledger = loadLedgerStore();
    const balance = computeCashBalanceByCurrency(cashInHandEntries(loadCashEntries(), ledger, book));
    if (!Object.values(balance).some((v) => Math.abs(v) >= 0.005)) {
      window.alert("الكاش 0 بالفعل.");
      return;
    }
    if (!(await askDeleteCode("إرجاع الكاش إلى 0؟\n\n• يُسجَّل قيد تصحيح يجعل رصيد الكاش 0 اليوم.\n• لا يُحذف شيء، ولا يُحسب كمصروف.\n• «↩️ تراجع عن تصفير الكاش» يعيده."))) return;
    saveCashEntries(resetCashToZero(loadCashEntries(), balance, today()));
    setCashResetOn(true);
    setCashVersion((v) => v + 1);
  }

  async function wipeEverything() {
    const ok = await askDeleteCode(
      "⚠️ حذف كل المعاملات وتصفير كل الحسابات؟\n\n• تُحذف كل الشحنات والدفعات والكاش والفواتير وحركات المخزون والمصاريف والدخل والديون وتسويات المناديب وشحن البطاقة والديون السابقة.\n• تصير كل الأرصدة 0 (البنوك والمحافظ تبقى برصيد 0).\n• تبقى الأجهزة والزبائن والمناديب والموردون والأصناف والإعدادات.\n• تُحفظ نسخة استرجاع على الهاتف: «↩️ استرجاع ما حُذف» يعيد كل شيء.",
    );
    if (!ok) return;
    const result = wipeAllTransactions(window.localStorage, today());
    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    window.location.reload();
  }

  async function restoreWiped() {
    if (!wipeUndo || !(await askDeleteCode(`استرجاع كل ما حُذف يوم ${wipeUndo.at.slice(0, 10)}؟ ما سجّلته بعده في نفس الأماكن يُستبدل بالقديم.`))) return;
    const result = undoWipe(window.localStorage);
    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    window.location.reload();
  }

  const hero = (
    <>
      <div className="report-period-row">
        {months.map((m) => (
          <button key={m} type="button" className={`report-period-btn${m === month ? " report-period-btn-active" : ""}`} onClick={() => setMonth(m)}>
            {monthLabel(m)}
          </button>
        ))}
      </div>

      <div className={`net-hero money-hero${left.leftMru < 0 ? " is-loss" : ""}`}>
        <span className="net-hero-label">يبقى لك في {monthLabel(month)}</span>
        <strong className="net-hero-value">
          <bdi dir="ltr">{mru(left.leftMru)}</bdi> <small>أوقية</small>
        </strong>
        <ul className="money-lines">
          <Line icon="📈" label="أرباح عملك (الصافي)" value={left.businessMru} />
          {left.remittanceMru !== 0 && <Line icon="💸" label="أرباح التحويل" value={left.remittanceMru} />}
          <Line icon="💵" label="دخلك" value={left.incomeMru} />
          <Line icon="🧾" label="مصروفاتك" value={left.expenseMru} minus />
        </ul>
      </div>

      <div data-tour="money-wealth">
        <WealthCard wealth={wealth} onOpen={setOpenLine} />
      </div>
      {missing.length > 0 && (
        <p className="settings-hint">
          لم تُحتسب مبالغ بعملات بلا سعر: {missing.join("، ")} - <Link href="/currencies">سجّل أسعارها</Link>.
        </p>
      )}
    </>
  );

  return (
    <main className="home money-page">
      <div className="page-title-row">
        <h1 className="section-title">💰 حسابي</h1>
        <Link href="/reports" className="report-card-note">
          التقارير ←
        </Link>
      </div>

      <BankInboxCard
        pending={pending.length}
        enabled={notifEnabled}
        onOpen={() => setInboxOpen(true)}
        onEnable={() => {
          void openKastNotificationAccess();
          window.setTimeout(() => void kastNotificationsEnabled().then(setNotifEnabled), 4000);
        }}
      />

      {hero}

      <RemittanceSection
        list={remittances}
        accounts={book.accounts}
        rates={rates}
        month={month}
        since={profitReset?.date}
        onSave={addRemittance}
        onPay={payRemittance}
        onDelete={removeRemittance}
        onEdit={editRemittance}
        onDeletePayment={removeRemittancePayment}
      />

      <div className="report-tabs" role="tablist" aria-label="حسابي">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`report-tab${tab === t.id ? " report-tab-active" : ""}`} onClick={() => chooseTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "income" && (
        <>
          <IncomeTab
            accounts={sources}
            month={month}
            incomes={incomes}
            custom={incomeCats}
            rates={rates}
            openNew={newRecord}
            onOpened={consumed}
            onSave={saveIncomeRecord}
            onDelete={removeIncome}
            onAddCategory={(name, icon, parentId) => {
              const result = addIncomeCategory(incomeCats, name, icon, parentId);
              if (!result.ok) return result.message;
              saveIncomeCategories(result.list);
              setIncomeCats(result.list);
              return null;
            }}
            onRemoveCategory={(id) => {
              const next = removeIncomeCategory(incomeCats, id);
              saveIncomeCategories(next);
              setIncomeCats(next);
            }}
          />
          <RecurringSection accounts={sources} kind="income" rules={rules} incomeCustom={incomeCats} expenseCustom={expenseCats} onAdd={addRule} onDelete={removeRule} />
        </>
      )}

      {tab === "expense" && (
        <>
          <PersonalExpensesTab
            accounts={sources}
            openNew={newRecord}
            onOpened={consumed}
            expenses={expenses}
            custom={expenseCats}
            rates={rates}
            onChange={(list, custom) => {
              // A 🔁 expense deleted: that month stays without it.
              let nextRules = rules;
              for (const old of expenses) {
                if (old.recurringId && !list.some((e) => e.id === old.id)) nextRules = skipRecurringMonth(nextRules, old.recurringId, old.date.slice(0, 7));
              }
              if (nextRules !== rules) {
                saveRecurring(nextRules);
                setRules(nextRules);
              }
              setExpenses(list);
              setExpenseCats(custom);
              setCashVersion((v) => v + 1);
            }}
          />
          <RecurringSection accounts={sources} kind="expense" rules={rules} incomeCustom={incomeCats} expenseCustom={expenseCats} onAdd={addRule} onDelete={removeRule} />
        </>
      )}

      {shownLine && (
        <PartySheet title={`${shownLine.icon} ${shownLine.label}`} onClose={() => setOpenLine(null)}>
          {shownLine.key === "banks" ? (
            <AccountsManager
              book={book}
              balances={accountBalances}
              onStatement={setStatementOf}
              onAdd={(input) => {
                const result = addMoneyAccount(book, input);
                if (!result.ok) return result.message;
                saveAccountsBook(result.book);
                setBook(result.book);
                return null;
              }}
              onCorrect={(account, actual) => {
                if (account.balanceSet === false) {
                  const first = setOpeningBalance(book, account.id, actual, today());
                  if (!first.ok) return first.message;
                  saveAccountsBook(first.book);
                  setBook(first.book);
                  return null;
                }
                const ledger = loadLedgerStore();
                const flows = loadAccountFlows(ledger, account, personalFlows(incomes, expenses, debts), book.accounts);
                const result = correctBalance(book, account, flows, actual, today());
                if (!result.ok) return result.message;
                saveAccountsBook(result.book);
                setBook(result.book);
                return null;
              }}
              onDelete={(account) => {
                const next = deleteMoneyAccount(book, account.id);
                saveAccountsBook(next);
                setBook(next);
              }}
              onDeleteTransfer={(id) => {
                // A transfer with الكاش takes its cash entry with it.
                updateCash((cash) => removeLinkedCashEntries(cash, id));
                const next = deleteAccountTransfer(book, id);
                saveAccountsBook(next);
                setBook(next);
              }}
            />
          ) : (
            <WealthLineDetail line={shownLine} />
          )}
          {shownLine.places?.map((place) => (
            <button key={place.id} type="button" className="dialog-primary" onClick={() => setStatementOf(place.id)}>
              📄 كشف حساب {place.id === CASH_PLACE ? "الكاش" : place.name}
            </button>
          ))}
          {shownLine.key.startsWith("cash") && <p className="settings-hint">الكاش كما في صفحة «الكاش»، بدون دفعات الزبائن التي دخلت تطبيقاً بنكياً مربوطاً بطريقتها.</p>}
          {shownLine.key === "starlink" && <p className="settings-hint">شحنات D والديون السابقة التي لم تُدفع لستارلينك بعد (بالدولار).</p>}
        </PartySheet>
      )}

      {statement && (
        <PartySheet title={`📄 كشف حساب ${statement.place.icon} ${statement.place.name}`} onClose={() => setStatementOf(null)}>
          <PlaceStatement ledger={statement} account={book.accounts.find((a) => a.id === statement.place.id)} />
        </PartySheet>
      )}

      {inboxOpen && (
        <PartySheet
          title={picked ? "📩 أكّد العملية" : "📩 عمليات البنوك"}
          onClose={() => {
            setPicked(null);
            setInboxOpen(false);
          }}
        >
          {picked && confirmData ? (
            <>
              <button type="button" className="btn-icon" onClick={() => setPicked(null)}>
                → القائمة
              </button>
              <SuggestionConfirm
                key={picked.id}
                suggestion={picked}
                data={confirmData}
                onSave={(input) => confirmSuggestion(picked, input)}
                onReject={() => {
                  storeInbox(decideSuggestion(inbox, picked.id, "rejected", undefined));
                  setPicked(null);
                }}
              />
            </>
          ) : (
            <BankInboxList pending={pending} decided={decided} onPick={setPicked} onReopen={(s) => storeInbox(reopenSuggestion(inbox, s.id))} />
          )}
        </PartySheet>
      )}

      <section className="report-card money-danger" data-tour="money-fresh-start">
        <div className="report-card-head">
          <h3>⚙️ البداية من جديد</h3>
        </div>
        {profitReset && (
          <p className="settings-hint">
            آخر بداية: <bdi dir="ltr">{profitReset.date}</bdi> - الأرباح والخسائر تُحسب منها.
          </p>
        )}
        <button type="button" className="dialog-secondary" onClick={() => void resetProfits()}>
          🔄 البداية من جديد: الأرباح والكاش والبنوك من 0 (الديون تبقى)
        </button>
        <button type="button" className="dialog-secondary" onClick={() => void resetCash()}>
          💵 إرجاع الكاش إلى 0 فقط
        </button>
        {(profitReset || cashResetOn || cardResetOn || hasAccountsReset(book)) && (
          <button type="button" className="dialog-secondary" onClick={() => void undoResetProfits()}>
            ↩️ إرجاع كل شيء كما كان (قبل التصفير)
          </button>
        )}
        <button type="button" className="dialog-danger" onClick={() => void wipeEverything()}>
          🗑️ حذف كل المعاملات وتصفير كل الحسابات
        </button>
        {wipeUndo && (
          <button type="button" className="dialog-secondary" onClick={() => void restoreWiped()}>
            ↩️ استرجاع ما حُذف يوم <bdi dir="ltr">{wipeUndo.at.slice(0, 10)}</bdi>
          </button>
        )}
      </section>

      {/* ➕ like the home screen's: a new income / expense / debt for the open tab (long-press pins it). */}
      <div className="home-fab">
        <button
          type="button"
          className="home-fab-button money-fab-button"
          aria-label="إضافة"
          title="إضافة"
          data-shortcut-route={ADD_MONEY_ROUTE}
          onClick={startNew}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </main>
  );
}
