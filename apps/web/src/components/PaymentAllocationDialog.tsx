"use client";

import { useState } from "react";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency, LedgerEntry } from "@/lib/ledgerStore";
import { formatAmount } from "@/lib/formatAmount";
import { AllocationPlanItem } from "@/lib/paymentAllocationStore";

export interface AllocationShipmentRow {
  entry: LedgerEntry;
  /** Still owed on this shipment, in its own currency (== the payment's currency, since only
   * same-currency shipments are ever shown here). */
  remaining: number;
}

export interface AllocationDeviceOption {
  accountId: string;
  accountName: string;
  /** Eligible (not fully paid, same-currency) shipments on THIS device, oldest first. */
  shipments: AllocationShipmentRow[];
  /** The FIFO suggestion for this device's own shipments - pre-filled but fully editable. */
  initialPlan: AllocationPlanItem[];
}

interface Props {
  amount: number;
  currency: LedgerCurrency;
  /** Every device eligible to receive this allocation - the payment's own device first, then any
   * other device linked to the same customer (rule 8: "التخصيص داخل الجهاز المختار، مع إمكانية
   * اختيار جهاز آخر يدويًا"). Always at least one entry. */
  devices: AllocationDeviceOption[];
  /** Which device's shipments are shown first - the payment's own device. */
  initialDeviceId: string;
  onConfirm: (plan: AllocationPlanItem[]) => void;
  onCancel: () => void;
}

function buildInitialValues(device: AllocationDeviceOption): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of device.shipments) {
    const match = device.initialPlan.find((p) => p.shipmentEntryId === row.entry.id);
    values[row.entry.id] = match ? String(match.amount) : "";
  }
  return values;
}

/**
 * Shown before a customer payment is actually saved (or, for an already-saved payment with an
 * unallocated remainder, whenever "تخصيص الدفعة" is used) - "يعرض النظام الشحنة التي ستُخصص لها
 * الدفعة قبل الحفظ" (rule 3). Never converts currency (only same-currency shipments are listed at
 * all) and never touches a shipment's own recorded amount - this only proposes/confirms
 * independent PaymentAllocation records. The whole allocation happens within ONE chosen device at
 * a time (rule 8) - switching devices swaps the shipment list and resets to that device's own
 * FIFO suggestion, it never splits one payment across two different devices in the same plan.
 */
export function PaymentAllocationDialog({ amount, currency, devices, initialDeviceId, onConfirm, onCancel }: Props) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(initialDeviceId);
  const selectedDevice = devices.find((d) => d.accountId === selectedDeviceId) ?? devices[0];
  const [values, setValues] = useState<Record<string, string>>(() => buildInitialValues(selectedDevice));

  function selectDevice(accountId: string) {
    const device = devices.find((d) => d.accountId === accountId);
    if (!device) return;
    setSelectedDeviceId(accountId);
    setValues(buildInitialValues(device));
  }

  const totalAllocated = Object.values(values).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const remaining = amount - totalAllocated;

  function confirm() {
    const plan: AllocationPlanItem[] = selectedDevice.shipments
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
            <p dir="ltr">{formatAmount(amount)} {LEDGER_CURRENCY_LABELS[currency]} - الأقدم أولًا (قابل للتعديل)</p>
          </div>
          <button className="dialog-close" type="button" onClick={onCancel} aria-label="إغلاق">×</button>
        </header>

        {devices.length > 1 && (
          <label className="form-field form-wide">
            <span>التخصيص داخل الجهاز</span>
            <select className="search-input" value={selectedDeviceId} onChange={(e) => selectDevice(e.target.value)}>
              {devices.map((d) => (
                <option key={d.accountId} value={d.accountId}>{d.accountName}</option>
              ))}
            </select>
          </label>
        )}

        {selectedDevice.shipments.length === 0 ? (
          <p className="ledger-entry-empty">
            لا توجد شحنات غير مدفوعة بعملة {LEDGER_CURRENCY_LABELS[currency]} على هذا الجهاز - ستبقى الدفعة (أو هذا الجزء منها) كرصيد غير مخصص للزبون.
          </p>
        ) : (
          <ul className="allocation-list">
            {selectedDevice.shipments.map((row) => (
              <li key={row.entry.id} className="allocation-row">
                <div className="allocation-row-info">
                  <span dir="ltr">{row.entry.date}</span>
                  <span dir="ltr">عليه {formatAmount(row.entry.amount)} {row.entry.currency}</span>
                  <span dir="ltr" className="allocation-remaining">المتبقي: {formatAmount(row.remaining)}</span>
                </div>
                <input
                  className="search-input"
                  type="number" lang="en"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  placeholder="0"
                  value={values[row.entry.id] ?? ""}
                  onChange={(e) => setValues((current) => ({ ...current, [row.entry.id]: e.target.value }))}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="allocation-summary" dir="ltr">
          <span>المخصَّص: {formatAmount(totalAllocated)} / {formatAmount(amount)}</span>
          {remaining > 0.0001 && <span className="allocation-unallocated">رصيد غير مخصص للزبون: {formatAmount(remaining)}</span>}
        </div>
        {remaining < -0.0001 && <div className="account-card-alert">المبلغ المخصَّص أكبر من مبلغ الدفعة</div>}

        <div className="dialog-actions form-wide">
          <button className="dialog-secondary" type="button" onClick={onCancel}>إلغاء</button>
          <button className="dialog-primary" type="button" disabled={remaining < -0.0001} onClick={confirm}>
            تأكيد
          </button>
        </div>
      </section>
    </div>
  );
}
