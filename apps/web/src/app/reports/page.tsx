"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StarlinkAccountSummary } from "@starnet/shared";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerByAccount, loadLedgerStore, totalOwedAcrossAccounts } from "@/lib/ledgerStore";
import { computeDeviceAccountingSummary } from "@/lib/accountingStore";
import { formatAmount } from "@/lib/formatAmount";

export default function ReportsPage() {
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});

  useEffect(() => {
    setLedgerStore(loadLedgerStore());
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

  const totalOwed = useMemo(() => totalOwedAcrossAccounts(ledgerStore), [ledgerStore]);
  const allEntries = useMemo(() => Object.values(ledgerStore).flat(), [ledgerStore]);
  const portfolio = useMemo(() => computeDeviceAccountingSummary(allEntries), [allEntries]);

  const owedCurrencies = LEDGER_CURRENCIES.filter((c) => totalOwed[c] !== undefined && totalOwed[c]! > 0);

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">الأرباح والتقارير</h1>
      </div>

      <section className="section">
        <div className="report-grid">
          <div className="report-tile">
            <span className="report-tile-label">عدد الأجهزة</span>
            <strong className="report-tile-value">{activeAccounts.length}</strong>
          </div>
          <div className="report-tile">
            <span className="report-tile-label">أجهزة متوقفة (فوترة)</span>
            <strong className="report-tile-value">{suspendedCount}</strong>
          </div>
          <div className="report-tile">
            <span className="report-tile-label">شحنات بانتظار التسديد (D)</span>
            <strong className="report-tile-value">{portfolio.pendingShipmentCount}</strong>
          </div>
          <div className="report-tile">
            <span className="report-tile-label">صافي الربح المحسوب</span>
            <strong className="report-tile-value" dir="ltr">
              {formatAmount(portfolio.totalProfitsUsd - portfolio.totalLossesUsd)} USD
            </strong>
          </div>
        </div>

        <h2 className="report-section-title">إجمالي المستحق على الزبائن</h2>
        {owedCurrencies.length === 0 ? (
          <p className="empty-state">لا يوجد أي مستحق حاليًا.</p>
        ) : (
          <ul className="report-line-list">
            {owedCurrencies.map((c) => (
              <li key={c} className="report-line">
                <span>{LEDGER_CURRENCY_LABELS[c]}</span>
                <strong dir="ltr">{formatAmount(totalOwed[c]!)}</strong>
              </li>
            ))}
          </ul>
        )}

        <h2 className="report-section-title">التدفق النقدي الفعلي</h2>
        <ul className="report-line-list">
          <li className="report-line">
            <span>إجمالي المحصّل من الزبائن</span>
            <strong dir="ltr">{formatAmount(portfolio.totalPaidByCustomerUsd)} USD</strong>
          </li>
          <li className="report-line">
            <span>تكلفة الشحنات المسددة لـ Starlink</span>
            <strong dir="ltr">{formatAmount(portfolio.totalSettledStarlinkCostUsd)} USD</strong>
          </li>
          <li className="report-line">
            <span>صافي التدفق النقدي</span>
            <strong dir="ltr">{formatAmount(portfolio.cashFlowUsd)} USD</strong>
          </li>
        </ul>
        {portfolio.hasIncompletePaymentRates && (
          <p className="settings-hint">
            بعض الدفعات مسجّلة بعملة غير الدولار بدون سعر صرف محفوظ، فلم تُحتسب ضمن هذا المجموع.
          </p>
        )}
      </section>
    </main>
  );
}
