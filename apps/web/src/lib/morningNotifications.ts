"use client";

import { LocalNotifications } from "@capacitor/local-notifications";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { isRunningInAndroidApp } from "./localBrowser";
import { buildMorningDigests, DIGEST_DAYS, DIGEST_ID_BASE } from "./morningDigest";

const ENABLED_KEY = "starnet.morningDigestOff";
const HOUR_KEY = "starnet.morningDigestHour";
export const DEFAULT_DIGEST_HOUR = 8;
/** Extra payload on each digest notification - where tapping it should land. */
export const DIGEST_ROUTE = "/reminders";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable - the default (on, 8:00) applies.
  }
}

/** On by default - an explicit opt-out from الإعدادات. */
export function isMorningDigestEnabled(): boolean {
  return safeGet(ENABLED_KEY) !== "1";
}

export function setMorningDigestEnabled(enabled: boolean) {
  safeSet(ENABLED_KEY, enabled ? null : "1");
}

export function getMorningDigestHour(): number {
  const hour = Number(safeGet(HOUR_KEY));
  return Number.isInteger(hour) && hour >= 5 && hour <= 12 ? hour : DEFAULT_DIGEST_HOUR;
}

export function setMorningDigestHour(hour: number) {
  safeSet(HOUR_KEY, String(hour));
}

/** Replaces the scheduled morning notifications with fresh ones (Android app only). Asks for the
 * notification permission once; silently does nothing when it's refused. */
export async function rescheduleMorningDigests(
  accounts: StarlinkAccountSummary[],
  owedByCurrency: Record<string, number>,
): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    const ids = Array.from({ length: DIGEST_DAYS }, (_, i) => ({ id: DIGEST_ID_BASE + i }));
    await LocalNotifications.cancel({ notifications: ids });
    if (!isMorningDigestEnabled()) return;
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== "granted") return;
    const digests = buildMorningDigests({ accounts, owedByCurrency, now: new Date(), hour: getMorningDigestHour() });
    if (digests.length === 0) return;
    await LocalNotifications.schedule({
      notifications: digests.map((d) => ({
        id: d.id,
        title: d.title,
        body: d.body,
        largeBody: d.body,
        schedule: { at: d.at, allowWhileIdle: true },
        extra: { route: DIGEST_ROUTE },
      })),
    });
  } catch {
    // A notification problem must never break the app itself.
  }
}

/** Tapping a digest notification opens the reminders page. Returns an unsubscribe function. */
export function onDigestTapped(open: (route: string) => void): () => void {
  if (!isRunningInAndroidApp()) return () => {};
  const handle = LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    const route = (action.notification.extra as { route?: string } | undefined)?.route;
    if (route) open(route);
  });
  return () => {
    void handle.then((h) => h.remove());
  };
}

const D_ALERTED_KEY = "starnet.dAlertedEntries";
const D_ALERT_ID_BASE = 7300;

/** Devices Starlink suspended while their D is still open: one phone notification per open D
 * (never repeated for the same one), tapping it opens "ستارلينك والبطاقة" to pay. */
export async function notifySuspendedWithDebt(items: { accountName: string; entryIds: string[]; costUsd: number }[]): Promise<void> {
  if (!isRunningInAndroidApp() || items.length === 0) return;
  let alerted: string[] = [];
  try {
    alerted = JSON.parse(safeGet(D_ALERTED_KEY) ?? "[]") as string[];
  } catch {
    alerted = [];
  }
  const fresh = items.filter((item) => item.entryIds.some((id) => !alerted.includes(id)));
  if (fresh.length === 0) return;
  try {
    let permission = await LocalNotifications.checkPermissions();
    if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: fresh.map((item, i) => ({
        id: D_ALERT_ID_BASE + ((Date.now() / 1000 + i) % 500 | 0),
        title: `⚠️ ${item.accountName} توقف وعليه D`,
        body: `ادفع لستارلينك ${item.costUsd.toFixed(2)} $ ثم اضغط «سدّدت» - الربح وحصة المندوب تنزل يوم الدفع`,
        extra: { route: "/starlink" },
      })),
    });
    const next = Array.from(new Set([...alerted, ...fresh.flatMap((f) => f.entryIds)])).slice(-500);
    safeSet(D_ALERTED_KEY, JSON.stringify(next));
  } catch {
    // A notification problem must never break the app itself.
  }
}
