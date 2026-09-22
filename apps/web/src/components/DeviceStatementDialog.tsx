"use client";

import { computeDeviceAccountingSummary, computeShipmentProfit } from "@/lib/accountingStore";
import { computeShipmentPaymentStatus, PaymentAllocation, ShipmentPaymentStatus } from "@/lib/paymentAllocationStore";
import { isLegacyShipmentEntry, LEDGER_CURRENCY_LABELS, LedgerCurrency, LedgerEntry, sortEntriesNewestFirst } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";

interface Props {
  accountName: string;
  entries: LedgerEntry[];
  allocations: PaymentAllocation[];
  onClose: () => void;
}

const PAYMENT_STATUS_LABELS: Record<ShipmentPaymentStatus, string> = {
  unpaid: "غير مدفوعة",
  partial: "مدفوعة جزئيًا",
  paid: "مدفوعة بالكامل",
};

const PAYMENT_STATUS_BADGE: Record<ShipmentPaymentStatus, string> = {
  unpaid: "badge-red",
  partial: "badge-yellow",
  paid: "badge-green",
};

/**
 * "كشف حساب الجهاز" (rule XI) - every shipment this device/account has ever had, newest first,
 * plus the summary totals up top. Never mixes this device's numbers with any other device, even
 * if they share the same customer (see DeviceCard/ClientDialog for the customer-level rollup).
 */
