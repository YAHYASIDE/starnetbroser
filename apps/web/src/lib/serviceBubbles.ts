/**
 * 🫧 The card's two service bubbles (his Oct 17 2026 explanation, screenshot by screenshot): the
 * service the device is on NOW, and the one that runs AFTER this month ends - each one of
 * ROM (تجوال غير محدود) / 100G (Roam 100GB) / SIS (وضع الاستعداد) / STOP. Replaces «✅ نشط».
 *
 *   Roam - Unlimited + Active                → ROM  → ROM
 *   Roam - Unlimited + Standby Mode Pending  → ROM  → SIS (date)
 *   Roam - Unlimited + Ending / scheduled to end → ROM → STOP (date)
 *   Roam - 100GB: the same with 100G
 *   Standby Mode + Standby Mode              → SIS  → SIS
 *   Standby Mode + Ending                    → SIS  → STOP (date)
 *   Inactive (after the end)                 → STOP → STOP
 *   suspended for billing                    → his plan (the red «موقوف» stays beside it)
 * A SIS device never goes back to ROM or 100G. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { cleanPlanName, effectiveServiceStatus, planBadgeLabel } from "./status";

export type ServiceKind = "ROM" | "100G" | "SIS" | "STOP";

export interface ServiceBubbles {
  now: ServiceKind;
  next: ServiceKind;
  /** When `next` starts, "YYYY/MM/DD" - only when it differs from `now`. */
  nextDate?: string;
}

type Device = Partial<Pick<StarlinkAccountSummary, "planName" | "serviceStatus" | "noSubscription" | "pendingCancellationDate" | "pendingStandbyDate">>;

/** "2026/10/28" or "2026-10-28" → "2026-10-28" (comparable as text); undefined if unreadable. */
function dayKey(date: string | undefined): string | undefined {
  const m = date?.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
}

/** The plan as one of the services, from Starlink's plan name. */
function planKind(planName: string | undefined): ServiceKind | undefined {
  const label = planBadgeLabel(cleanPlanName(planName));
  return label === "ROM" || label === "100G" || label === "SIS" ? label : undefined;
}

/**
 * Both bubbles, or null when the plan is none of the four (a Residential plan, never read yet).
 * `today` is "YYYY-MM-DD": a change whose date has come is already the service now (until the
 * next sync reads the page again).
 */
export function serviceBubbles(device: Device, today: string): ServiceBubbles | null {
  const plan = planKind(device.planName);
  const endDay = dayKey(device.pendingCancellationDate);
  const standbyDay = dayKey(device.pendingStandbyDate);
  const ended = effectiveServiceStatus(device) === "canceled" || Boolean(endDay && endDay <= today);
  if (ended) return { now: "STOP", next: "STOP" };
  if (!plan) return null;
  // The standby switch has come: SIS now.
  const now: ServiceKind = plan !== "SIS" && standbyDay && standbyDay <= today ? "SIS" : plan;
  if (endDay) return { now, next: "STOP", nextDate: device.pendingCancellationDate };
  if (now !== "SIS" && standbyDay) return { now, next: "SIS", nextDate: device.pendingStandbyDate };
  return { now, next: now };
}

/** «→ SIS» / «→ STOP» circles: what changes after this month. */
export function changesTo(device: Device, today: string, kind: "SIS" | "STOP"): boolean {
  const bubbles = serviceBubbles(device, today);
  return Boolean(bubbles && bubbles.next === kind && bubbles.now !== kind);
}

export const SERVICE_LABELS: Record<ServiceKind, string> = {
  ROM: "تجوال غير محدود",
  "100G": "تجوال 100 غيغا",
  SIS: "وضع الاستعداد (إنترنت ضعيف)",
  STOP: "متوقف",
};
