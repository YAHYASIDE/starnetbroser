"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ADD_EXPENSE_ROUTE, parseAddExpense, SAME_PAGE_ROUTE_EVENT } from "@/lib/shortcuts";
import { StarlinkAccountSummary } from "@starnet/shared";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import { LedgerByAccount, loadLedgerStore } from "@/lib/ledgerStore";
import { filterEntriesByPeriod, filterEntriesByProfitDate, REPORT_PERIOD_LABELS, REPORT_PERIODS, ReportPeriod } from "@/lib/reportPeriod";
import { ClientStore, getClient, listClients, loadClientStore } from "@/lib/clientStore";
import { formatAmount } from "@/lib/formatAmount";
import { InvoiceList, loadInvoices } from "@/lib/invoiceStore";
import { getStoreItem, loadStoreItems, loadStoreTransactions, StoreItemRegistry, StoreTransactionList } from "@/lib/storeStore";
import { computeClientSalesTotals, computeItemSalesTotals, computeStoreSalesSummary } from "@/lib/storeReports";
import { CashEntryList, loadCashEntries, listStandaloneCashEntries } from "@/lib/cashStore";
import { computeRepSharesMru, listRepresentatives, loadRepresentativeStore, loadRepSettlements, RepresentativeStore, RepSettlementList, saveRepresentativeStore } from "@/lib/repStore";
import { sumProfitMru } from "@/lib/profitMru";
import { CurrencyStore, loadCurrencyStore } from "@/lib/currencyStore";
import { daysRemainingNumber } from "@/lib/date";
import { TodayPanel } from "@/components/TodayPanel";
import { MonthClosingSection } from "@/components/MonthClosingSection";
import { entriesAfterProfitReset, loadProfitReset, ProfitReset, saveProfitReset, startProfitFresh, undoProfitFresh } from "@/lib/profitReset";
import { loadAllocationStore, AllocationsByAccount } from "@/lib/paymentAllocationStore";
import {
  buildProfitRows,
  groupProfitDays,
  HiddenProfitDays,
  hideProfitDay,
  loadHiddenProfitDays,
  saveHiddenProfitDays,
  showProfitDay,
  withoutHiddenProfitDays,
} from "@/lib/profitStatement";
import { ProfitStatement } from "@/components/ProfitStatement";
import { askDeleteCode } from "@/components/DeleteCodePrompt";
import { loadClientProfitResets, profitResetByAccount } from "@/lib/clientBulk";
import { computeDebtAging } from "@/lib/debtAging";
import { loadPartyAdjustments, PartyAdjustmentList } from "@/lib/partyBalanceStore";
import { buildCardStatement, listCardPayments, listOpenShipmentDebts, loadCardTopUps, totalOpenDebtUsd, CardTopUpList } from "@/lib/starlinkDebt";
import { listOpenPreviousDebts, loadPreviousDebts, PreviousDebtList, totalPreviousDebtUsd } from "@/lib/previousDebt";
import { buildBusinessWorkbook, xlsxFileName } from "@/lib/excelExport";
import { buildMonthNet, monthChange } from "@/lib/netProfit";
import { loadCustomCategories, loadPersonalExpenses, monthExpensesMru, type ExpenseCategory, type PersonalExpenseList } from "@/lib/personalExpenses";
import { PersonalExpensesTab } from "@/components/PersonalExpensesTab";
import { monthLabel, recentMonths } from "@/lib/monthClosing";
import { exportXlsx } from "@/lib/xlsxExport";
import {
  profitSeries,
  RatesFromUsd,
  rankClientProfits,
  rankDeviceProfits,
  repBalancesMru,
  SeriesPoint,
  sumToMru,
  toMru,
  valueSeries,
} from "@/lib/reportsView";

type ReportTab = "net" | "starlink" | "store" | "debts" | "expenses";

const TAB_LABELS: Record<ReportTab, string> = { net: "الصافي", starlink: "ستارلينك", store: "المتجر", debts: "الديون", expenses: "المصروفات" };
const TAB_KEY = "starnet.reportsTab";

function shipments(n: number): string {
  return `${n} ${n >= 3 && n <= 10 ? "شحنات" : "شحنة"}`;
}

