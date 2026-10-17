/**
 * ⏰ «مزامنات مجدولة» (his Oct 17 2026 choices, settings → 🔄 المزامنة التلقائية):
 *  - 🌅 every morning at 8:00 the devices renewing today and tomorrow are synced by themselves;
 *  - 💳 in the same run, yesterday's renewals: was the payment taken, or did the device stop?
 *  - 🔁 after Starlink's 429, the devices left are synced by themselves once the 20 minutes are over;
 *  - 🌙 a separate bot message at night: what synced today and what didn't;
 *  - 📤 a rep's copy goes out by itself 10 minutes after the last change (repCopyAuto.ts).
 * The phone runs the first four (ScheduledSyncWorker) - this module keeps his choices (a `starnet.`
 * setting: not in the backup) and hands them to it.
 */

import { LocalBrowser } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "./localBrowser";

export interface ScheduledSyncs {
  morning: boolean;
  morningHour: number;
  payment: boolean;
  retry: boolean;
  night: boolean;
  nightHour: number;
  repCopy: boolean;
}

/** All on: he chose every one of them. */
export const DEFAULT_SCHEDULED_SYNCS: ScheduledSyncs = {
  morning: true,
  morningHour: 8,
  payment: true,
  retry: true,
  night: true,
  nightHour: 23,
  repCopy: true,
};

const KEY = "starnet.scheduledSyncs";

const hourOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
const boolOr = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Whatever is stored, read safely (a missing or broken value = the defaults). */
export function parseScheduledSyncs(raw: string | null): ScheduledSyncs {
  let stored: Partial<Record<keyof ScheduledSyncs, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") stored = parsed as typeof stored;
  } catch {
    // defaults
  }
  const d = DEFAULT_SCHEDULED_SYNCS;
  return {
    morning: boolOr(stored.morning, d.morning),
    morningHour: hourOr(stored.morningHour, d.morningHour),
    payment: boolOr(stored.payment, d.payment),
    retry: boolOr(stored.retry, d.retry),
    night: boolOr(stored.night, d.night),
    nightHour: hourOr(stored.nightHour, d.nightHour),
    repCopy: boolOr(stored.repCopy, d.repCopy),
  };
}

export function loadScheduledSyncs(): ScheduledSyncs {
  try {
    return parseScheduledSyncs(window.localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SCHEDULED_SYNCS };
  }
}

export function saveScheduledSyncs(value: ScheduledSyncs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // storage unavailable - the phone keeps the last pushed choice
  }
  void pushScheduledSyncs(value);
}

/** Hands his choices to the phone (on every change and each app start). */
export async function pushScheduledSyncs(value: ScheduledSyncs = loadScheduledSyncs()): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    // 📤 repCopy is the app's own (repCopyAuto.ts) - the phone doesn't need it.
    const { morning, morningHour, payment, retry, night, nightHour } = value;
    await LocalBrowser.setScheduledSyncs({ morning, morningHour, payment, retry, night, nightHour });
  } catch {
    // tried again on the next app start
  }
}

/** 🔁 The visible chain stopped on a 429: the rest syncs by itself later. Minutes until it does,
 * 0 when it doesn't (off, web, or its retries used up). */
export async function scheduleSyncRetry(accounts: { id: string; name: string }[], label: string, travelCheck = false): Promise<number> {
  if (!isRunningInAndroidApp() || accounts.length === 0 || !loadScheduledSyncs().retry) return 0;
  try {
    const { minutes } = await LocalBrowser.scheduleSyncRetry({
      accounts: accounts.map((a) => ({ accountId: a.id, accountName: a.name || "" })),
      label,
      ...(travelCheck ? { travelCheck: true } : {}),
    });
    return minutes;
  } catch {
    return 0;
  }
}

/** «8:00 صباحًا» / «11:00 ليلًا» for the settings' hour pickers. */
export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const part = hour < 5 ? "ليلًا" : hour < 12 ? "صباحًا" : hour < 17 ? "ظهرًا" : hour < 21 ? "مساءً" : "ليلًا";
  return `${h12}:00 ${part}`;
}
