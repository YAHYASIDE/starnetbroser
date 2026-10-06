"use client";

import { useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "./AccountsSection";
import { acceptRenewalMismatch, ignoreRenewalMismatch, lockRenewalDay, renewalDayOf, unlockRenewalDay } from "@/lib/renewalDayLock";

/** 📌 The device's renewal day: lock / change / unlock it, and decide a different day a sync read. */
export function RenewalLockSheet({
  account,
  onPatch,
  onClose,
}: {
  account: StarlinkAccountSummary;
  onPatch: (patch: Partial<StarlinkAccountSummary>) => void;
  onClose: () => void;
}) {
  const current = account.lockedRenewalDay ?? renewalDayOf(account.rechargeDate);
  const [day, setDay] = useState(current ? String(current) : "");
  const [error, setError] = useState<string | null>(null);
  const mismatch = account.renewalDayMismatch;

  function apply(patch: Partial<StarlinkAccountSummary> | null) {
    if (patch) onPatch(patch);
    onClose();
  }

  function lock() {
    const value = Number(day);
    if (!Number.isInteger(value) || value < 1 || value > 28) {
      setError("اكتب يومًا من 1 إلى 28 - ستارلينك لا يجدد بعد يوم 28");
      return;
    }
    const patch = lockRenewalDay(account, value);
    if (!patch) {
      setError("لا يوجد تاريخ تجديد لهذا الجهاز بعد - زامنه أولًا");
      return;
    }
    apply(patch);
  }

  return (
    <PartySheet title={`📌 يوم التجديد - ${account.name}`} onClose={onClose}>
      <div className="renewal-lock">
        {mismatch && (
          <div className="renewal-lock-warning" role="alert">
            <strong>⚠️ ستارلينك قرأ يوم {mismatch.day} - المثبّت {account.lockedRenewalDay}</strong>
            <small>
              قرأت المزامنة <bdi dir="ltr">{mismatch.date}</bdi>، وبقي التاريخ المثبّت <bdi dir="ltr">{account.rechargeDate}</bdi>. إن نُقل الجهاز لدولة أخرى فاقبل اليوم الجديد، وإلا فتجاهل.
            </small>
            <div className="settings-actions">
              <button type="button" className="dialog-primary" onClick={() => apply(acceptRenewalMismatch(account))}>
                اقبل يوم {mismatch.day} (نُقل لدولة أخرى)
              </button>
              <button type="button" className="text-action" onClick={() => apply(ignoreRenewalMismatch(account))}>
                تجاهل
              </button>
            </div>
          </div>
        )}
        <p className="settings-hint">
          {account.lockedRenewalDay
            ? `📌 يوم التجديد مثبّت على ${account.lockedRenewalDay}: المزامنة تغيّر الشهر فقط، وإن قرأت يومًا آخر يبقى ${account.lockedRenewalDay} ويصلك تنبيه.`
            : "ثبّت يوم التجديد: المزامنة تغيّر الشهر فقط (10/10 ← 11/10)، ولا تغيّر اليوم أبدًا حتى لو أخطأت القراءة."}
        </p>
        <label className="renewal-lock-day">
          <span>اليوم</span>
          <input
            id={`renewal-day-${account.id}`}
            className="search-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            dir="ltr"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setError(null);
            }}
          />
        </label>
        {error && <p className="settings-hint renewal-lock-error">{error}</p>}
        <div className="settings-actions">
          <button type="button" className="dialog-primary" onClick={lock}>
            {account.lockedRenewalDay ? "💾 حفظ اليوم" : "📌 ثبّت"}
          </button>
          {account.lockedRenewalDay ? (
            <button type="button" className="text-action" onClick={() => apply(unlockRenewalDay())}>
              فكّ التثبيت
            </button>
          ) : null}
        </div>
      </div>
    </PartySheet>
  );
}