function mru(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value)))}`;
}

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [invoices, setInvoices] = useState<InvoiceList>([]);
  const [storeItems, setStoreItems] = useState<StoreItemRegistry>({});
  const [storeTransactions, setStoreTransactions] = useState<StoreTransactionList>([]);
  const [cashEntries, setCashEntries] = useState<CashEntryList>([]);
  const [currencyStore, setCurrencyStore] = useState<CurrencyStore>({});
  const [repStore, setRepStore] = useState<RepresentativeStore>({});
  const [settlements, setSettlements] = useState<RepSettlementList>([]);
  const [adjustments, setAdjustments] = useState<PartyAdjustmentList>([]);
  const [topUps, setTopUps] = useState<CardTopUpList>([]);
  const [previousDebts, setPreviousDebts] = useState<PreviousDebtList>([]);
  const [profitReset, setProfitReset] = useState<ProfitReset | null>(null);
  const [hiddenDays, setHiddenDays] = useState<HiddenProfitDays>({});
  const [allocations, setAllocations] = useState<AllocationsByAccount>({});
  const [showExpected, setShowExpected] = useState(false);
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [tab, setTab] = useState<ReportTab>("net");
  const [netMonth, setNetMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [personal, setPersonal] = useState<PersonalExpenseList>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  // 🧾 bumped by the floating button / the home-screen shortcut: opens a new expense.
  const [newExpense, setNewExpense] = useState(0);

  function startExpense() {
    chooseTab("expenses");
    setNewExpense((n) => n + 1);
  }

  // Opened from the 📌 shortcut ("/reports?add=expense"), or it tapped while the page is open.
  useEffect(() => {
    if (parseAddExpense(window.location.search)) {
      window.history.replaceState(null, "", window.location.pathname);
      startExpense();
    }
    const onRoute = (event: Event) => {
      const route = (event as CustomEvent<string>).detail ?? "";
      if (route.includes("?") && parseAddExpense(route.slice(route.indexOf("?")))) startExpense();
    };
    window.addEventListener(SAME_PAGE_ROUTE_EVENT, onRoute);
    return () => window.removeEventListener(SAME_PAGE_ROUTE_EVENT, onRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLedgerStore(loadLedgerStore());
    setClientStore(loadClientStore());
    setInvoices(loadInvoices());
    setStoreItems(loadStoreItems());
    setStoreTransactions(loadStoreTransactions());
    setCashEntries(loadCashEntries());
    setCurrencyStore(loadCurrencyStore());
    setRepStore(loadRepresentativeStore());
    setSettlements(loadRepSettlements());
    setAdjustments(loadPartyAdjustments());
    setTopUps(loadCardTopUps());
    setPreviousDebts(loadPreviousDebts());
    setProfitReset(loadProfitReset());
    setHiddenDays(loadHiddenProfitDays());
    setAllocations(loadAllocationStore());
    setPersonal(loadPersonalExpenses());
    setExpenseCategories(loadCustomCategories());
    try {
      const saved = window.localStorage.getItem(TAB_KEY);
      if (saved === "net" || saved === "starlink" || saved === "store" || saved === "debts" || saved === "expenses") setTab(saved);
    } catch {
      // A per-phone convenience only.
    }
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  function chooseTab(next: ReportTab) {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      // Ignored - see above.
    }
  }

  // Display-only conversion to أوقية at today's registered rates (the records keep their currency).
  const rates = useMemo<RatesFromUsd>(() => {
    const result: RatesFromUsd = {};
    for (const [code, currency] of Object.entries(currencyStore)) result[code] = currency.rateFromUsd;
    return result;
  }, [currencyStore]);
  const mruRate = rates.MRU;
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archivedAt && !a.deletedAt), [accounts]);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "جهاز محذوف";

  // ---- ستارلينك: profit counted on the day Starlink was paid, after any "fresh start" ----
  // Each device starts from the later of the global fresh start and its client's (clientBulk.ts).
  const resetByAccount = useMemo(() => profitResetByAccount(accounts, loadClientProfitResets(), profitReset), [accounts, profitReset]);
  // 🙈 Hidden days are left out of every profit figure below (nothing is deleted).
  const visibleLedger = useMemo(() => withoutHiddenProfitDays(ledgerStore, hiddenDays), [ledgerStore, hiddenDays]);
  const profitByAccount = useMemo(() => {
    const result: Record<string, LedgerByAccount[string]> = {};
    for (const [accountId, entries] of Object.entries(visibleLedger)) {
      const reset = accountId in resetByAccount ? resetByAccount[accountId] : profitReset;
      result[accountId] = entriesAfterProfitReset(filterEntriesByProfitDate(entries, period), reset ?? null);
    }
    return result;
  }, [visibleLedger, period, profitReset, resetByAccount]);
  const profitEntries = useMemo(() => Object.values(profitByAccount).flat(), [profitByAccount]);
  const openEntries = useMemo(
    () => Object.values(ledgerStore).flat().filter((e) => e.kind === "debit" && e.starlinkCost?.status === "pending"),
    [ledgerStore],
  );
  const profit = useMemo(() => (mruRate ? sumProfitMru(profitEntries, mruRate) : undefined), [profitEntries, mruRate]);
  const expected = useMemo(() => (mruRate ? sumProfitMru(openEntries, mruRate) : undefined), [openEntries, mruRate]);
  const repShares = useMemo(() => (mruRate ? computeRepSharesMru(profitEntries, mruRate).confirmed : undefined), [profitEntries, mruRate]);
  const profitChart = useMemo(() => (mruRate ? profitSeries(profitEntries, period, mruRate) : []), [profitEntries, period, mruRate]);
  // 📒 The statement: the period's paid shipments day by day, and every open D as expected profit.
  const statementDays = useMemo(() => groupProfitDays(buildProfitRows(profitByAccount, allocations, mruRate, "confirmed")), [profitByAccount, allocations, mruRate]);
  const expectedDays = useMemo(() => groupProfitDays(buildProfitRows(ledgerStore, allocations, mruRate, "expected")), [ledgerStore, allocations, mruRate]);
  // «الصافي» shows the chosen month's shipments the same way (every period, after resets/hidden days).
  const allTimeProfitLedger = useMemo(() => {
    const result: LedgerByAccount = {};
    for (const [accountId, entries] of Object.entries(visibleLedger)) {
      const reset = accountId in resetByAccount ? resetByAccount[accountId] : profitReset;
      result[accountId] = entriesAfterProfitReset(entries, reset ?? null);
    }
    return result;
  }, [visibleLedger, profitReset, resetByAccount]);
  const allConfirmedRows = useMemo(() => buildProfitRows(allTimeProfitLedger, allocations, mruRate, "confirmed"), [allTimeProfitLedger, allocations, mruRate]);
  const statementNames = useMemo(
    () => ({
      device: (id: string) => accounts.find((a) => a.id === id)?.name ?? "جهاز محذوف",
      client: (id: string) => getClient(clientStore, accounts.find((a) => a.id === id)?.clientId)?.name,
      rep: (id: string) => repStore[id]?.name,
    }),
    [accounts, clientStore, repStore],
  );

  async function handleHideDay(date: string) {
    if (!(await askDeleteCode(`إخفاء أرباح يوم ${date} من التقارير؟\nلا يُحذف شيء: الشحنات والأرصدة تبقى، و«إظهار» يعيدها.`))) return;
    const next = hideProfitDay(hiddenDays, date);
    saveHiddenProfitDays(next);
    setHiddenDays(next);
  }

  function handleShowDay(date: string) {
    const next = showProfitDay(hiddenDays, date);
    saveHiddenProfitDays(next);
    setHiddenDays(next);
  }

  async function handleResetAll() {
    const message = "تصفير كل الأرباح من الآن؟\n\n• التقارير تحسب الأرباح من اليوم فقط.\n• كل المندوبين يبدأون حسابًا جديدًا.\n• لا يُحذف شيء، و«↩️ إرجاع الأرباح» يعيدها.";
    if (!(await askDeleteCode(message))) return;
    const { reset: next, repStore: nextReps } = startProfitFresh(repStore);
    const merged = profitReset ? { ...next, previousRepResets: { ...next.previousRepResets, ...profitReset.previousRepResets } } : next;
    saveRepresentativeStore(nextReps);
    setRepStore(nextReps);
    saveProfitReset(merged);
    setProfitReset(merged);
  }

  async function handleUndoReset() {
    if (!profitReset) return;
    if (!(await askDeleteCode("إرجاع كل الأرباح القديمة وحسابات المندوبين كما كانت؟"))) return;
    const nextReps = undoProfitFresh(profitReset, repStore);
    saveRepresentativeStore(nextReps);
    setRepStore(nextReps);
    saveProfitReset(null);
    setProfitReset(null);
  }

  const deviceRanks = useMemo(() => (mruRate ? rankDeviceProfits(profitByAccount, mruRate) : []), [profitByAccount, mruRate]);
  const clientRanks = useMemo(
    () => rankClientProfits(deviceRanks, (id) => accounts.find((a) => a.id === id)?.clientId),
    [deviceRanks, accounts],
  );

  // ---- الصافي: the whole business, one calendar month at a time ----
  const netMonths = useMemo(() => recentMonths(new Date().toISOString().slice(0, 10), 12), []);
  const netByMonth = useMemo(
    () =>
      netMonths.map((month) =>
        buildMonthNet({ month, ledgerStore: visibleLedger, invoices, transactions: storeTransactions, cash: cashEntries, rates, profitReset, profitResetByAccount: resetByAccount }),
      ),
    [netMonths, visibleLedger, invoices, storeTransactions, cashEntries, rates, profitReset, resetByAccount],
  );
  const netIndex = Math.max(0, netMonths.indexOf(netMonth));
  const net = netByMonth[netIndex];
  // 🧾 the operator's own spending (تبويب «المصروفات») - not a business expense: only «يبقى لك».
  const personalMonth = net ? monthExpensesMru(personal, net.month, rates) : { mru: 0, missing: [] };
  const previousNet = netByMonth[netIndex + 1];
  const netTrend = useMemo(
    () =>
      netByMonth
        .slice(0, 6)
        .reverse()
        .map((m) => ({ key: m.month, label: monthLabel(m.month).split(" ")[0], value: m.netMru })),
    [netByMonth],
  );

  // ---- المتجر ----
  const periodInvoices = useMemo(() => filterEntriesByPeriod(invoices, period), [invoices, period]);
  const storeSummary = useMemo(() => computeStoreSalesSummary(storeTransactions, invoices, periodInvoices), [storeTransactions, invoices, periodInvoices]);
  const periodExpenses = useMemo(
    () => filterEntriesByPeriod(listStandaloneCashEntries(cashEntries), period).filter((e) => e.kind === "out"),
    [cashEntries, period],
  );
  const store = useMemo(() => {
    const expensesByCurrency: Record<string, number> = {};
    for (const e of periodExpenses) expensesByCurrency[e.currencyCode] = (expensesByCurrency[e.currencyCode] ?? 0) + e.amount;
    const sales = sumToMru(storeSummary.salesByCurrency, rates);
    const cogs = sumToMru(storeSummary.cogsByCurrency, rates);
    const shipping = sumToMru(storeSummary.shippingCostByCurrency, rates);
    const expenses = sumToMru(expensesByCurrency, rates);
    const missing = Array.from(new Set([...sales.missing, ...cogs.missing, ...shipping.missing, ...expenses.missing]));
    return { sales: sales.mru, cogs: cogs.mru, costs: shipping.mru + expenses.mru, net: sales.mru - cogs.mru - shipping.mru - expenses.mru, missing };
  }, [storeSummary, periodExpenses, rates]);
  const storeChart = useMemo(() => {
    const byDate = new Map<string, InvoiceList>();
    for (const inv of periodInvoices) byDate.set(inv.date, [...(byDate.get(inv.date) ?? []), inv]);
    const items: { date: string; value: number }[] = [];
    for (const [date, dayInvoices] of byDate) {
      const s = computeStoreSalesSummary(storeTransactions, invoices, dayInvoices);
      items.push({
        date,
        value: sumToMru(s.salesByCurrency, rates).mru - sumToMru(s.cogsByCurrency, rates).mru - sumToMru(s.shippingCostByCurrency, rates).mru,
      });
    }
    for (const e of periodExpenses) items.push({ date: e.date, value: -(toMru(e.amount, e.currencyCode, rates) ?? 0) });
    return valueSeries(items, period);
  }, [periodInvoices, periodExpenses, storeTransactions, invoices, rates, period]);
  const topItems = useMemo(
    () =>
      computeItemSalesTotals(periodInvoices)
        .map((row) => ({ row, mru: sumToMru(row.totalByCurrency, rates).mru }))
        .filter((r) => r.mru > 0.5)
        .sort((a, b) => b.mru - a.mru)
        .slice(0, 5),
    [periodInvoices, rates],
  );
  const topStoreClients = useMemo(
    () =>
      computeClientSalesTotals(periodInvoices)
        .map((row) => ({ row, mru: sumToMru(row.totalByCurrency, rates).mru }))
        .filter((r) => r.mru > 0.5)
        .sort((a, b) => b.mru - a.mru)
        .slice(0, 5),
    [periodInvoices, rates],
  );

  // ---- الديون: running balances, whatever the period ----
  const debtors = useMemo(() => {
    const rows = computeDebtAging({
      clients: listClients(clientStore),
      accounts,
      invoices,
      adjustments,
      ledgerStore,
      today: new Date().toISOString().slice(0, 10),
    });
    const byParty = new Map<string, { key: string; name: string; byCurrency: Record<string, number>; oldestDays: number }>();
    for (const row of rows) {
      const key = `${row.kind}-${row.id}`;
      const party = byParty.get(key) ?? { key, name: row.name, byCurrency: {}, oldestDays: 0 };
      party.byCurrency[row.currencyCode] = (party.byCurrency[row.currencyCode] ?? 0) + row.total;
      party.oldestDays = Math.max(party.oldestDays, row.oldestDays);
      byParty.set(key, party);
    }
    return Array.from(byParty.values())
      .map((p) => ({ ...p, mru: sumToMru(p.byCurrency, rates).mru }))
      .sort((a, b) => b.mru - a.mru);
  }, [clientStore, accounts, invoices, adjustments, ledgerStore, rates]);
  const debtorsTotal = debtors.reduce((sum, d) => sum + d.mru, 0);
  const ownDUsd = useMemo(() => totalOpenDebtUsd(listOpenShipmentDebts(ledgerStore)), [ledgerStore]);
  const ownDCount = useMemo(() => new Set(listOpenShipmentDebts(ledgerStore).map((d) => d.accountId)).size, [ledgerStore]);
  const openPrevious = useMemo(() => listOpenPreviousDebts(previousDebts, ledgerStore), [previousDebts, ledgerStore]);
  const previousUsd = totalPreviousDebtUsd(openPrevious);
  const cardUsd = useMemo(() => buildCardStatement(topUps, listCardPayments(ledgerStore)).balanceUsd, [topUps, ledgerStore]);
  const repBalances = useMemo(
    () => repBalancesMru(listRepresentatives(repStore), ledgerStore, invoices, settlements, rates),
    [repStore, ledgerStore, invoices, settlements, rates],
  );
  const repsNet = repBalances.reduce((sum, r) => sum + r.balanceMru, 0);

  // "تصدير Excel": everything above for the chosen period, in one workbook.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function handleExportExcel() {
    setExporting(true);
    setExportError(null);
    const openD: Record<string, number> = {};
    for (const d of listOpenShipmentDebts(ledgerStore)) openD[d.accountId] = (openD[d.accountId] ?? 0) + d.costUsd;
    const previous: Record<string, number> = {};
    for (const d of openPrevious) previous[d.accountId] = (previous[d.accountId] ?? 0) + d.amountUsd;
    const now = new Date();
    const sheets = buildBusinessWorkbook({
      periodLabel: REPORT_PERIOD_LABELS[period],
      exportedAt: now,
      accounts,
      clientName: (id) => getClient(clientStore, id)?.name,
      clientPhone: (id) => getClient(clientStore, id)?.phone,
      repName: (id) => (id ? repStore[id]?.name : undefined),
      ledgerStore,
      profitByAccount,
      mruRate,
      openDUsdByAccount: openD,
      previousDebtUsdByAccount: previous,
      debtors,
      repBalances,
      totals: {
        profitMru: profit?.confirmedMru,
        repSharesMru: repShares,
        expectedMru: expected?.expectedMru,
        debtorsMru: debtorsTotal,
        starlinkUsd: ownDUsd + previousUsd,
        cardUsd,
      },
    });
    const result = await exportXlsx(sheets, xlsxFileName(now), "تقرير STAR NET");
    setExporting(false);
    if (!result.ok) setExportError(result.message);
  }
  const usdToMru = (usd: number) => (mruRate ? usd * mruRate : undefined);

  // ⏳ D shipments: their expected profit, listed with the same details (both tabs).
  const expectedBlock = expectedDays.length > 0 && (
            <div className="profit-expected">
              <button type="button" className="profit-expected-toggle" aria-expanded={showExpected} onClick={() => setShowExpected((v) => !v)}>
                <span>⏳ ربح متوقع (D) · {shipments(expected?.expectedCount ?? 0)}</span>
                <strong className={expected && expected.expectedMru < 0 ? "report-bad" : "report-warn"}>
                  <bdi dir="ltr">{expected ? `≈ ${mru(expected.expectedMru)}` : "—"}</bdi>
                </strong>
                <span aria-hidden="true">{showExpected ? "▲" : "▼"}</span>
              </button>
              {showExpected && (
                <ProfitStatement days={expectedDays} names={statementNames} emptyText="لا توجد شحنات D." />
              )}
            </div>
          );

  const periodChips = (
    <div className="report-period-row">
      {REPORT_PERIODS.map((p) => (
        <button key={p} type="button" className={`report-period-btn${period === p ? " report-period-btn-active" : ""}`} onClick={() => setPeriod(p)}>
          {REPORT_PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">الأرباح والتقارير</h1>
      </div>

      <TodayPanel
        ledgerStore={ledgerStore}
        cashEntries={cashEntries}
        renewalsToday={activeAccounts.filter((a) => daysRemainingNumber(a.rechargeDate || a.standbyDate) === 0).map((a) => ({ id: a.id, name: a.name }))}
        names={statementNames}
      />

      <div className="report-tabs" role="tablist" aria-label="أقسام التقارير">
        {(Object.keys(TAB_LABELS) as ReportTab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`report-tab${tab === t ? " report-tab-active" : ""}`} onClick={() => chooseTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="report-export-row">
        <button type="button" className="party-action report-export-btn" onClick={handleExportExcel} disabled={exporting}>
          {exporting ? "⏳ جارِ التجهيز…" : `📊 تصدير Excel (${REPORT_PERIOD_LABELS[period]})`}
        </button>
        {exportError && <span className="account-card-alert ledger-form-error">{exportError}</span>}
      </div>

      {!mruRate && (
        <p className="account-card-alert">
          سجّل سعر الأوقية في <Link href="/currencies" className="btn-link">صفحة العملات</Link> لتظهر الأرقام بالأوقية.
        </p>
      )}

      {tab === "starlink" && (
        <section className="section report-tab-panel">
          {periodChips}
          {profitReset && (
            <p className="settings-hint report-fresh-note">
              🔄 من بداية جديدة يوم <bdi dir="ltr">{profitReset.date}</bdi>
            </p>
          )}
          <div className={`profit-hero${profit && profit.confirmedMru < 0 ? " is-loss" : ""}`}>
            <span className="profit-hero-label">صافي ربحك · {REPORT_PERIOD_LABELS[period]}</span>
            <strong className="profit-hero-value">
              <bdi dir="ltr">{profit && repShares !== undefined ? `${profit.confirmedExact ? "" : "≈ "}${mru(profit.confirmedMru - repShares)}` : "—"}</bdi>
              <small>أوقية</small>
            </strong>
            <div className="profit-hero-parts">
              <span>
                ربح الشحنات <bdi dir="ltr">{profit ? mru(profit.confirmedMru) : "—"}</bdi>
              </span>
              <span>
                حصص المندوبين <bdi dir="ltr">{mru(repShares)}</bdi>
              </span>
              <span>{shipments(profit?.confirmedCount ?? 0)}</span>
            </div>
            <small className="profit-hero-hint">الربح يُحسب يوم دفع تكلفة Starlink. اضغط أي شحنة لترى تفاصيلها.</small>
          </div>

          <ProfitStatement
            days={statementDays}
            names={statementNames}
            emptyText="لا يوجد ربح مؤكد في هذه الفترة."
            onHideDay={handleHideDay}
          />

          {expectedBlock}

          {Object.keys(hiddenDays).length > 0 && (
            <div className="profit-hidden-days">
              <span>🙈 أيام مخفية من التقارير:</span>
              {Object.keys(hiddenDays)
                .sort()
                .reverse()
                .map((date) => (
                  <button key={date} type="button" className="profit-hidden-chip" onClick={() => handleShowDay(date)}>
                    <bdi dir="ltr">{date}</bdi> · إظهار
                  </button>
                ))}
            </div>
          )}

          <div className="profit-reset-row">
            <button type="button" className="profit-reset-btn" onClick={handleResetAll}>
              🔄 تصفير كل الأرباح
            </button>
            {profitReset && (
              <button type="button" className="profit-reset-btn profit-reset-undo" onClick={handleUndoReset}>
                ↩️ إرجاع الأرباح
              </button>
            )}
          </div>

          <ChartCard title={isLongPeriod(period) ? "الربح شهرًا بشهر" : "الربح يومًا بيوم"} note={REPORT_PERIOD_LABELS[period]} points={profitChart} />

          <RankCard
            title="أكثر الأجهزة ربحًا"
            empty="لا يوجد ربح محقق في هذه الفترة."
            rows={deviceRanks
              .filter((d) => d.profitMru > 0)
              .slice(0, 5)
              .map((d) => ({
                key: d.accountId,
                title: accountName(d.accountId),
                subtitle: getClient(clientStore, accounts.find((a) => a.id === d.accountId)?.clientId)?.name ?? "بدون زبون",
                value: d.profitMru,
              }))}
          />
          <RankCard
            title="أكثر الزبائن ربحًا"
            empty="لا يوجد ربح محقق في هذه الفترة."
            rows={clientRanks
              .filter((c) => c.profitMru > 0)
              .slice(0, 5)
              .map((c) => ({
                key: c.clientId ?? "none",
                title: getClient(clientStore, c.clientId)?.name ?? "بدون زبون",
                subtitle: `${c.devices} ${c.devices === 1 ? "جهاز" : "أجهزة"}`,
                value: c.profitMru,
              }))}
          />
          {deviceRanks.some((d) => d.profitMru < 0) && (
            <RankCard
              title="أجهزة خاسرة"
              tone="bad"
              rows={deviceRanks
                .filter((d) => d.profitMru < 0)
                .map((d) => ({ key: d.accountId, title: accountName(d.accountId), subtitle: "بيع أقل من تكلفة Starlink", value: d.profitMru }))}
            />
          )}

          <MonthClosingSection ledgerStore={ledgerStore} accounts={accounts} clientStore={clientStore} mruRate={mruRate} />
        </section>
      )}

      {tab === "store" && (
        <section className="section report-tab-panel">
          {periodChips}
          <div className="report-kpis">
            <Kpi label="صافي ربح المتجر" value={`≈ ${mru(store.net)}`} sub="أوقية" tone={store.net < 0 ? "bad" : "good"} info="المبيعات ناقص تكلفة البضاعة والشحن والمصروفات - كل عملة محوّلة للأوقية بسعر اليوم." />
            <Kpi label="المبيعات" value={`≈ ${mru(store.sales)}`} sub={`أوقية · ${periodInvoices.filter((i) => i.kind === "sale").length} فاتورة`} />
            <Kpi label="تكلفة البضاعة" value={`≈ ${mru(store.cogs)}`} sub="أوقية" />
            <Kpi label="الشحن والمصروفات" value={`≈ ${mru(store.costs)}`} sub="أوقية" tone="bad" />
          </div>
          {store.missing.length > 0 && <p className="settings-hint">لم تُحتسب مبالغ بعملات بلا سعر مسجّل: {store.missing.join("، ")}</p>}

          <ChartCard title={isLongPeriod(period) ? "ربح المتجر شهرًا بشهر" : "ربح المتجر يومًا بيوم"} note={REPORT_PERIOD_LABELS[period]} points={storeChart} />

          <RankCard
            title="أكثر المواد مبيعًا"
            empty="لا توجد مبيعات لهذه الفترة."
            rows={topItems.map(({ row, mru: value }) => {
              const item = getStoreItem(storeItems, row.itemId);
              return { key: row.itemId, title: item?.name ?? "مادة محذوفة", subtitle: `${formatAmount(row.quantity)} ${item?.unit ?? ""}`, value };
            })}
          />
          <RankCard
            title="أفضل الزبائن (المتجر)"
            empty="لا توجد مبيعات لهذه الفترة."
            rows={topStoreClients.map(({ row, mru: value }) => ({
              key: row.clientId ?? "none",
              title: getClient(clientStore, row.clientId)?.name ?? "بدون زبون",
              value,
            }))}
          />
          <Link href="/store" className="btn-link report-more-link">
            التفاصيل الكاملة في المتجر ←
          </Link>
        </section>
      )}

      {tab === "net" && net && (
        <section className="section report-tab-panel">
          <div className="report-period-row">
            {netMonths.slice(0, 6).map((m) => (
              <button key={m} type="button" className={`report-period-btn${m === net.month ? " report-period-btn-active" : ""}`} onClick={() => setNetMonth(m)}>
                {monthLabel(m)}
              </button>
            ))}
          </div>

          <div className={`net-hero${net.netMru < 0 ? " is-loss" : ""}`}>
            <span className="net-hero-label">صافي ربح {monthLabel(net.month)}</span>
            <strong className="net-hero-value">
              <bdi dir="ltr">{`${net.exact ? "" : "≈ "}${mru(net.netMru)}`}</bdi> <small>أوقية</small>
            </strong>
            {previousNet && <NetChange current={net.netMru} previous={previousNet.netMru} previousLabel={monthLabel(previousNet.month)} />}
          </div>

          <div className="report-card-head profit-section-head">
            <h3>📒 شحنات ستارلينك في {monthLabel(net.month)}</h3>
            <span className="report-card-note">اضغط أي شحنة للتفاصيل</span>
          </div>
          <ProfitStatement
            days={groupProfitDays(allConfirmedRows.filter((row) => row.date.slice(0, 7) === net.month))}
            names={statementNames}
            emptyText="لا توجد شحنات دُفعت لستارلينك في هذا الشهر."
            onHideDay={handleHideDay}
          />

          {expectedBlock}

          <div className="report-card">
            <div className="report-card-head">
              <h3>من أين جاء الصافي</h3>
              <span className="report-card-note">أوقية</span>
            </div>
            <ul className="net-lines">
              <NetLine label="ربح ستارلينك" hint="يوم الدفع لستارلينك" value={net.starlinkProfitMru} />
              <NetLine label="حصص المندوبين (ستارلينك)" value={-net.starlinkRepSharesMru} />
              <NetLine
                label="ربح المتجر"
                hint={net.storeSalesMru === 0 && net.storeCogsMru === 0 ? "لا مبيعات هذا الشهر" : `مبيعات ${mru(net.storeSalesMru)} − بضاعة ${mru(net.storeCogsMru)} − شحن ${mru(net.storeShippingMru)}${net.storeRepCommissionMru ? ` − عمولات ${mru(net.storeRepCommissionMru)}` : ""}`}
                value={net.storeNetMru}
              />
              <NetLine label="المصاريف" hint="قيود «خارج» في الصندوق" value={-net.expensesMru} />
              <NetLine label="الصافي" value={net.netMru} total />
              {personalMonth.mru > 0 && (
                <>
                  <NetLine label="مصروفاتك الشخصية" hint="تبويب «المصروفات»" value={-personalMonth.mru} />
                  <NetLine label="يبقى لك" value={net.netMru - personalMonth.mru} total />
                </>
              )}
            </ul>
          </div>

          <RankCard
            title="المصاريف حسب النوع"
            tone="bad"
            barTone="bad"
            empty="لا توجد مصاريف مسجّلة هذا الشهر. سجّلها في الصندوق كـ«خارج» مع تصنيف (إيجار، نقل، إنترنت…) لتظهر هنا."
            rows={net.expenses.map((e) => ({ key: e.category, title: e.category, subtitle: `${e.count} ${e.count === 1 ? "قيد" : "قيود"}`, value: -e.mru }))}
          />

          <ChartCard title="الصافي شهرًا بشهر" note="آخر 6 أشهر" points={netTrend} />

          {net.missingCurrencies.length > 0 && (
            <p className="settings-hint">لم تُحتسب مبالغ بعملات بلا سعر مسجّل: {net.missingCurrencies.join("، ")} - سجّل أسعارها في صفحة العملات.</p>
          )}
          <p className="settings-hint">
            المتجر والمصاريف بغير الأوقية محوّلة بسعر اليوم (للعرض فقط). الإيداعات وشحن البطاقة ودفعات المندوبين ليست مصاريف ولا تدخل هنا.
          </p>
        </section>
      )}

      {tab === "expenses" && (
        <PersonalExpensesTab
          newExpense={newExpense}
          expenses={personal}
          custom={expenseCategories}
          rates={rates}
          onChange={(list, custom) => {
            setPersonal(list);
            setExpenseCategories(custom);
            setCashEntries(loadCashEntries());
          }}
        />
      )}

      {tab === "debts" && (
        <section className="section report-tab-panel">
          <div className="report-kpis">
            <Kpi label="على الزبائن لي" value={`≈ ${mru(debtorsTotal)}`} sub={`أوقية · ${debtors.length} ${debtors.length === 1 ? "زبون" : "زبائن"}`} tone="good" />
            <Kpi label="عليّ لستارلينك" value={`≈ ${mru(usdToMru(ownDUsd + previousUsd))}`} sub={`أوقية · ${formatAmount(ownDUsd + previousUsd)}$`} tone="bad" />
            <Kpi label="💳 رصيد البطاقة" value={`≈ ${mru(usdToMru(cardUsd))}`} sub={`أوقية · ${formatAmount(cardUsd)}$`} />
            <Kpi
              label={repsNet < 0 ? "على المندوبين (صافي)" : "للمندوبين (صافي)"}
              value={mru(Math.abs(repsNet))}
              sub="أوقية"
              tone="warn"
            />
          </div>

          <RankCard
            title="على الزبائن - الأكبر أولًا"
            empty="لا توجد ديون على الزبائن."
            barTone="good"
            rows={debtors.slice(0, 10).map((d) => ({
              key: d.key,
              title: d.name,
              subtitle: d.oldestDays > 0 ? `أقدم دين منذ ${d.oldestDays} يوم` : "اليوم",
              value: d.mru,
            }))}
          />

          <div className="report-card">
            <div className="report-card-head">
              <h3>عليّ لستارلينك</h3>
              <Link href="/starlink" className="btn-link">فتح ←</Link>
            </div>
            <ul className="report-rank">
              <li className="report-rank-row">
                <span className="report-rank-badge report-rank-badge-red">D</span>
                <div className="report-rank-main">
                  <strong>D منّي</strong>
                  <small>{ownDCount} جهاز</small>
                </div>
                <strong className="report-bad" dir="ltr">{formatAmount(ownDUsd)}$</strong>
              </li>
              <li className="report-rank-row">
                <span className="report-rank-badge report-rank-badge-orange">D</span>
                <div className="report-rank-main">
                  <strong>ديون سابقة</strong>
                  <small>{new Set(openPrevious.map((d) => d.accountId)).size} جهاز</small>
                </div>
                <strong className="report-orange" dir="ltr">{formatAmount(previousUsd)}$</strong>
              </li>
              <li className="report-rank-row">
                <span className="report-rank-badge">💳</span>
                <div className="report-rank-main">
                  <strong>رصيد البطاقة</strong>
                  <small>
                    {cardUsd < ownDUsd + previousUsd ? `ينقصها ${formatAmount(ownDUsd + previousUsd - cardUsd)}$ لتسديد الكل` : "يكفي لتسديد الكل"}
                  </small>
                </div>
                <strong dir="ltr">{formatAmount(cardUsd)}$</strong>
              </li>
            </ul>
          </div>

          <div className="report-card">
            <div className="report-card-head">
              <h3>المندوبون</h3>
              <Link href="/representatives" className="btn-link">فتح ←</Link>
            </div>
            {repBalances.length === 0 ? (
              <p className="party-empty">لا توجد أرصدة مفتوحة مع المندوبين.</p>
            ) : (
              <ul className="report-rank">
                {repBalances.map(({ rep, balanceMru }) => (
                  <li key={rep.id} className="report-rank-row">
                    <span className="report-rank-badge">🤝</span>
                    <div className="report-rank-main">
                      <strong>{rep.name}</strong>
                      <small>{balanceMru >= 0 ? "مستحق له" : "عليه"}</small>
                    </div>
                    <strong className={balanceMru >= 0 ? "report-warn" : "report-bad"}>
                      <bdi dir="ltr">{mru(Math.abs(balanceMru))}</bdi>
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 🧾 like the home screen's "+": one tap records an expense (long-press pins it). */}
      <div className="home-fab">
        <button
          type="button"
          className="home-fab-button expense-fab-button"
          aria-label="إضافة مصروف"
          title="إضافة مصروف"
          data-shortcut-route={ADD_EXPENSE_ROUTE}
          onClick={startExpense}
        >
          <span aria-hidden="true">🧾</span>
        </button>
      </div>
    </main>
  );
}

function isLongPeriod(period: ReportPeriod): boolean {
  return period === "quarter" || period === "halfYear" || period === "year";
}

type Tone = "good" | "bad" | "warn" | "orange";

function Kpi({ label, value, sub, tone, info }: { label: string; value: string; sub?: string; tone?: Tone; info?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="report-kpi">
      <span className="report-kpi-label">
        {label}
        {info && (
          <button type="button" className="report-info" aria-label="شرح" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            i
          </button>
        )}
      </span>
      <strong className={`report-kpi-value${tone ? ` report-${tone}` : ""}`}>
        <bdi dir="ltr">{value}</bdi>
      </strong>
      {sub && <small className="report-kpi-sub">{sub}</small>}
      {open && info && <p className="report-kpi-info">{info}</p>}
    </div>
  );
}

function NetLine({ label, hint, value, total }: { label: string; hint?: string; value: number; total?: boolean }) {
  const sign = value < 0 ? "−" : total ? "=" : "+";
  return (
    <li className={`net-line${total ? " net-line-total" : ""}`}>
      <div className="net-line-main">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <strong className={value < 0 ? "report-bad" : total ? "report-good" : undefined}>
        <bdi dir="ltr">
          {sign} {mru(Math.abs(value))}
        </bdi>
      </strong>
    </li>
  );
}

function NetChange({ current, previous, previousLabel }: { current: number; previous: number; previousLabel: string }) {
  const { diffMru, percent } = monthChange(current, previous);
  if (Math.abs(diffMru) < 0.5) return <span className="net-change">مثل {previousLabel}</span>;
  const up = diffMru > 0;
  return (
    <span className={`net-change ${up ? "is-up" : "is-down"}`}>
      {up ? "▲" : "▼"} <bdi dir="ltr">{percent !== null ? `${Math.abs(percent)}%` : mru(Math.abs(diffMru))}</bdi> {up ? "أكثر" : "أقل"} من {previousLabel}
    </span>
  );
}

function ChartCard({ title, note, points }: { title: string; note: string; points: SeriesPoint[] }) {
  const max = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const hasData = points.some((p) => Math.abs(p.value) > 0.5);
  return (
    <div className="report-card">
      <div className="report-card-head">
        <h3>{title}</h3>
        <span className="report-card-note">{note}</span>
      </div>
      {!hasData ? (
        <p className="party-empty">لا توجد أرقام في هذه الفترة.</p>
      ) : (
        <>
          <div className="report-chart" role="img" aria-label={title}>
            {points.map((p) => (
              <div key={p.key} className="report-chart-col" title={`${p.key}: ${mru(p.value)} أوقية`}>
                <div
                  className={`report-chart-bar${p.value < 0 ? " report-chart-bar-neg" : ""}`}
                  style={{ height: `${Math.max(p.value === 0 ? 0 : 3, (Math.abs(p.value) / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="report-chart-axis">
            {points.map((p, i) => (
              <span key={p.key}>{i % labelEvery === 0 ? p.label : ""}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RankCard({
  title,
  rows,
  empty,
  tone,
  barTone,
}: {
  title: string;
  rows: { key: string; title: string; subtitle?: string; value: number }[];
  empty?: string;
  tone?: Tone;
  barTone?: Tone;
}): ReactNode {
  if (rows.length === 0 && !empty) return null;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="report-card">
      <div className="report-card-head">
        <h3>{title}</h3>
        <span className="report-card-note">أوقية</span>
      </div>
      {rows.length === 0 ? (
        <p className="party-empty">{empty}</p>
      ) : (
        <ul className="report-rank">
          {rows.map((row, index) => (
            <li key={row.key} className="report-rank-row">
              <span className="report-rank-badge">{tone === "bad" ? "!" : index + 1}</span>
              <div className="report-rank-main">
                <strong>{row.title}</strong>
                {row.subtitle && <small>{row.subtitle}</small>}
                <div className={`report-rank-bar${barTone ? ` report-rank-bar-${barTone}` : ""}${row.value < 0 ? " report-rank-bar-bad" : ""}`} style={{ width: `${(Math.abs(row.value) / max) * 100}%` }} />
              </div>
              <strong className={row.value < 0 ? "report-bad" : "report-good"}>
                <bdi dir="ltr">{mru(row.value)}</bdi>
              </strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
