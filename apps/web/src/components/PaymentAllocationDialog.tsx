"use client";

import { useState } from "react";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency, LedgerEntry } from "@/lib/ledgerStore";
import { AllocationPlanItem } from "@/lib/paymentAllocationStore";

export interface AllocationShipmentRow {
  entry: LedgerEntry;
  /** Still owed on this shipment, in its own currency (== the payment's currency, since only
   * same-currency shipments are ever shown here). */
  remaining: number;
}

interface Props {
  amount: number;
  currency: LedgerCurrency;
  /** Eligible (not fully paid, same-currency) shipments, oldest first. */
  shipments: AllocationShipmentRow[];
  /** The FIFO suggestion, pre-filled but fully editable - rule 3's "يمكنني تغيير الاختيار يدويًا". */
  initialPlan: AllocationPlanItem[];
  onConfirm: (plan: AllocationPlanItem[]) => void;
  onCancel: () => void;
}

/**
 * Shown before a customer payment is actually saved - "يعرض النظام الشحنة التي ستُخصص لها الدفعة
 * قبل الحفظ" (rule 3). Never converts currency (only same-currency shipments are listed at all)
 * and never touches a shipment's own recorded amount - this only proposes/confirms independent
 * PaymentAllocation records.
 */
export function PaymentAllocationDialog({ amount, currency, shipments, initialPlan, onConfirm, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const row of shipments) {
      const match = initialPlan.find((p) => p.shipmentEntryId === row.entry.id);
      initial[row.entry.id] = match ? String(match.amount) : "";
    }
    return initial;
  });

  const totalAllocated = Object.values(values).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const remaining = amount - totalAllocated;

  function confirm() {
    const plan: AllocationPlanItem[] = shipments
      .map((row) => ({ shipmentEntryId: row.entry.id, amount: Number(values[row.entry.id]) || 0 }))
      .filter((item) => item.amount > 0);
    onConfirm(plan);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="alloc-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="alloc-dialog-title">تخصيص الدفعة</h2>
            <p dir="ltr">{amount} {LEDGER_CURRENCY_LABELS[currency]} - الأقدم أولًا (قابل للتعديل)</p>
          </div>
          <button className="dialog-close" type="button" onClick={onCancel} aria-label="إغلاق">×</button>
        </header>

        {shipments.length === 0 ? (
          <p className="ledger-entry-empty">
            لا توجد شحنات غير مدفوعة بعملة {LEDGER_CURRENCY_LABELS[currency]} - ستبقى الدفعة كرصيد دائن عام للزبون.
          </p>
        ) : (
          <ul className="allocation-list">
            {shipments.map((row) => (
              <li key={row.entry.id} className="allocation-row">
                <div className="allocation-row-info">
                  <span dir="ltr">{row.entry.date}</span>
                  <span dir="ltr">عليه {row.entry.amount} {row.entry.currency}</span>
                  <span dir="ltr" className="allocation-remaining">المتبقي: {row.remaining.toFixed(2)}</span>
                </div>
                <input
                  className="search-input"
                  type="number"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  placeholder="0"
                  value={values[row.entry.id]}
                  onChange={(e) => setValues((current) => ({ ...current, [row.entry.id]: e.target.value }))}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="allocation-summary" dir="ltr">
          <span>المخصَّص: {totalAllocated.toFixed(2)} / {amount.toFixed(2)}</span>
          {remaining > 0.0001 && <span className="allocation-unallocated">غير مخصص: {remaining.toFixed(2)}</span>}
        </div>
        {remaining < -0.0001 && <div className="account-card-alert">المبلغ المخصَّص أكبر من مبلغ الدفعة</div>}

        <div className="dialog-actions form-wide">
          <button className="dialog-secondary" type="button" onClick={onCancel}>إلغاء</button>
          <button className="dialog-primary" type="button" disabled={remaining < -0.0001} onClick={confirm}>
            تأكيد الدفعة
          </button>
        </div>
      </section>
    </div>
  );
}
