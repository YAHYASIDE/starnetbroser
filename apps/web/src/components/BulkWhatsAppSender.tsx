"use client";

import { useState } from "react";

export interface BulkMessageTarget {
  id: string;
  name: string;
  /** Prebuilt wa.me link (buildWhatsAppLink) - targets without a phone are simply not passed in. */
  link: string;
}

/**
 * إرسال جماعي: WhatsApp never lets an app send on its own, so this walks the operator through the
 * list one customer at a time - one tap opens WhatsApp with the message ready, and coming back
 * moves to the next. Sent/skipped state lives only in memory for this visit.
 */
export function BulkWhatsAppSender({ targets, label }: { targets: BulkMessageTarget[]; label: string }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<Set<string>>(new Set());

  if (targets.length < 2) return null;

  if (!active) {
    return (
      <button type="button" className="bulk-send-start" onClick={() => { setActive(true); setIndex(0); }}>
        📤 {label} ({targets.length})
      </button>
    );
  }

  const done = index >= targets.length;
  const current = targets[index];

  function openCurrent() {
    if (!current) return;
    window.open(current.link, "_blank", "noopener,noreferrer");
    setSent((s) => new Set(s).add(current.id));
    setIndex((i) => i + 1);
  }

  return (
    <div className="bulk-send" role="region" aria-label={label}>
      <div className="bulk-send-progress">
        <span>
          {done ? "انتهى الإرسال ✓" : `${index + 1} / ${targets.length}`} · أُرسل {sent.size}
        </span>
        <button type="button" className="text-action" onClick={() => setActive(false)}>
          إغلاق
        </button>
      </div>
      <div className="bulk-send-bar">
        <span style={{ width: `${(Math.min(index, targets.length) / targets.length) * 100}%` }} />
      </div>
      {!done && current && (
        <>
          <strong className="bulk-send-name">{current.name}</strong>
          <div className="bulk-send-actions">
            <button type="button" className="dialog-primary" onClick={openCurrent}>
              💬 فتح واتساب والتالي
            </button>
            <button type="button" className="text-action" onClick={() => setIndex((i) => i + 1)}>
              تخطي
            </button>
          </div>
        </>
      )}
    </div>
  );
}
