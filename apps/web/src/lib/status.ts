import { DeviceStatus } from "@starnet/shared";

export interface StatusPresentation {
  className: string;
  label: string;
}

/**
 * Color semantics (fixed by product spec, do not change casually):
 * green = normal, yellow/orange = warning, red = offline/major issue,
 * gray = no recent telemetry.
 */
export function presentStatus(status: DeviceStatus): StatusPresentation {
  switch (status) {
    case DeviceStatus.GREEN:
      return { className: "dot-green", label: "طبيعي" };
    case DeviceStatus.YELLOW:
      return { className: "dot-yellow", label: "تنبيه" };
    case DeviceStatus.RED:
      return { className: "dot-red", label: "غير متصل" };
    case DeviceStatus.GRAY:
    case DeviceStatus.UNKNOWN:
    default:
      return { className: "dot-gray", label: "لا توجد بيانات حديثة" };
  }
}

/** Zero balance is a good thing here - it must render green, not neutral/red. */
export function isBalanceDueZero(balanceDue: string): boolean {
  if (!balanceDue.trim()) return false;
  const numeric = Number(balanceDue.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) && numeric === 0;
}

export interface BadgePresentation {
  className: string;
  label: string;
}

/** Stage-1 Starlink-sync service status (see StarlinkAccountSummary.serviceStatus) - undefined
 * means no account has ever synced this field, which must render as "nothing to show", never a
 * guessed default. */
export function presentServiceStatus(status: string | undefined): BadgePresentation | null {
  switch (status) {
    case "active":
      return { className: "badge-green", label: "نشط" };
    case "standby":
      return { className: "badge-yellow", label: "بانتظار التفعيل" };
    case "suspended":
      return { className: "badge-red", label: "موقوف" };
    case "canceled":
      return { className: "badge-gray", label: "ملغى" };
    default:
      return null;
  }
}
