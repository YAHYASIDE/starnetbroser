"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StarlinkAccountSummary } from "@starnet/shared";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerByAccount, loadLedgerStore, totalOwedAcrossAccounts } from "@/lib/ledgerStore";
import { computeDeviceAccountingSummary, computePendingStarlinkCostUsd } from "@/lib/accountingStore";
import { filterEntriesByPeriod, filterEntriesByProfitDate, isThisCalendarMonth, REPORT_PERIOD_LABELS, REPORT_PERIODS, ReportPeriod } from "@/lib/reportPeriod";
import { ClientStore, getClient, loadClientStore } from "@/lib/clientStore";
import { formatAmount } from "@/lib/formatAmount";
import { InvoiceList, loadInvoices } from "@/lib/invoiceStore";
import { getStoreItem, loadStoreItems, loadStoreTransactions, StoreItemRegistry, StoreTransactionList } from "@/lib/storeStore";
import { computeClientSalesTotals, computeItemSalesTotals, computeStoreSalesSummary, largestCurrencyValue } from "@/lib/storeReports";
import { CashEntryList, loadCashEntries, listStandaloneCashEntries } from "@/lib/cashStore";
import { computeExpectedRepSharesUsd, computeRepSharesMru, computeRepSharesUsd } from "@/lib/repStore";
import { sumProfitMru } from "@/lib/profitMru";
import { CurrencyStore, getCurrency, loadCurrencyStore } from "@/lib/currencyStore";
import { summarizeDeviceProfit } from "@/lib/accountingStore";
import { daysRemainingNumber } from "@/lib/date";
import { TodayPanel } from "@/components/TodayPanel";
import { MonthClosingSection } from "@/components/MonthClosingSection";
import { entriesAfterProfitReset, loadProfitReset, ProfitReset } from "@/lib/profitReset";

function currencyLabelFor(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as keyof typeof LEDGER_CURRENCY_LABELS] ?? code;
}

function mergeCurrencyKeys(...records: Record<string, number>[]): string[] {
  const keys = new Set<string>();
  for (const record of records) for (const key of Object.keys(record)) keys.add(key);
  return Array.from(keys);
}

interface ClientProfitRow {
  key: string;
  name: string;
  /** Starlink devices (ledger) - after Starlink cost, before any rep share. */
  profitUsd: number;
  /** Same profit in أوقية (profitMru.ts) - set when an MRU rate is registered. */
  profitMru?: number;
  /** Store invoices: sales - cost of goods - shipping cost, per currency. */
  storeProfitByCurrency: Record<string, number>;
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
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [showDollarBreakdown, setShowDollarBreakdown] = useState(true);
  const [showClientProfits, setShowClientProfits] = useState(false);
  const [showTopStoreClients, setShowTopStoreClients] = useState(false);
  const [showTopItems, setShowTopItems] = useState(false);

  useEffect(() => {
    setLedgerStore(loadLedgerStore());
    setClientStore(loadClientStore());
    setInvoices(loadInvoices());
    setStoreItems(loadStoreItems());
    setStoreTransactions(loadStoreTransactions());
    setCashEntries(loadCashEntries());
    setCurrencyStore(loadCurrencyStore());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archivedAt && !a.deletedAt), [accounts]);
  const suspendedCount = useMemo(
    () => activeAccounts.filter((a) => a.serviceStatus === "suspended").length,
    [activeAccounts],
  );

