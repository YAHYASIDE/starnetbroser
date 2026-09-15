/** Signed day count from today to the given date string, or null if unparseable. */
export function daysRemainingNumber(dateStr: string): number | null {
  if (!dateStr.trim()) return null;
  const parsed = new Date(dateStr.replace(/\//g, "-"));
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
}

/** Best-effort "days remaining" label for a recharge/standby date string. */
export function daysRemainingLabel(dateStr: string): string | null {
  const diffDays = daysRemainingNumber(dateStr);
  if (diffDays === null) return null;
  if (diffDays === 0) return "ينتهي اليوم";
  if (diffDays === 1) return "يوم واحد متبقٍ";
  if (diffDays > 1) return `${diffDays} يومًا متبقٍ`;
  if (diffDays === -1) return "منتهٍ منذ يوم";
  return `منتهٍ منذ ${Math.abs(diffDays)} يومًا`;
}
