"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { computeRepSharesMru, listRepresentatives, loadRepresentativeStore, loadRepSettlements, RepresentativeStore, RepSettlementList } from "@/lib/repStore";
import { sumProfitMru } from "@/lib/profitMru";
import { CurrencyStore, loadCurrencyStore } from "@/lib/currencyStore";
import { daysRemainingNumber } from "@/lib/date";
import { TodayPanel } from "@/components/TodayPanel";
import { MonthClosingSection } from "@/components/MonthClosingSection";
import { entriesAfterProfitReset, loadProfitReset, ProfitReset } from "@/lib/profitReset";
import { computeDebtAging } from "@/lib/debtAging";
import { loadPartyAdjustments, PartyAdjustmentList } from "@/lib/partyBalanceStore";
import { buildCardStatement, listCardPayments, listOpenShipmentDebts, loadCardTopUps, totalOpenDebtUsd, CardTopUpList } from "@/lib/starlinkDebt";
import { listOpenPreviousDebts, loadPreviousDebts, PreviousDebtList, totalPreviousDebtUsd } from "@/lib/previousDebt";
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

type ReportTab = "starlink" | "store" | "debts";

const TAB_LABELS: Record<ReportTab, string> = { starlink: "ستارلينك", store: "المتجر", debts: "الديون" };
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
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [tab, setTab] = useState<ReportTab>("starlink");

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
    try {
      const saved = window.localStorage.getItem(TAB_KEY);
      if (saved === "starlink" || saved === "store" || saved === "debts") setTab(saved);
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
  const profitByAccount = useMemo(() => {
    const result: Record<string, LedgerByAccount[string]> = {};
    for (const [accountId, entries] of Object.entries(ledgerStore)) {
      result[accountId] = entriesAfterProfitReset(filterEntriesByProfitDate(entries, period), profitReset);
    }
    return result;
  }, [ledgerStore, period, profitReset]);
  const profitEntries = useMemo(() => Object.values(profitByAccount).flat(), [profitByAccount]);
  const openEntries = useMemo(
    () => Object.values(ledgerStore).flat().filter((e) => e.kind === "debit" && e.starlinkCost?.status === "pending"),
    [ledgerStore],
  );
  const profit = useMemo(() => (mruRate ? sumProfitMru(profitEntries, mruRate) : undefined), [profitEntries, mruRate]);
  const expected = useMemo(() => (mruRate ? sumProfitMru(openEntries, mruRate) : undefined), [openEntries, mruRate]);
  const repShares = useMemo(() => (mruRate ? computeRepSharesMru(profitEntries, mruRate).confirmed : undefined), [profitEntries, mruRate]);
  const profitChart = useMemo(() => (mruRate ? profitSeries(profitEntries, period, mruRate) : []), [profitEntries, period, mruRate]);
  const deviceRanks = useMemo(() => (mruRate ? rankDeviceProfits(profitByAccount, mruRate) : []), [profitByAccount, mruRate]);
  const clientRanks = useMemo(
    () => rankClientProfits(deviceRanks, (id) => accounts.find((a) => a.id === id)?.clientId),
    [deviceRanks, accounts],
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
  const usdToMru = (usd: number) => (mruRate ? usd * mruRate : undefined);

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
        renewalsToday={activeAccounts.filter((a) => daysRemainingNumber(a.rechargeDate || a.standbyDate) === 0).length}
      />

      <div className="report-tabs" role="tablist" aria-label="أقسام التقارير">
        {(Object.keys(TAB_LABELS) as ReportTab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`report-tab${tab === t ? " report-tab-active" : ""}`} onClick={() => chooseTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
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
          <div className="report-kpis">
            <Kpi
              label="ربح الفترة"
              value={profit ? `${profit.confirmedExact ? "" : "≈ "}${mru(profit.confirmedMru)}` : "—"}
              sub={`أوقية · ${shipments(profit?.confirmedCount ?? 0)}`}
              tone={profit && profit.confirmedMru < 0 ? "bad" : "good"}
              info="يُحسب يوم دفع تكلفة Starlink (تسديد D)، لا يوم التجديد للزبون."
            />
            <Kpi label="صافي ربحي" value={profit && repShares !== undefined ? mru(profit.confirmedMru - repShares) : "—"} sub="أوقية · بعد حصص المندوبين" tone="good" />
            <Kpi label="حصص المندوبين" value={mru(repShares)} sub="أوقية" tone="warn" />
            <Kpi
              label="ربح متوقع (D)"
              value={expected ? `≈ ${mru(expected.expectedMru)}` : "—"}
              sub={`أوقية · ${shipments(expected?.expectedCount ?? 0)}`}
              tone="orange"
              info="شحنات لم تُدفع تكلفتها لـ Starlink بعد (كل الفترات) - تدخل الربح يوم تسديدها."
            />
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
