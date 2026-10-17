"use client";

import type { ReactNode } from "react";

/**
 * 🔍 Long press on a home circle (his Oct 17 2026 ask «كل الأزرار فيها الفحص… عند الضغط المطول:
 * 1 فحص، 2 فحص في الخلفية»): check that circle's devices - in their browsers one by one, or in the
 * background - and a report about that circle's own question (lib/deviceRings.ts).
 */
export function RingActionsSheet({
  title,
  count,
  question,
  onCheck,
  onBackground,
  onClose,
  children,
}: {
  title: string;
  count: number;
  /** «هل الجهاز ملغي؟» - what the check answers. */
  question: string;
  onCheck: () => void;
  onBackground: () => void;
  onClose: () => void;
  /** Extra actions of this circle (🔗 دمج كل المكرر…). */
  children?: ReactNode;
}) {
  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>
            {title} · <bdi dir="ltr">{count}</bdi> جهاز
          </strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <p className="sync-choice-hint">🔍 {question}</p>
        <div className="card-more-list">
          <button type="button" className="card-more-item" disabled={count === 0} onClick={onCheck}>
            <span aria-hidden="true">🔍</span> فحص <small>جهاز بعد جهاز أمامك</small>
          </button>
          <button type="button" className="card-more-item" disabled={count === 0} onClick={onBackground}>
            <span aria-hidden="true">🌙</span> فحص في الخلفية <small>دون فتح الصفحات</small>
          </button>
          {children}
        </div>
        <p className="sync-choice-hint">في آخر الفحص يصلك تقرير هذه الأيقونة: من هو فعلًا، من تغيّر، ومن لم يُفحص.</p>
      </div>
    </div>
  );
}
