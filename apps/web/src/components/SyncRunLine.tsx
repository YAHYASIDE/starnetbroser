"use client";

import { useState } from "react";
import { isRunOver, retryIds, runCaption, runCounts, runFill, runRows, type RunRow, type SyncRun } from "@/lib/syncRun";

/**
 * 🟩 The sync run's live line (his Oct 18 2026 ask): a see-through green line at the middle of the
 * screen's right edge that fills as the devices finish, the device being read written beside it. It
 * stays until the run is over (full line), and - tapped - shows what the run did: failed (and why),
 * not finished, done; each device can be shown or tried again.
 */
export function SyncRunLine({
  run,
  now,
  onRetry,
  onShowDevice,
  onDismiss,
}: {
  run: SyncRun;
  now: number;
  onRetry: (ids: string[]) => void;
  onShowDevice: (id: string) => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const over = isRunOver(run, now);
  const fill = runFill(run, now);
  const counts = runCounts(run);
  const tone = over && counts.failed > 0 ? " has-failed" : "";

  return (
    <>
      <button
        type="button"
        className={`sync-line${over ? " is-over" : " is-live"}${tone}`}
        style={{ ["--fill" as string]: `${Math.round(fill * 100)}%` }}
        onClick={() => setOpen(true)}
        aria-label={`${run.label}: ${runCaption(run, now)} - اضغط للتفاصيل`}
      >
        <span className="sync-line-track" aria-hidden="true">
          <span className="sync-line-fill" />
        </span>
        <span className="sync-line-tag">
          <span className="sync-line-dot" aria-hidden="true" />
          <span className="sync-line-text">{runCaption(run, now)}</span>
        </span>
      </button>
      {open && (
        <SyncRunSheet
          run={run}
          over={over}
          onClose={() => setOpen(false)}
          onRetry={(ids) => {
            setOpen(false);
            onRetry(ids);
          }}
          onShowDevice={(id) => {
            setOpen(false);
            onShowDevice(id);
          }}
          onDismiss={() => {
            setOpen(false);
            onDismiss();
          }}
        />
      )}
    </>
  );
}

const SECTIONS: { title: string; states: RunRow["state"][] }[] = [
  { title: "❌ فشلت", states: ["failed"] },
  { title: "⏳ لم تنتهِ", states: ["current", "pending"] },
  { title: "⚠️ بلا بيانات", states: ["nothing"] },
  { title: "✅ اكتملت", states: ["ok"] },
];

function SyncRunSheet({
  run,
  over,
  onClose,
  onRetry,
  onShowDevice,
  onDismiss,
}: {
  run: SyncRun;
  over: boolean;
  onClose: () => void;
  onRetry: (ids: string[]) => void;
  onShowDevice: (id: string) => void;
  onDismiss: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const rows = runRows(run);
  const counts = runCounts(run);
  const again = retryIds(run);

  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet sync-run-sheet" role="dialog" aria-modal="true" aria-label={`تفاصيل ${run.label}`} onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>
            {run.mode === "background" ? "🌙" : "🔄"} {run.label || "المزامنة"} · {over ? "انتهت" : "تعمل الآن"}
          </strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <div className="sync-run-chips">
          <span className="sync-run-chip is-ok">✅ <bdi dir="ltr">{counts.ok}</bdi></span>
          <span className="sync-run-chip is-pending">⏳ <bdi dir="ltr">{counts.pending}</bdi></span>
          <span className="sync-run-chip is-nothing">⚠️ <bdi dir="ltr">{counts.nothing}</bdi></span>
          <span className="sync-run-chip is-failed">❌ <bdi dir="ltr">{counts.failed}</bdi></span>
        </div>
        <div className="sync-run-list">
          {SECTIONS.map((section) => {
            const list = rows.filter((r) => section.states.includes(r.state));
            if (list.length === 0) return null;
            return (
              <section key={section.title}>
                <h3 className="sync-run-title">
                  {section.title} · <bdi dir="ltr">{list.length}</bdi>
                </h3>
                {list.map((row) => (
                  <div key={row.id} className={`sync-run-row is-${row.state}${picked === row.id ? " is-open" : ""}`}>
                    <button type="button" className="sync-run-row-head" onClick={() => setPicked(picked === row.id ? null : row.id)}>
                      <span className="sync-run-name" dir="auto">{row.name}</span>
                      <small>{row.status}</small>
                    </button>
                    {picked === row.id && (
                      <div className="sync-run-row-body">
                        {row.problem && <p>{row.problem}</p>}
                        {row.trace && (
                          <p className="sync-run-trace">
                            🧭 ما قُرئ: <bdi>{row.trace}</bdi>
                            <br />
                            <small>✓ قُرئت كاملة · ⚪ قُرئت ناقصة · ✗ لم يُقرأ شيء</small>
                          </p>
                        )}
                        <div className="sync-run-row-actions">
                          <button type="button" className="dialog-secondary" onClick={() => onShowDevice(row.id)}>
                            📍 إظهار الجهاز
                          </button>
                          {row.state !== "current" && (over || row.state !== "pending") && (
                            <button type="button" className="dialog-primary" onClick={() => onRetry([row.id])}>
                              🔄 إعادة
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
        <div className="dialog-actions">
          {over && again.length > 0 && (
            <button type="button" className="dialog-primary" onClick={() => onRetry(again)}>
              🔁 إعادة غير المكتملة (<bdi dir="ltr">{again.length}</bdi>)
            </button>
          )}
          {over && (
            <button type="button" className="dialog-secondary" onClick={onDismiss}>
              إخفاء الخط
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
