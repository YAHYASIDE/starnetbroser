"use client";

import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { formatAmount } from "@/lib/formatAmount";

interface Props {
  account: StarlinkAccountSummary;
  /** Applies the new renewal date; `autoShipment` asks the caller to record the month's shipment
   * from the device's renewalPlan, otherwise it opens the ledger dialog for a manual entry. This
   * dialog itself never creates a ledger entry and never touches Starlink. */
  onConfirm: (newRechargeDate: string, autoShipment: boolean) => void;
  onClose: () => void;
}

function dateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toInputDate(date: string): string {
  return date.replace(/\//g, "-");
}

function toStoredDate(date: string): string {
  return date.replace(/-/g, "/");
}

/**
 * "تجديد" - records that the operator has actually shipped/renewed this device. Only ever updates
 * `rechargeDate` on confirm; it never talks to Starlink itself. The financial side is either the
 * one-tap shipment from the device's fixed monthly price (renewalPlan.ts, done by the caller) or
 * the existing "إضافة حركة" flow (LedgerDialog) opened right after.
 */
export function RenewalConfirmDialog({ account, onConfirm, onClose }: Props) {
  const [date, setDate] = useState(toInputDate(account.rechargeDate || dateAfterDays(28)));
  const plan = account.renewalPlan;
  // With a fixed monthly price (renewalPlan) the shipment can be recorded in the same tap; the
  // operator can still untick this to type it by hand.
  const [autoShipment, setAutoShipment] = useState(plan !== undefined);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(toStoredDate(date), autoShipment && plan !== undefined);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog renewal-dialog" role="dialog" aria-modal="true" aria-labelledby="renewal-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="renewal-dialog-title">تأكيد التجديد</h2>
            <p>حساب "{account.name}" - سجّل أنك شحنت/جددت الجهاز فعليًا</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label className="form-field form-wide">
            <span>موعد الانتهاء الجديد *</span>
            <input required type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {plan && (
            <label className="ledger-d-toggle renewal-auto-toggle form-wide">
              <input type="checkbox" checked={autoShipment} onChange={(e) => setAutoShipment(e.target.checked)} />
              <span>
                ⚡ سجّل الشحنة تلقائيًا:{" "}
                <bdi dir="ltr">
                  {formatAmount(plan.saleAmount)} {plan.saleCurrency}
                </bdi>{" "}
                للزبون، وتكلفة Starlink{" "}
                <bdi dir="ltr">
                  {formatAmount(plan.costAmount)} {plan.costCurrency}
                </bdi>
              </span>
            </label>
          )}

          <p className="renewal-dialog-note">
            {autoShipment && plan
              ? "ستُسجَّل الشحنة بأسعار الصرف الحالية وتظهر في كشف الجهاز والزبون مباشرة."
              : "بعد التأكيد سيُفتح سجل حركة الحساب لتسجيل الشحنة/الدفعة المرتبطة بهذا التجديد."}
          </p>

          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">تأكيد التجديد</button>
          </div>
        </form>
      </section>
    </div>
  );
}