export function DeviceStatementDialog({ accountName, entries, allocations, onClose }: Props) {
  const summary = computeDeviceAccountingSummary(entries);
  const shipments = sortEntriesNewestFirst(entries.filter((e) => e.kind === "debit"));

  const paidRows = Object.entries(summary.totalPaidByCustomer) as [LedgerCurrency, number][];
  const debtRows = Object.entries(summary.totalRemainingDebt) as [LedgerCurrency, number][];

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog statement-dialog" role="dialog" aria-modal="true" aria-labelledby="device-statement-title">
        <header className="dialog-header">
          <div>
            <h2 id="device-statement-title">كشف حساب الجهاز - {accountName}</h2>
            <p>كل شحنات هذا الجهاز منذ البداية، الأحدث أولًا</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <div className="statement-summary-grid">
          <div className="statement-summary-item"><span>عدد الشحنات</span><strong>{summary.shipmentCount}</strong></div>
          <div className="statement-summary-item"><span>عمليات D غير مسددة</span><strong>{summary.pendingShipmentCount}</strong></div>
          <div className="statement-summary-item"><span>إجمالي قيمة المبيعات</span><strong dir="ltr">{formatAmount(summary.totalSaleValueUsd)} USD</strong></div>
          <div className="statement-summary-item"><span>إجمالي تكاليف Starlink المسددة</span><strong dir="ltr">{formatAmount(summary.totalSettledStarlinkCostUsd)} USD</strong></div>
          <div className="statement-summary-item"><span>إجمالي الأرباح</span><strong dir="ltr" className="profit-positive">{formatAmount(summary.totalProfitsUsd)} USD</strong></div>
          <div className="statement-summary-item"><span>إجمالي الخسائر</span><strong dir="ltr" className="profit-negative">{formatAmount(summary.totalLossesUsd)} USD</strong></div>
          {paidRows.map(([c, v]) => (
            <div className="statement-summary-item" key={`paid-${c}`}>
              <span>مدفوع من العميل ({LEDGER_CURRENCY_LABELS[c]})</span>
              <strong dir="ltr">{formatAmount(v)}</strong>
            </div>
          ))}
          {debtRows.map(([c, v]) => (
            <div className="statement-summary-item" key={`debt-${c}`}>
              <span>متبقٍ على العميل ({LEDGER_CURRENCY_LABELS[c]})</span>
              <strong dir="ltr">{formatAmount(v)}</strong>
            </div>
          ))}
        </div>

        <div className="statement-net-result">
          {summary.netResult.status === "no-data" ? (
            <span className="badge badge-gray">لا توجد بيانات كافية</span>
          ) : (
            <>
              <span
                className={`statement-net-value ${summary.netResult.netUsd === undefined ? "" : summary.netResult.netUsd >= 0 ? "profit-positive" : "profit-negative"}`}
                dir="ltr"
              >
                صافي نتيجة الجهاز:{" "}
                {summary.netResult.netUsd !== undefined
                  ? `${summary.netResult.netUsd >= 0 ? "ربح" : "خسارة"} ${formatAmount(Math.abs(summary.netResult.netUsd))} USD`
                  : "—"}
              </span>
              {summary.netResult.status === "incomplete" && (
                <span className="badge badge-yellow">غير مكتمل - بانتظار تسوية عمليات D</span>
              )}
            </>
          )}
        </div>

        <div className="statement-cash-flow">
          <span>المحصَّل فعليًا من العميل (بالدولار)</span>
          <strong dir="ltr">{formatAmount(summary.totalPaidByCustomerUsd)} USD</strong>
          <span
            className={`statement-cash-flow-value ${summary.cashFlowUsd >= 0 ? "profit-positive" : "profit-negative"}`}
            dir="ltr"
          >
            التدفق النقدي الفعلي: {summary.cashFlowUsd >= 0 ? "+" : "-"}
            {formatAmount(Math.abs(summary.cashFlowUsd))} USD
          </span>
        </div>

        <ul className="statement-shipment-list">
          {shipments.length === 0 && <li className="ledger-entry-empty">لا توجد شحنات بعد</li>}
          {shipments.map((entry) => {
            const profit = computeShipmentProfit(entry);
            const paymentStatus = computeShipmentPaymentStatus(entry, allocations);
            const saleValueUsd = entry.currency === "USD" ? entry.amount : entry.saleRate?.usdValue;
            const cost = entry.starlinkCost;
            const costUsd = cost?.status === "settled" ? (cost.currencyCode === "USD" ? cost.amount : cost.rate?.usdValue) : undefined;

            return (
              <li key={entry.id} className="statement-shipment-row">
                <div className="statement-shipment-top">
                  <span dir="ltr">{entry.date}</span>
                  <span dir="ltr">عليه {formatAmount(entry.amount)} {entry.currency}</span>
                  {saleValueUsd !== undefined && entry.currency !== "USD" && (
                    <span dir="ltr" className="statement-shipment-usd">({formatAmount(saleValueUsd)} USD)</span>
                  )}
                </div>
                <div className="statement-shipment-badges">
                  <span className={`badge ${PAYMENT_STATUS_BADGE[paymentStatus]}`}>{PAYMENT_STATUS_LABELS[paymentStatus]}</span>
                  {isLegacyShipmentEntry(entry) && <span className="badge badge-gray">عملية قديمة</span>}
                  {cost?.status === "pending" && <span className="badge badge-yellow">D - غير مسدد</span>}
                  {cost?.status === "settled" && <span className="badge badge-green">مسدد لـ Starlink</span>}
                </div>
                {cost?.status === "settled" && (
                  <div className="statement-shipment-cost" dir="ltr">
                    تكلفة Starlink: {formatAmount(cost.amount!)} {cost.currencyCode}
                    {cost.rate && ` (1 USD = ${formatAmount(cost.rate.rateFromUsd)} ${cost.currencyCode})`}
                    {costUsd !== undefined && ` = ${formatAmount(costUsd)} USD`}
                    {cost.paidAt && ` - ${cost.paidAt}`}
                  </div>
                )}
                {profit.status === "computed" && (
                  <div className={`ledger-shipment-profit ${profit.profitUsd! >= 0 ? "profit-positive" : "profit-negative"}`} dir="ltr">
                    {profit.profitUsd! >= 0 ? `ربح +${formatAmount(profit.profitUsd!)} USD` : `خسارة ${formatAmount(profit.profitUsd!)} USD`}
                  </div>
                )}
                {entry.note && <div className="ledger-entry-note">{entry.note}</div>}
              </li>
            );
          })}
        </ul>

        <div className="dialog-actions form-wide">
          <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
        </div>
      </section>
    </div>
  );
}
