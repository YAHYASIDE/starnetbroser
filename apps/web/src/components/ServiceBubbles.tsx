"use client";

import { SERVICE_LABELS, type ServiceBubbles as Bubbles, type ServiceKind } from "@/lib/serviceBubbles";

const CLASS: Record<ServiceKind, string> = { ROM: "svc-rom", "100G": "svc-100g", SIS: "svc-sis", STOP: "svc-stop" };

/** 🫧 [الخدمة الآن] ← [بعد انتهاء الشهر] (lib/serviceBubbles.ts). */
export function ServiceBubbles({ bubbles }: { bubbles: Bubbles }) {
  return (
    <span
      className="svc-bubbles"
      data-tour="service-bubbles"
      title={`الآن: ${SERVICE_LABELS[bubbles.now]}${bubbles.billing ? " - موقوف بسبب الفاتورة" : ""} · بعد انتهاء الشهر: ${SERVICE_LABELS[bubbles.next]}${bubbles.nextDate ? ` (${bubbles.nextDate})` : ""}`}
    >
      <span className={`svc-bubble ${bubbles.billing ? "svc-billing" : CLASS[bubbles.now]}`}>
        {bubbles.billing ? `${bubbles.now} - FACTUR` : bubbles.now}
      </span>
      <span className="svc-arrow" aria-hidden="true">←</span>
      {/* Faded when nothing changes after the month (his Oct 17 2026 choice). */}
      <span className={`svc-bubble ${CLASS[bubbles.next]}${bubbles.next === bubbles.now && !bubbles.nextDate ? " svc-same" : ""}`}>
        {bubbles.next}
        {bubbles.nextDate && <bdi dir="ltr" className="svc-date">{bubbles.nextDate.slice(5)}</bdi>}
      </span>
    </span>
  );
}
