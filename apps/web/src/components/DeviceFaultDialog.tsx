"use client";

import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";

type FaultReason = "burned" | "other";

interface Props {
  account: StarlinkAccountSummary;
  onSave: (fault: NonNullable<StarlinkAccountSummary["deviceFault"]>) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * "متعطل" - a hardware fault, entirely independent of the Starlink subscription's own
 * serviceStatus (see StarlinkAccountSummary.deviceFault's own doc). Marking one just records a
 * reason/note on the device; it never touches serviceStatus, the ledger, or any Starlink data.
 */
export function DeviceFaultDialog({ account, onSave, onClear, onClose }: Props) {
  const existing = account.deviceFault;
  const [reason, setReason] = useState<FaultReason>(existing?.reason ?? "burned");
  const [note, setNote] = useState(existing?.note ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ reason, note: note.trim(), reportedAt: existing?.reportedAt ?? new Date().toISOString() });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog fault-dialog" role="dialog" aria-modal="true" aria-labelledby="fault-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="fault-dialog-title">حالة الجهاز</h2>
            <p>حساب "{account.name}" - هذا لا يغيّر حالة الاشتراك في Starlink</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label className="form-field form-wide">
            <span>سبب العطل</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as FaultReason)}>
              <option value="burned">محترق</option>
              <option value="other">عطل آخر</option>
            </select>
          </label>

          <label className="form-field form-wide">
            <span>ملاحظة</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
          </label>

          <div className="dialog-actions form-wide">
            {existing && (
              <button className="dialog-danger" type="button" onClick={onClear}>إزالة شارة العطل (تم الإصلاح)</button>
            )}
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">{existing ? "حفظ التعديل" : "تسجيل العطل"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
