"use client";

import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { DateInput } from "./DateInput";

/**
 * "إضافة دين سابق": records a Starlink debt the device already carried when its owner brought it -
 * its own record (previousDebt.ts), never merged with anything, open until paid.
 */
export function PreviousDebtDialog({
  account,
  suggestedUsd,
  onSave,
  onClose,
}: {
  account: StarlinkAccountSummary;
  /** Prefilled amount - what Starlink shows beyond the debts already recorded. */
  suggestedUsd?: number;
  /** Returns an error message, or null once saved. */
  onSave: (input: { date: string; amountUsd: number; note: string }) => string | null;
  onClose: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(suggestedUsd ? String(suggestedUsd) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = onSave({ date, amountUsd: Number(amount), note });
    if (message) setError(message);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="previous-debt-title">
        <header className="dialog-header">
          <div>
            <h2 id="previous-debt-title">إضافة دين سابق</h2>
            <p>حساب &quot;{account.name}&quot; - دين على Starlink كان على الجهاز قبل أن يصلك</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label className="form-field">
            <span>المبلغ بالدولار *</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" required />
          </label>
          <label className="form-field">
            <span>التاريخ *</span>
            <DateInput required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="form-field form-wide">
            <span>ملاحظة</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري - مثلًا: فواتير المالك السابق" />
          </label>
          <p className="renewal-dialog-note form-wide">
            يظهر في قائمة الديون بعلامة D برتقالية ويبقى حتى تسجّل دفعه من صفحة «ستارلينك والبطاقة» - عندها تكتب كم دفعت وكم يُسجَّل على الزبون.
          </p>
          {error && <div className="account-card-alert form-wide">{error}</div>}
          <div className="dialog-actions form-wide">
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">حفظ الدين</button>
          </div>
        </form>
      </section>
    </div>
  );
}
