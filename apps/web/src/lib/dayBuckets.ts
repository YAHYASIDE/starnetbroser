/**
 * 📅 «التجديد حسب اليوم» (his Oct 2026 request): Starlink renews on day 1-28 only, so the calendar
 * shows 1-28 and, in place of 29-31, four lists: ❓ unknown date (no date, or a 29-31 misread),
 * ⏳ never synced, 👤 faulty «إيميل غير رئيسي», 🔥 faulty «محروق». A device may be in a day AND in a
 * fault list. Pure.
 */

import { expiryDay, type StarlinkAccountSummary } from "@starnet/shared";
import { faultCategory } from "./deviceFault";

export type SpecialBucket = "unknown" | "unsynced" | "secondary" | "burned";
export type DayKey = number | SpecialBucket;

export const SPECIAL_BUCKETS: { key: SpecialBucket; icon: string; label: string }[] = [
  { key: "unknown", icon: "❓", label: "غير معروف التاريخ" },
  { key: "unsynced", icon: "⏳", label: "لم تُحدَّث بعد" },
  { key: "secondary", icon: "👤", label: "معطّل: إيميل غير رئيسي" },
  { key: "burned", icon: "🔥", label: "معطّل: محروق" },
];

type BucketInput = Pick<StarlinkAccountSummary, "rechargeDate" | "standbyDate" | "lastSuccessfulScanAt" | "deviceFault" | "noSubscription" | "serviceStatus" | "limitedAccess">;

/** Every calendar place the device belongs to. */
export function deviceDayKeys(account: BucketInput): DayKey[] {
  const keys: DayKey[] = [];
  const day = expiryDay(account.rechargeDate || account.standbyDate);
  if (day && day >= 1 && day <= 28) keys.push(day);
  else if (account.lastSuccessfulScanAt) keys.push("unknown");
  if (!account.lastSuccessfulScanAt) keys.push("unsynced");
  const fault = faultCategory(account);
  if (fault === "secondary") keys.push("secondary");
  if (fault === "burned") keys.push("burned");
  return keys;
}

export function countDayKeys(accounts: BucketInput[]): Map<DayKey, number> {
  const counts = new Map<DayKey, number>();
  for (const account of accounts) for (const key of deviceDayKeys(account)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}