  const allEntries = useMemo(() => Object.values(ledgerStore).flat(), [ledgerStore]);
  const periodEntries = useMemo(() => filterEntriesByPeriod(allEntries, period), [allEntries, period]);
  const periodSummary = useMemo(() => computeDeviceAccountingSummary(periodEntries), [periodEntries]);
  // Profit becomes real the day Starlink is paid (D settled), so profit, its split and Starlink
  // costs are counted by that day - a shipment sold in September and paid on 4 October is
  // October's profit.
  // "بداية جديدة للأرباح" (الإعدادات): profit that became real before it is left out.
  const [profitReset, setProfitReset] = useState<ProfitReset | null>(null);
  useEffect(() => setProfitReset(loadProfitReset()), []);
  const profitEntries = useMemo(
    () => entriesAfterProfitReset(filterEntriesByProfitDate(allEntries, period), profitReset),
    [allEntries, period, profitReset],
  );
  const profitSummary = useMemo(() => computeDeviceAccountingSummary(profitEntries), [profitEntries]);
  const periodNetProfitUsd = profitSummary.totalProfitsUsd - profitSummary.totalLossesUsd;
  // Representatives' share of the same period's device profit (LedgerEntry.representativeId).
  const periodRepSharesUsd = useMemo(() => computeRepSharesUsd(profitEntries), [profitEntries]);
  // Every still-open D (whatever the period): its profit is already known from the recorded
  // Starlink cost, shown apart as "متوقع" until Starlink is paid.
  const openEntries = useMemo(() => allEntries.filter((e) => e.kind === "debit" && e.starlinkCost?.status === "pending"), [allEntries]);
  const periodExpected = useMemo(() => summarizeDeviceProfit(openEntries), [openEntries]);
  const periodExpectedRepSharesUsd = useMemo(() => computeExpectedRepSharesUsd(openEntries), [openEntries]);
  // Profit is shown in أوقية (profitMru.ts); USD stays as a small secondary figure. Without a
  // registered MRU rate everything falls back to USD.
  const mruRate = getCurrency(currencyStore, "MRU")?.rateFromUsd;
  const periodProfitMru = useMemo(() => {
    if (!mruRate) return undefined;
    const confirmed = sumProfitMru(profitEntries, mruRate);
    return { ...confirmed, expectedMru: sumProfitMru(openEntries, mruRate).expectedMru };
  }, [profitEntries, openEntries, mruRate]);
  const periodRepSharesMru = useMemo(() => {
    if (!mruRate) return undefined;
    return { confirmed: computeRepSharesMru(profitEntries, mruRate).confirmed, expected: computeRepSharesMru(openEntries, mruRate).expected };
  }, [profitEntries, openEntries, mruRate]);

  // ربح المتجر (retail: devices/materials sold as store inventory, via invoiceStore.ts) - a
  // separate business from the Starlink-subscription ledger above, in its own currencies (MRU/
  // SIFA/USD, never mixed or converted into one another), so it gets its own tile rather than
  // being folded into periodNetProfitUsd. Shares this page's own period picker so "اليوم" shows
  // today's profit from BOTH businesses at once.
  const periodInvoices = useMemo(() => filterEntriesByPeriod(invoices, period), [invoices, period]);
  const storeSummary = useMemo(
    () => computeStoreSalesSummary(storeTransactions, invoices, periodInvoices),
    [storeTransactions, invoices, periodInvoices],
  );
  const periodStandaloneExpenses = useMemo(() => {
    const standaloneOut = filterEntriesByPeriod(listStandaloneCashEntries(cashEntries), period).filter((e) => e.kind === "out");
    const result: Record<string, number> = {};
    for (const entry of standaloneOut) result[entry.currencyCode] = (result[entry.currencyCode] ?? 0) + entry.amount;
    return result;
  }, [cashEntries, period]);
  const storeNetProfitByCurrency = useMemo(() => {
    const currencies = mergeCurrencyKeys(
      storeSummary.salesByCurrency,
      storeSummary.cogsByCurrency,
      storeSummary.shippingCostByCurrency,
      periodStandaloneExpenses,
    );
    const result: Record<string, number> = {};
    for (const c of currencies) {
      result[c] =
        (storeSummary.salesByCurrency[c] ?? 0) -
        (storeSummary.cogsByCurrency[c] ?? 0) -
        (storeSummary.shippingCostByCurrency[c] ?? 0) -
        (periodStandaloneExpenses[c] ?? 0);
    }
    return result;
  }, [storeSummary, periodStandaloneExpenses]);
  const storeProfitCurrencies = Object.keys(storeNetProfitByCurrency);

  // أفضل الزبائن وأكثر المواد مبيعًا - ranked from the same period's sale invoices, sorted by
  // each row's own largest currency value (see storeReports.ts's largestCurrencyValue - never a
  // fabricated cross-currency sum), top 10 only so the list stays a quick "where to focus" read.
  const topStoreClients = useMemo(() => {
    return computeClientSalesTotals(periodInvoices)
      .filter((row) => largestCurrencyValue(row.totalByCurrency) > 0.0001)
      .sort((a, b) => largestCurrencyValue(b.totalByCurrency) - largestCurrencyValue(a.totalByCurrency))
      .slice(0, 10);
  }, [periodInvoices]);
  const topItems = useMemo(() => {
    return computeItemSalesTotals(periodInvoices)
      .filter((row) => largestCurrencyValue(row.totalByCurrency) > 0.0001)
      .sort((a, b) => largestCurrencyValue(b.totalByCurrency) - largestCurrencyValue(a.totalByCurrency))
      .slice(0, 10);
  }, [periodInvoices]);

