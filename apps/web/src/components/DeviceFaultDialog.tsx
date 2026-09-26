"use client";

import { FormEvent, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";

type FaultReason = "burned" | "other";

interface Props {
  account: StarlinkAccountSummary;
  /** What the device still owes Starlink (open D), USD - 0 when nothing. */
  openDebtUsd: number;
  /** How many of its D's were dropped earlier (a repair brings them back). */
  waivedCount: number;
  /** `waiveDebts`: don't pay Starlink for its open D - the whole amount becomes profit today. */
  onSave: (fault: NonNullable<StarlinkAccountSummary["deviceFault"]>, waiveDebts: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * "متعطل" - a hardware fault, entirely independent of the Starlink subscription's own
 * serviceStatus (see StarlinkAccountSummary.deviceFault's own doc). Marking one just records a
 * reason/note on the device; it never touches serviceStatus, the ledger, or any Starlink data.
 */
export function DeviceFaultDialog({ account, openDebtUsd, waivedCount, onSave, onClear, onClose }: Props) {
  const existing = account.deviceFault;
  const [reason, setReason] = useState<FaultReason>(existing?.reason ?? "burned");
  const [note, setNote] = useState(existing?.note ?? "");
  // A burned device's D is normally never paid - ticked by default for "محترق" only.
  const [waive, setWaive] = useState((existing?.reason ?? "burned") === "burned");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ reason, note: note.trim(), reportedAt: existing?.reportedAt ?? new Date().toISOString() }, openDebtUsd > 0 && waive);
  }

  function clear() {
    const question =
      waivedCount > 0
        ? `تم إصلاح الجهاز؟ سيعود عليه D (${waivedCount}) لتدفعه لستارلينك، ويُلغى ربحه الذي حُسب يوم العطل.`
        : "تم إصلاح الجهاز؟ سيعود إلى التذكيرات العادية.";
    if (window.confirm(question)) onClear();
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
            <select
              value={reason}
              onChange={(e) => {
                const next = e.target.value as FaultReason;
                setReason(next);
                setWaive(next === "burned");
              }}
            >
              <option value="burned">محترق</option>
              <option value="other">عطل آخر</option>
            </select>
          </label>

          <label className="form-field form-wide">
            <span>ملاحظة</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
          </label>

          {openDebtUsd > 0 && (
            <label className="ledger-d-toggle form-wide">
              <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
              <span>
                لن أدفع لستارلينك عليه (D <bdi dir="ltr">{openDebtUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} $</bdi>) - يصبح مبلغ
                التجديد كله ربحًا اليوم، ويبقى على الزبون كما هو
              </span>
            </label>
          )}
          {waivedCount > 0 && (
            <p className="renewal-dialog-note form-wide">
              🔥 {waivedCount} شحنة لن تُدفع لستارلينك وحُسب مبلغها ربحًا. إن أُصلح الجهاز اضغط «تم الإصلاح» فيعود الـD.
            </p>
          )}
          <p className="renewal-dialog-note form-wide">الجهاز المعطل يخرج من تذكيرات التجديد ويظهر في قائمة «المعطلة».</p>

          <div className="dialog-actions form-wide">
            {existing && (
              <button className="dialog-danger" type="button" onClick={clear}>إزالة شارة العطل (تم الإصلاح)</button>
            )}
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">{existing ? "حفظ التعديل" : "تسجيل العطل"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
