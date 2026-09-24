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
import { filterEntriesByPeriod, isThisCalendarMonth, REPORT_PERIOD_LABELS, REPORT_PERIODS, ReportPeriod } from "@/lib/reportPeriod";
import { ClientStore, getClient, loadClientStore } from "@/lib/clientStore";
import { formatAmount } from "@/lib/formatAmount";
import { InvoiceList, loadInvoices } from "@/lib/invoiceStore";
import { getStoreItem, loadStoreItems, loadStoreTransactions, StoreItemRegistry, StoreTransactionList } from "@/lib/storeStore";
import { computeClientSalesTotals, computeItemSalesTotals, computeStoreSalesSummary, largestCurrencyValue } from "@/lib/storeReports";
import { CashEntryList, loadCashEntries, listStandaloneCashEntries } from "@/lib/cashStore";

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
  profitUsd: number;
}

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [invoices, setInvoices] = useState<InvoiceList>([]);
  const [storeItems, setStoreItems] = useState<StoreItemRegistry>({});
  const [storeTransactions, setStoreTransactions] = useState<StoreTransactionList>([]);
  const [cashEntries, setCashEntries] = useState<CashEntryList>([]);
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
  const periodNetProfitUsd = periodSummary.totalProfitsUsd - periodSummary.totalLossesUsd;

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
    for (const account of accounts) {
      const entries = filterEntriesByPeriod(ledgerStore[account.id] ?? [], period);
      if (entries.length === 0) continue;
      const summary = computeDeviceAccountingSummary(entries);
      const netUsd = summary.totalProfitsUsd - summary.totalLossesUsd;
      const client = getClient(clientStore, account.clientId);
      const key = client?.id ?? "__none__";
      const row = byKey.get(key) ?? { key, name: client?.name ?? "بدون زبون", profitUsd: 0 };
      row.profitUsd += netUsd;
      byKey.set(key, row);
    }
    return Array.from(byKey.values()).sort((a, b) => b.profitUsd - a.profitUsd);
  }, [accounts, ledgerStore, clientStore, period]);

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">الأرباح والتقارير</h1>
      </div>

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

        <div className={`report-net-tile${periodNetProfitUsd < 0 ? " report-net-tile-negative" : ""}`}>
          <span className="report-net-tile-label">صافي الربح · {REPORT_PERIOD_LABELS[period]}</span>
          <strong className="report-net-tile-value" dir="ltr">
            {formatAmount(periodNetProfitUsd)} USD
          </strong>
        </div>

        {/* Deliberately a SEPARATE tile, never merged with صافي الربح above (accountingStore.ts's
            own rule) - a debit entry marked D still counts here once the customer actually pays
            (a credit entry), even though its own profit stays pending until Starlink is settled. */}
        <div className="report-net-tile report-net-tile-info">
          <span className="report-net-tile-label">
            النقد المحصّل فعليًا (بعد خصم المدفوع لـ Starlink) · {REPORT_PERIOD_LABELS[period]}
          </span>
          <strong className="report-net-tile-value" dir="ltr">
            {formatAmount(periodSummary.cashFlowUsd)} USD
          </strong>
        </div>
        <p className="settings-hint">
          «صافي الربح» يُحسب فقط بعد تسديد تكلفة Starlink (D). «النقد المحصّل» يظهر فور استلام الدفعة من
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
              {formatAmount(periodSummary.totalSettledStarlinkCostUsd)} USD
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
                <li key={row.key} className="report-line">
                  <span>{row.name}</span>
                  <strong dir="ltr" className={row.profitUsd < 0 ? "report-line-negative" : "report-line-positive"}>
                    {formatAmount(row.profitUsd)} USD
                  </strong>
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