  const totalOwed = useMemo(() => totalOwedAcrossAccounts(ledgerStore), [ledgerStore]);
  const owedCurrencies = LEDGER_CURRENCIES.filter((c) => totalOwed[c] !== undefined && totalOwed[c]! > 0);

  // Deliberately all-time, not period-scoped - "money we currently owe Starlink" is a running
  // balance (like ديون الزبائن below), not a flow that resets with the period picker.
  const pendingStarlinkCostUsd = useMemo(() => computePendingStarlinkCostUsd(allEntries), [allEntries]);

  const monthSettledCostUsd = useMemo(() => {
    const thisMonth = allEntries.filter((e) => e.kind === "debit" && isThisCalendarMonth(e.date));
    return computeDeviceAccountingSummary(thisMonth).totalSettledStarlinkCostUsd;
  }, [allEntries]);

  const allTimeSettledCostUsd = useMemo(
    () => computeDeviceAccountingSummary(allEntries).totalSettledStarlinkCostUsd,
    [allEntries],
  );

  // Net profit per client for the selected period - a device with no linked client is bucketed
  // under "بدون زبون" rather than silently dropped, so no real profit ever goes unaccounted for.
  const clientProfits = useMemo<ClientProfitRow[]>(() => {
    const byKey = new Map<string, ClientProfitRow>();
    const rowFor = (clientId: string | undefined) => {
      const client = getClient(clientStore, clientId);
      const key = client?.id ?? "__none__";
      const row = byKey.get(key) ?? { key, name: client?.name ?? "بدون زبون", profitUsd: 0, storeProfitByCurrency: {} };
      byKey.set(key, row);
      return row;
    };
    for (const account of accounts) {
      const entries = entriesAfterProfitReset(filterEntriesByProfitDate(ledgerStore[account.id] ?? [], period), profitReset);
      if (entries.length === 0) continue;
      const summary = computeDeviceAccountingSummary(entries);
      const row = rowFor(account.clientId);
      row.profitUsd += summary.totalProfitsUsd - summary.totalLossesUsd;
      if (mruRate) row.profitMru = (row.profitMru ?? 0) + sumProfitMru(entries, mruRate).confirmedMru;
    }
    // Store profit per client: each client's own sale invoices (and returns against them) this
    // period, costed the same way as the store's own profit tile.
    const clientIds = new Set(periodInvoices.filter((inv) => inv.kind === "sale" && inv.clientId).map((inv) => inv.clientId!));
    for (const clientId of clientIds) {
      const ownIds = new Set(periodInvoices.filter((inv) => inv.clientId === clientId).map((inv) => inv.id));
      const clientInvoices = periodInvoices.filter(
        (inv) => inv.clientId === clientId || (inv.returnOfInvoiceId !== undefined && ownIds.has(inv.returnOfInvoiceId)),
      );
      const summary = computeStoreSalesSummary(storeTransactions, invoices, clientInvoices);
      const row = rowFor(clientId);
      for (const c of mergeCurrencyKeys(summary.salesByCurrency, summary.cogsByCurrency, summary.shippingCostByCurrency)) {
        row.storeProfitByCurrency[c] =
          (row.storeProfitByCurrency[c] ?? 0) +
          (summary.salesByCurrency[c] ?? 0) -
          (summary.cogsByCurrency[c] ?? 0) -
          (summary.shippingCostByCurrency[c] ?? 0);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.profitUsd - a.profitUsd);
  }, [accounts, ledgerStore, clientStore, period, periodInvoices, storeTransactions, invoices, mruRate, profitReset]);

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

      <MonthClosingSection ledgerStore={ledgerStore} accounts={accounts} clientStore={clientStore} mruRate={mruRate} />

      <section className="section">
        <div className="report-period-row">
          {REPORT_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={`report-period-btn${period === p ? " report-period-btn-active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {REPORT_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {profitReset && (
          <p className="settings-hint report-fresh-note">
            🔄 الأرباح محسوبة من بداية جديدة يوم <bdi dir="ltr">{profitReset.date}</bdi> (من الإعدادات)
          </p>
        )}

        <div className={`report-net-tile${periodNetProfitUsd < 0 ? " report-net-tile-negative" : ""}`}>
          <span className="report-net-tile-label">صافي الربح · {REPORT_PERIOD_LABELS[period]}</span>
          <strong className="report-net-tile-value">
            {periodProfitMru ? (
              <>
                {periodProfitMru.confirmedExact ? "" : "≈ "}
                <bdi dir="ltr">{formatAmount(periodProfitMru.confirmedMru)}</bdi> أوقية
                <small className="report-usd-sub" dir="ltr">{formatAmount(periodNetProfitUsd)} USD</small>
              </>
            ) : (
              <bdi dir="ltr">{formatAmount(periodNetProfitUsd)} USD</bdi>
            )}
          </strong>
        </div>

        {periodExpected.expectedCount > 0 && (
          <div className="report-net-tile report-net-tile-expected">
            <span className="report-net-tile-label">
              ربح متوقع (D) · {periodExpected.expectedCount} شحنة لم تُسدَّد تكلفتها لـ Starlink بعد
            </span>
            <strong className="report-net-tile-value">
              ≈ <bdi dir="ltr">{formatAmount(periodProfitMru ? periodProfitMru.expectedMru : periodExpected.expectedUsd)}</bdi>{" "}
              {periodProfitMru ? "أوقية" : "USD"}
            </strong>
            <span className="report-net-tile-note">
              يتأكد ويدخل صافي الربح يوم تسديده لـ Starlink
              {periodExpectedRepSharesUsd > 0.0001 &&
                ` · منه حصة متوقعة للمندوبين ≈ ${
                  periodRepSharesMru ? `${formatAmount(periodRepSharesMru.expected)} أوقية` : `${formatAmount(periodExpectedRepSharesUsd)} USD`
                }`}
            </span>
          </div>
        )}

        {periodRepSharesUsd > 0.0001 && (
          <div className="report-rep-split">
            <div>
              <span>حصة المندوبين</span>
              <strong>
                {periodRepSharesMru ? (
                  <><bdi dir="ltr">{formatAmount(periodRepSharesMru.confirmed)}</bdi> أوقية</>
                ) : (
                  <bdi dir="ltr">{formatAmount(periodRepSharesUsd)} USD</bdi>
                )}
              </strong>
            </div>
            <div>
              <span>صافي ربحي بعد المندوبين</span>
              <strong>
                {periodProfitMru && periodRepSharesMru ? (
                  <><bdi dir="ltr">{formatAmount(periodProfitMru.confirmedMru - periodRepSharesMru.confirmed)}</bdi> أوقية</>
                ) : (
                  <bdi dir="ltr">{formatAmount(periodNetProfitUsd - periodRepSharesUsd)} USD</bdi>
                )}
              </strong>
            </div>
          </div>
        )}

        {/* Deliberately a SEPARATE tile, never merged with صافي الربح above (accountingStore.ts's
            own rule) - a debit entry marked D still counts here once the customer actually pays
            (a credit entry), even though its own profit stays pending until Starlink is settled. */}
        <div className="report-net-tile report-net-tile-info">
          <span className="report-net-tile-label">
            النقد المحصّل فعليًا (بعد خصم المدفوع لـ Starlink) · {REPORT_PERIOD_LABELS[period]}
          </span>
          <strong className="report-net-tile-value">
            {mruRate ? (
              <>
                ≈ <bdi dir="ltr">{formatAmount(periodSummary.cashFlowUsd * mruRate)}</bdi> أوقية
                <small className="report-usd-sub" dir="ltr">{formatAmount(periodSummary.cashFlowUsd)} USD</small>
              </>
            ) : (
              <bdi dir="ltr">{formatAmount(periodSummary.cashFlowUsd)} USD</bdi>
            )}
          </strong>
        </div>
        <p className="settings-hint">
          «صافي الربح» يُحسب يوم دفع تكلفة Starlink (تسديد D)، لا يوم التجديد للزبون. «النقد المحصّل» يظهر فور استلام الدفعة من
          الزبون، حتى لو كانت الشحنة لا تزال بحالة D - رقمان منفصلان دائمًا.
        </p>

        <h2 className="report-section-title">ربح المتجر (بيع الأجهزة والمواد) · {REPORT_PERIOD_LABELS[period]}</h2>
        <div className="report-net-tile report-net-tile-violet">
          <span className="report-net-tile-label">صافي ربح المتجر · {REPORT_PERIOD_LABELS[period]}</span>
          {storeProfitCurrencies.length === 0 ? (
            <strong className="report-net-tile-value" dir="ltr">
              0
            </strong>
          ) : (
            <div className="report-tile-value-stack">
              {storeProfitCurrencies.map((c) => (
                <strong key={c} className="report-net-tile-value" dir="ltr">
                  {formatAmount(storeNetProfitByCurrency[c]!)} {LEDGER_CURRENCY_LABELS[c as keyof typeof LEDGER_CURRENCY_LABELS] ?? c}
                </strong>
              ))}
            </div>
          )}
        </div>
        <p className="settings-hint">
          ربح المتجر منفصل عن ربح اشتراكات Starlink أعلاه (عملات مختلفة، لا تُجمع مع بعضها) - كل عملية بيع
          من المتجر (جهاز أو أي مادة، بما فيها ربح الشحن) تُحتسب هنا فور حفظ الفاتورة.{" "}
          <Link href="/store" className="btn-link">
            التفاصيل الكاملة في المتجر ←
          </Link>
        </p>

        <button
          type="button"
          className="report-collapse-toggle"
          onClick={() => setShowTopStoreClients((v) => !v)}
          aria-expanded={showTopStoreClients}
        >
          أفضل الزبائن (المتجر) {showTopStoreClients ? "▲" : "▼"}
        </button>
        {showTopStoreClients &&
          (topStoreClients.length === 0 ? (
            <p className="empty-state">لا توجد مبيعات لهذه الفترة.</p>
          ) : (
            <ul className="report-line-list">
              {topStoreClients.map((row) => {
                const client = getClient(clientStore, row.clientId);
                const currencies = Object.keys(row.totalByCurrency);
                return (
                  <li key={row.clientId ?? "__none__"} className="report-line">
                    <span>{client?.name ?? "بدون زبون"}</span>
                    <strong dir="ltr">
                      {currencies.map((c) => `${formatAmount(row.totalByCurrency[c]!)} ${currencyLabelFor(c)}`).join(" · ")}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ))}

        <button
          type="button"
          className="report-collapse-toggle"
          onClick={() => setShowTopItems((v) => !v)}
          aria-expanded={showTopItems}
        >
          أكثر المواد مبيعًا {showTopItems ? "▲" : "▼"}
        </button>
        {showTopItems &&
          (topItems.length === 0 ? (
            <p className="empty-state">لا توجد مبيعات لهذه الفترة.</p>
          ) : (
            <ul className="report-line-list">
              {topItems.map((row) => {
                const item = getStoreItem(storeItems, row.itemId);
                const currencies = Object.keys(row.totalByCurrency);
                return (
                  <li key={row.itemId} className="report-line">
                    <span>
                      {item?.name ?? "مادة محذوفة"} <span className="settings-hint">({formatAmount(row.quantity)} {item?.unit ?? ""})</span>
                    </span>
                    <strong dir="ltr">
                      {currencies.map((c) => `${formatAmount(row.totalByCurrency[c]!)} ${currencyLabelFor(c)}`).join(" · ")}
                    </strong>
                  </li>
                );
              })}
            </ul>
          ))}

        <div className="report-grid report-grid-3">
          <div className="report-tile">
            <span className="report-tile-label">الشحنات</span>
            <strong className="report-tile-value">{periodSummary.shipmentCount}</strong>
          </div>
          <div className="report-tile">
            <span className="report-tile-label">المصروفات</span>
            <strong className="report-tile-value" dir="ltr">
              {formatAmount(profitSummary.totalSettledStarlinkCostUsd)} USD
            </strong>
          </div>
          <div className="report-tile">
            <span className="report-tile-label">المبيعات</span>
            <strong className="report-tile-value" dir="ltr">
              {formatAmount(periodSummary.totalSaleValueUsd)} USD
            </strong>
          </div>
        </div>

        <div className="report-grid">
          <div className="report-tile">
            <span className="report-tile-label">عدد الأجهزة</span>
            <strong className="report-tile-value">{activeAccounts.length}</strong>
          </div>
          <div className="report-tile">
            <span className="report-tile-label">أجهزة متوقفة (فوترة)</span>
            <strong className="report-tile-value">{suspendedCount}</strong>
          </div>
        </div>

        <h2 className="report-section-title">الإجمالي</h2>
        <div className="report-grid">
          <div className="report-tile">
            <span className="report-tile-label">مستحق المورّد (عليك)</span>
            <strong className="report-tile-value" dir="ltr">
              {formatAmount(pendingStarlinkCostUsd)} USD
            </strong>
          </div>
          <div className="report-tile">
            <span className="report-tile-label">ديون الزبائن (لك)</span>
            {owedCurrencies.length === 0 ? (
              <strong className="report-tile-value">لا يوجد</strong>
            ) : (
              <div className="report-tile-value-stack">
                {owedCurrencies.map((c) => (
                  <strong key={c} dir="ltr">
                    {formatAmount(totalOwed[c]!)} {LEDGER_CURRENCY_LABELS[c]}
                  </strong>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="report-collapse-toggle"
          onClick={() => setShowDollarBreakdown((v) => !v)}
          aria-expanded={showDollarBreakdown}
        >
          كشف الدولار في الشحن {showDollarBreakdown ? "▲" : "▼"}
        </button>
        {showDollarBreakdown && (
          <>
            <div className="report-grid report-grid-3">
              <div className="report-tile">
                <span className="report-tile-label">دولار مستحق لم يُدفع بعد</span>
                <strong className="report-tile-value" dir="ltr">
                  {formatAmount(pendingStarlinkCostUsd)} USD
                </strong>
              </div>
              <div className="report-tile">
                <span className="report-tile-label">دولار هذا الشهر</span>
                <strong className="report-tile-value" dir="ltr">
                  {formatAmount(monthSettledCostUsd)} USD
                </strong>
              </div>
              <div className="report-tile">
                <span className="report-tile-label">دولار استُعمل في الشحن (الكل)</span>
                <strong className="report-tile-value" dir="ltr">
                  {formatAmount(allTimeSettledCostUsd)} USD
                </strong>
              </div>
            </div>
            <p className="settings-hint">
              «دولار استُعمل في الشحن» = ما دُفع فعلًا لـ Starlink بالدولار. «مستحق لم يُدفع بعد» = أجهزة
              شُحنت ولم تُسدَّد تكلفتها لـ Starlink بعد.
            </p>
          </>
        )}

        <button
          type="button"
          className="report-collapse-toggle"
          onClick={() => setShowClientProfits((v) => !v)}
          aria-expanded={showClientProfits}
        >
          أرباحنا من كل زبون {showClientProfits ? "▲" : "▼"}
        </button>
        {showClientProfits && (
          clientProfits.length === 0 ? (
            <p className="empty-state">لا توجد بيانات لهذه الفترة.</p>
          ) : (
            <ul className="report-line-list">
              {clientProfits.map((row) => (
                <li key={row.key} className="report-line report-client-profit">
                  <span>{row.name}</span>
                  <div className="report-client-profit-values">
                    <strong className={row.profitUsd < 0 ? "report-line-negative" : "report-line-positive"}>
                      📡 <bdi dir="ltr">{formatAmount(row.profitMru ?? row.profitUsd)}</bdi> {row.profitMru !== undefined ? "أوقية" : "USD"}
                    </strong>
                    {Object.entries(row.storeProfitByCurrency)
                      .filter(([, v]) => Math.abs(v) > 0.0001)
                      .map(([c, v]) => (
                        <strong key={c} dir="ltr" className={v < 0 ? "report-line-negative" : "report-line-positive"}>
                          🛍️ {formatAmount(v)} {LEDGER_CURRENCY_LABELS[c as keyof typeof LEDGER_CURRENCY_LABELS] ?? c}
                        </strong>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )
        )}

        {periodSummary.hasIncompletePaymentRates && (
          <p className="settings-hint">
            بعض الدفعات مسجّلة بعملة غير الدولار بدون سعر صرف محفوظ، فلم تُحتسب ضمن هذا المجموع.
          </p>
        )}
      </section>
    </main>
  );
}
