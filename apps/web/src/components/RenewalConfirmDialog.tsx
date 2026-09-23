"use client";

import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";

interface Props {
  account: StarlinkAccountSummary;
  /** Applies the new renewal date and opens the ledger dialog for this account so the operator can
   * record the actual shipment/payment - this dialog itself never creates a ledger entry, never
   * touches Starlink, and never runs twice for the same confirm (a single explicit submit). */
  onConfirm: (newRechargeDate: string) => void;
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
 * `rechargeDate` on confirm; it never talks to Starlink itself (no automatic payment/renewal) and
 * never creates a ledger entry on its own - the caller opens the existing "إضافة حركة" flow
 * (LedgerDialog) right after, so recording the financial side stays one deliberate, reusable step
 * rather than something this dialog invents its own version of.
 */
export function RenewalConfirmDialog({ account, onConfirm, onClose }: Props) {
  const [date, setDate] = useState(toInputDate(account.rechargeDate || dateAfterDays(28)));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(toStoredDate(date));
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

          <p className="renewal-dialog-note">
            بعد التأكيد سيُفتح سجل حركة الحساب لتسجيل الشحنة/الدفعة المرتبطة بهذا التجديد.
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
