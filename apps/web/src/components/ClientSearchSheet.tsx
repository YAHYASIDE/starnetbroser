"use client";

/**
 * 👤 A customer tapped in the home search (his Oct 18 2026 ask): show his devices, only the
 * expired ones, or update them - in their browsers one by one, or in the background - or open his
 * file as before.
 */
export function ClientSearchSheet({
  name,
  deviceCount,
  expiredCount,
  syncCount,
  onShowDevices,
  onShowExpired,
  onSync,
  onSyncBackground,
  onOpenFile,
  onClose,
}: {
  name: string;
  deviceCount: number;
  expiredCount: number;
  /** His devices a run may open (a faulty one / a limited email only by their own choice). */
  syncCount: number;
  onShowDevices: () => void;
  onShowExpired: () => void;
  onSync: () => void;
  onSyncBackground: () => void;
  onOpenFile: () => void;
  onClose: () => void;
}) {
  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet" role="dialog" aria-modal="true" aria-label={name} onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>
            👤 {name} · <bdi dir="ltr">{deviceCount}</bdi> جهاز
          </strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <div className="card-more-list">
          <button type="button" className="card-more-item" disabled={deviceCount === 0} onClick={onShowDevices}>
            <span aria-hidden="true">📋</span> عرض أجهزته <small><bdi dir="ltr">{deviceCount}</bdi></small>
          </button>
          <button type="button" className="card-more-item" disabled={expiredCount === 0} onClick={onShowExpired}>
            <span aria-hidden="true">⛔</span> المنتهية فقط <small><bdi dir="ltr">{expiredCount}</bdi></small>
          </button>
          <button type="button" className="card-more-item" disabled={syncCount === 0} onClick={onSync}>
            <span aria-hidden="true">🔄</span> تحديث أجهزته واحدًا واحدًا <small>تُفتح أمامك</small>
          </button>
          <button type="button" className="card-more-item" disabled={syncCount === 0} onClick={onSyncBackground}>
            <span aria-hidden="true">🌙</span> تحديث أجهزته في الخلفية <small>دون فتح الصفحات</small>
          </button>
          <button type="button" className="card-more-item" onClick={onOpenFile}>
            <span aria-hidden="true">🗂️</span> ملف الزبون <small>الكشف والدفعات</small>
          </button>
        </div>
        {syncCount < deviceCount && (
          <p className="sync-choice-hint">المعطّلة والإيميل غير الرئيسي لا تُحدَّث هنا - كلٌّ من بطاقته.</p>
        )}
      </div>
    </div>
  );
}
