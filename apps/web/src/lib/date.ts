/** Signed day count from today to the given date string, or null if unparseable. The renewal date
 * is the *stop instant* (the device goes off at that date's midnight), so 0 already means "stopped
 * today" and callers treat <= 0 as expired - see daysRemainingLabel. */
export function daysRemainingNumber(dateStr: string): number | null {
  if (!dateStr.trim()) return null;
  const parsed = new Date(dateStr.replace(/\//g, "-"));
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
}

/** Shown instead of a renewal date that hasn't been read from Starlink yet (a new device starts
 * with an empty date - never a made-up placeholder that looks like a real one). */
export const RENEWAL_DATE_UNREAD = "لم يُقرأ بعد";

/** The renewal date to display, or «لم يُقرأ بعد» when it's empty. */
export function renewalDateLabel(dateStr: string | null | undefined): string {
  return dateStr?.trim() || RENEWAL_DATE_UNREAD;
}

/** Best-effort "days remaining" label for a recharge/standby date string. The renewal date is the
 * moment the device stops (that date's midnight): so a date of today means it has already stopped
 * («منتهٍ»); tomorrow means tonight is its last night («ينتهي الليلة»); and the day before that
 * still has one whole day left. */
export function daysRemainingLabel(dateStr: string): string | null {
  const diffDays = daysRemainingNumber(dateStr);
  if (diffDays === null) return null;
  if (diffDays === 0) return "منتهٍ";
  if (diffDays === -1) return "منتهٍ منذ يوم";
  if (diffDays < 0) return `منتهٍ منذ ${Math.abs(diffDays)} يومًا`;
  if (diffDays === 1) return "ينتهي الليلة";
  if (diffDays === 2) return "يوم واحد متبقٍ";
  return `${diffDays - 1} يومًا متبقٍ`;
}

/** Best-effort relative-time label for an ISO timestamp (e.g. lastSuccessfulScanAt) - null for a
 * missing/unparseable value, so callers can tell "never synced" from "synced a while ago". */
export function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  const diffMs = Date.now() - then.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "الآن";
  if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `منذ ${diffDays} يوم`;

  return then.toLocaleDateString("ar-u-nu-latn", { day: "numeric", month: "short" });
}
