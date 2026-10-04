"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { AccountsManager, DebtsTab, IncomeTab, RecurringSection, today, WealthCard, WealthLineDetail } from "@/components/MyMoney";
import { BankInboxCard, BankInboxList, SuggestionConfirm, type ConfirmData, type ConfirmInput } from "@/components/BankInbox";
import { decideSuggestion, decidedSuggestions, EMPTY_BANK_INBOX, loadBankInbox, pendingSuggestions, reopenSuggestion, saveBankInbox, type BankInbox, type BankSuggestion } from "@/lib/bankNotices";
import { saveSuggestionChoice } from "@/lib/bankSuggestionSave";
import { listClients, loadClientStore } from "@/lib/clientStore";
import { drainBankNotices, kastNotificationsEnabled, openKastNotificationAccess } from "@/lib/localBrowser";
import { listRepresentatives, loadRepresentativeStore } from "@/lib/repStore";
import { listSuppliers, loadSupplierStore } from "@/lib/supplierStore";
import { PartySheet } from "@/components/AccountsSection";
import { PersonalExpensesTab } from "@/components/PersonalExpensesTab";
import { loadCashEntries, removeLinkedCashEntries, saveCashEntries } from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";
import { monthLabel } from "@/lib/monthClosing";
import {
  addDebt,
  addDebtPayment,
  addIncome,
  addRecurringRule,
  debtTotals,
  deleteDebt,
  deleteDebtPayment,
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
  saveDebtBook,
  saveIncome,
  saveIncomeCategories,
  saveRecurring,
  skipRecurringMonth,
  syncDebtCash,
  syncDebtPaymentCash,
  syncIncomeCash,
  addIncomeCategory,
  type DebtBook,
  type IncomeList,
  type RecurringList,
  type WealthLine,
} from "@/lib/myMoney";
import { businessNetForMonth, loadAccountFlows, loadMoneyAccounts, loadRates, loadWealthInput } from "@/lib/myMoneyData";
import {
  accountBalance,
  addMoneyAccount,
  correctBalance,
  deleteAccountTransfer,
  deleteMoneyAccount,
  loadAccountsBook,
  saveAccountsBook,
  seedDefaultAccounts,
  setOpeningBalance,
  type AccountsBook,
} from "@/lib/moneyAccounts";
import { loadLedgerStore } from "@/lib/ledgerStore";
import {
  loadCustomCategories,
  loadPersonalExpenses,
  savePersonalExpenses,
  syncExpenseCash,
  type ExpenseCategory,
  type PersonalExpenseList,
} from "@/lib/personalExpenses";
import type { RatesFromUsd } from "@/lib/reportsView";
import { ADD_MONEY_ROUTE, parseAddMoney, SAME_PAGE_ROUTE_EVENT } from "@/lib/shortcuts";

