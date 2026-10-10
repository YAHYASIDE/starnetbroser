"use client";

import { WHATS_NEW, WHATS_NEW_EVENT } from "@/lib/whatsNew";

/** Settings → «🆕 ما الجديد»: every update's tour, newest first, replayable (WhatsNewTour plays it). */
export function WhatsNewSection() {
  return (
    <section className="section">
      <p className="settings-hint">بعد كل تحديث تظهر جولة تنقلك إلى ما تغيّر وتشرح «كان كذا وصار كذا». شاهد أي واحدة منها مرة أخرى:</p>
      <ul className="whats-new-list">
        {WHATS_NEW.map((r) => (
          <li key={r.id} className="whats-new-row">
            <span>
              <strong>{r.title}</strong>
              <small>
                <bdi dir="ltr">{r.date}</bdi> · {r.steps.length} خطوات
              </small>
            </span>
            <button
              type="button"
              className="dialog-secondary"
              onClick={() => window.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT, { detail: { releaseId: r.id } }))}
            >
              ▶️ شاهد
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
