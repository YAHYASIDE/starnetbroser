"use client";

import type { StarlinkAccountSummary } from "@starnet/shared";
import { pickSyncAccounts, SYNC_WINDOWS, type SyncWindow } from "@/lib/syncQueue";

/** 🔄 «مزامنة الآن»: which devices to sync, one after another, each in its own browser. */
export function SyncChoiceSheet({
  accounts,
  today,
  onPick,
  onClose,
}: {
  accounts: StarlinkAccountSummary[];
  today: string;
  onPick: (window: SyncWindow) => void;
  onClose: () => void;
}) {
  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet" role="dialog" aria-modal="true" aria-label="مزامنة الآن" onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>🔄 مزامنة الآن</strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <p className="sync-choice-hint">جهاز بعد جهاز في متصفحه، مثل «مزامنة» اليدوية · «اليوم» = التي تنتهي اليوم (وما توقف هذه الليلة) · «3 أيام» = اليوم واليومان التاليان</p>
        <div className="card-more-list">
          {SYNC_WINDOWS.map(({ window, label }) => {
            const count = pickSyncAccounts(accounts, window, today).length;
            return (
              <button key={label} type="button" className="card-more-item" disabled={count === 0} onClick={() => onPick(window)}>
                {label} <small>{count} جهاز</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Between two devices: what's next, a short countdown, and «إيقاف». */
export function SyncQueueBar({
  label,
  progress,
  nextName,
  secondsLeft,
  onNow,
  onStop,
}: {
  label: string;
  progress: string;
  nextName: string;
  secondsLeft: number;
  onNow: () => void;
  onStop: () => void;
}) {
  return (
    <div className="sync-queue-bar" role="status">
      <div className="sync-queue-text">
        <strong>
          🔄 {label} · <bdi dir="ltr">{progress}</bdi>
        </strong>
        <span>
          التالي: {nextName} · بعد <bdi dir="ltr">{secondsLeft}</bdi> ث
        </span>
      </div>
      <button type="button" className="sync-queue-now" onClick={onNow}>
        الآن
      </button>
      <button type="button" className="sync-queue-stop" onClick={onStop}>
        إيقاف
      </button>
    </div>
  );
}
