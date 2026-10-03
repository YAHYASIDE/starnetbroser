"use client";

import { FormEvent, useState } from "react";
import type { DeviceFaultReason, StarlinkAccountSummary } from "@starnet/shared";
import { FAULT_CATEGORIES, faultCategory } from "@/lib/deviceFault";

/** "repair" = 🛠️ قيد الإصلاح: saved as account.underRepair, never as a fault. */
type FaultReason = DeviceFaultReason | "repair";

interface Props {
  account: StarlinkAccountSummary;
  /** What the device still owes Starlink (open D), USD - 0 when nothing. */
  openDebtUsd: number;
  /** How many of its D's were dropped earlier (a repair brings them back). */
  waivedCount: number;
  /** `waiveDebts`: don't pay Starlink for its open D - the whole amount becomes profit today. */
  onSave: (fault: NonNullable<StarlinkAccountSummary["deviceFault"]>, waiveDebts: boolean) => void;
  onClear: () => void;
  /** 🛠️ قيد الإصلاح (with Starlink support) - its own record, not a fault. */
  onSaveRepair: (note: string) => void;
  onClearRepair: () => void;
  onClose: () => void;
}

/**
 * "متعطل" - a hardware fault, entirely independent of the Starlink subscription's own
 * serviceStatus (see StarlinkAccountSummary.deviceFault's own doc). Marking one just records a
 * reason/note on the device; it never touches serviceStatus, the ledger, or any Starlink data.
 */
export function DeviceFaultDialog({ account, openDebtUsd, waivedCount, onSave, onClear, onSaveRepair, onClearRepair, onClose }: Props) {
  const existing = account.deviceFault;
  const repair = account.underRepair;
  // A device the app already put in a group (no subscription / secondary email) opens on it.
  const [reason, setReason] = useState<FaultReason>(existing?.reason ?? (repair ? "repair" : faultCategory(account) ?? "burned"));
  const [note, setNote] = useState(existing?.note ?? repair?.note ?? "");
  // A burned device's D is normally never paid - ticked by default for "محترق" only.
  const [waive, setWaive] = useState((existing?.reason ?? faultCategory(account) ?? "burned") === "burned");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason === "repair") {
      onSaveRepair(note.trim());
      return;
    }
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
            <h2 id="fault-dialog-title">الأجهزة المعطلة</h2>
            <p>حساب "{account.name}" - هذا لا يغيّر حالة الاشتراك في Starlink</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <form className="account-form" onSubmit={submit}>
          <label className="form-field form-wide">
            <span>النوع</span>
            <select
              value={reason}
              onChange={(e) => {
                const next = e.target.value as FaultReason;
                setReason(next);
                setWaive(next === "burned");
              }}
            >
              {FAULT_CATEGORIES.filter((c) => c.reason !== "other" || existing?.reason === "other").map((c) => (
                <option key={c.reason} value={c.reason}>{c.icon} {c.label}</option>
              ))}
              <option value="repair">🛠️ قيد الإصلاح (مع الدعم الفني)</option>
            </select>
          </label>

          <label className="form-field form-wide">
            <span>ملاحظة</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="اختياري" />
          </label>

          {openDebtUsd > 0 && reason !== "repair" && (
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
          <p className="renewal-dialog-note form-wide">
            {reason === "repair"
              ? "قيد الإصلاح: مشكلة فنية نتابعها مع الدعم الفني - يبقى الجهاز في التذكيرات ويظهر في قائمة «قيد الإصلاح». اكتب في الملاحظة رقم التذكرة أو ما قاله الدعم."
              : "الجهاز المعطل يخرج من تذكيرات التجديد ويظهر في قائمة «المعطلة»."}
          </p>

          <div className="dialog-actions form-wide">
            {existing && reason !== "repair" && (
              <button className="dialog-danger" type="button" onClick={clear}>إزالة شارة العطل (تم الإصلاح)</button>
            )}
            {repair && reason === "repair" && (
              <button className="dialog-danger" type="button" onClick={() => window.confirm("انتهى الإصلاح؟ يخرج الجهاز من «قيد الإصلاح».") && onClearRepair()}>
                ✓ تم الإصلاح
              </button>
            )}
            <button className="dialog-secondary" type="button" onClick={onClose}>إلغاء</button>
            <button className="dialog-primary" type="submit">{reason === "repair" ? (repair ? "حفظ" : "🛠️ إلى قيد الإصلاح") : existing ? "حفظ التعديل" : "تسجيل العطل"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