type MoneyTab = "income" | "expense" | "debts";
const TABS: { id: MoneyTab; label: string }[] = [
  { id: "income", label: "الدخل" },
  { id: "expense", label: "المصروف" },
  { id: "debts", label: "الديون" },
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
  // Bumped whenever الكاش changes, so «كل ما تملك» is recomputed.
  const [cashVersion, setCashVersion] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 🏦 bank / wallet notifications waiting for his confirmation (lib/bankNotices.ts).
  const [inbox, setInbox] = useState<BankInbox>(EMPTY_BANK_INBOX);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [picked, setPicked] = useState<BankSuggestion | null>(null);
  const [notifEnabled, setNotifEnabled] = useState<boolean | null>(null);
  // Bumped when a confirmed notification wrote a supplier / rep / customer record.
  const [inboxVersion, setInboxVersion] = useState(0);

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
    const ruleList = loadRecurring();
    let incomeList = loadIncome();
    let expenseList = loadPersonalExpenses();
    const incomeCustom = loadIncomeCategories();
    const expenseCustom = loadCustomCategories();
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
      if (saved === "income" || saved === "expense" || saved === "debts") setTab(saved);
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
  const left = useMemo(() => monthLeft({ month, businessNetMru: business.netMru, incomes, expenses, rates }), [month, business, incomes, expenses, rates]);
  const wealth = useMemo(
    () => buildWealth(loadWealthInput({ accounts, rates, incomes, expenses, debts, book })),
    // الكاش changes (cashVersion) are read from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, rates, incomes, expenses, debts, book, cashVersion, loaded, inboxVersion],
  );
  const accountBalances = useMemo(() => {
    const ledger = loadLedgerStore();
    const flows = personalFlows(incomes, expenses, debts);
    return Object.fromEntries(book.accounts.map((a) => [a.id, accountBalance(book, a, loadAccountFlows(ledger, a, flows))]));
    // Supplier / rep payments from a bank notification are read from storage (inboxVersion).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, incomes, expenses, debts, inboxVersion]);
  const sources = book.accounts.map((a) => ({ id: a.id, name: a.name, icon: a.icon }));
  const owed = useMemo(() => debtTotals(debts), [debts]);
  const missing = Array.from(new Set([...business.missing, ...left.missing, ...wealth.missing]));
  const shownLine = openLine ? wealth.lines.find((l) => l.key === openLine.key) ?? openLine : null;

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

  // ---- الديون ----
  function saveDebts(book: DebtBook) {
    saveDebtBook(book);
    setDebts(book);
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
          <Line icon="💵" label="دخلك" value={left.incomeMru} />
          <Line icon="🧾" label="مصروفاتك" value={left.expenseMru} minus />
        </ul>
      </div>

      <WealthCard wealth={wealth} onOpen={setOpenLine} />
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
            onAddCategory={(name, icon) => {
              const result = addIncomeCategory(incomeCats, name, icon);
              if (!result.ok) return result.message;
              saveIncomeCategories(result.list);
              setIncomeCats(result.list);
              return null;
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

      {tab === "debts" && (
        <DebtsTab
          accounts={sources}
          book={debts}
          totals={owed}
          openNew={newRecord}
          onOpened={consumed}
          onAdd={(input) => {
            const result = addDebt(debts, input);
            if (!result.ok) return result.message;
            updateCash((cash) => syncDebtCash(cash, result.debt));
            saveDebts(result.book);
            return null;
          }}
          onPay={(debt, amount, date, viaCash, accountId) => {
            const result = addDebtPayment(debts, { debtId: debt.id, amount, date, viaCash, accountId });
            if (!result.ok) return result.message;
            updateCash((cash) => syncDebtPaymentCash(cash, result.payment, debt));
            saveDebts(result.book);
            return null;
          }}
          onDeleteDebt={(debt) => {
            const removed = deleteDebt(debts, debt.id);
            updateCash((cash) => removed.removedIds.reduce((acc, id) => removeLinkedCashEntries(acc, id), cash));
            saveDebts(removed.book);
          }}
          onDeletePayment={(paymentId) => {
            updateCash((cash) => removeLinkedCashEntries(cash, paymentId));
            saveDebts(deleteDebtPayment(debts, paymentId));
          }}
        />
      )}

      {shownLine && (
        <PartySheet title={`${shownLine.icon} ${shownLine.label}`} onClose={() => setOpenLine(null)}>
          {shownLine.key === "banks" ? (
            <AccountsManager
              book={book}
              balances={accountBalances}
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
                const flows = loadAccountFlows(ledger, account, personalFlows(incomes, expenses, debts));
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
                const next = deleteAccountTransfer(book, id);
                saveAccountsBook(next);
                setBook(next);
              }}
            />
          ) : (
            <WealthLineDetail line={shownLine} />
          )}
          {shownLine.key === "cash" && <p className="settings-hint">الكاش كما في صفحة «الكاش»، بدون دفعات الزبائن التي دخلت تطبيقاً بنكياً مربوطاً بطريقتها.</p>}
          {shownLine.key === "starlink" && <p className="settings-hint">شحنات D والديون السابقة التي لم تُدفع لستارلينك بعد (بالدولار).</p>}
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
