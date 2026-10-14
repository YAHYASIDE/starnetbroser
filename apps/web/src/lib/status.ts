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

/** The plan name, or undefined when it is empty or was mis-read as the service address
 * ("... Kyiv Oblast 08720, UA" - a plan name never has commas). */
export function cleanPlanName(planName: string | undefined): string | undefined {
  const trimmed = planName?.trim();
  return trimmed && !/[,،]/.test(trimmed) ? trimmed : undefined;
}

/** Starlink's paid "وضع الاستعداد" / Standby Mode plan, sold as SIS - an active plan, not a
 * paused service (mirrors isStandbyModePlan in the Starlink extraction). */
export function isSisPlan(planName: string | undefined): boolean {
  const text = (planName ?? "").replace(/[\u064B-\u0652]/g, "");
  return /وضع الاستعداد|standby mode/i.test(text) && !/قيد التعليق|pending/i.test(text);
}

/** The status to show: a device on the SIS plan is active even when Starlink's badge says
 * "وضع الاستعداد" (devices synced before SIS was recognized still carry "standby"). */
export function effectiveServiceStatus(account: { serviceStatus?: string; planName?: string; noSubscription?: boolean }): string | undefined {
  // "لا توجد اشتراكات" wins over a Home page that still reads "active".
  if (account.noSubscription) return "canceled";
  return account.serviceStatus === "standby" && isSisPlan(account.planName) ? "active" : account.serviceStatus;
}

/** Short pill label for a roaming data plan, shown at the top of the account card instead of the
 * full plan name - "100G" for a numbered data allowance ("التجوال - 100 غيغابايت"/"Roaming
 * 100GB"), "ROM" for unlimited roaming ("تجوال غير محدود"). Undefined for anything that isn't a
 * recognized roaming plan (Residential, Business, ...) or has no plan name at all - the caller
 * falls back to showing the full plan name as-is rather than hiding it. */
export function planBadgeLabel(planName: string | undefined): string | undefined {
  if (!planName) return undefined;
  if (isSisPlan(planName)) return "SIS";
  if (/تجوال|roaming/i.test(planName) && /غير محدود|unlimited/i.test(planName)) return "ROM";
  const dataAmount = planName.match(/(\d+)\s*(غيغابايت|جيجابايت|جيجا|gb)/i);
  return dataAmount ? `${dataAmount[1]}G` : undefined;
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
