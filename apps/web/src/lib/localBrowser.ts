"use client";

import { Capacitor, PluginListenerHandle } from "@capacitor/core";
import {
  AccountDataSyncedEvent,
  LocalBrowser,
  PendingAccountSync,
  STARLINK_ACCOUNT_HOME_URL,
} from "@starnet/local-browser-plugin";

/**
 * Isolated per-account browsing only exists as a real native WebView
 * profile inside the STAR NET Android app (see packages/local-browser-
 * plugin). GitHub Pages and any other plain-browser build of this same
 * code have no way to give two accounts separate cookie jars, so this
 * module must never resolve as if it opened one there - every non-Android
 * path returns a clear reason instead.
 */
export const ANDROID_ONLY_MESSAGE = "هذه الميزة متاحة فقط داخل تطبيق STAR NET لنظام Android.";
export const UNSUPPORTED_DEVICE_MESSAGE = "هذا الجهاز لا يدعم المتصفحات المستقلة";

export type OpenResult = { ok: true } | { ok: false; message: string };

export function isRunningInAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function openIsolatedAccountBrowser(accountId: string, accountName: string): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) {
    return { ok: false, message: ANDROID_ONLY_MESSAGE };
  }

  try {
    const { supported } = await LocalBrowser.isSupported();
    if (!supported) {
      return { ok: false, message: UNSUPPORTED_DEVICE_MESSAGE };
    }
    await LocalBrowser.openAccountBrowser({ accountId, accountName, url: STARLINK_ACCOUNT_HOME_URL });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر فتح المتصفح المحلي" };
  }
}

/** Only call after the user separately confirms deleting the local session - never automatic. */
export async function deleteIsolatedAccountSession(accountId: string): Promise<boolean> {
  if (!isRunningInAndroidApp()) return false;
  try {
    const { deleted } = await LocalBrowser.deleteAccountSession({ accountId });
    return deleted;
  } catch {
    return false;
  }
}

/**
 * Fires after a "تحديث من Starlink" tap that found something on an allow-listed Starlink page.
 * Never fires on web (no isolated browser exists there to sync from). Callers must remove the
 * returned handle on unmount.
 */
export function onAccountDataSynced(
  handler: (event: AccountDataSyncedEvent) => void,
): Promise<PluginListenerHandle> {
  return LocalBrowser.addListener("accountDataSynced", handler);
}

/**
 * Every "تحديث من Starlink" result not yet acknowledged, oldest first. Always empty on web/when
 * not running in the Android app. Callers must drain this on app open and on every resume - the
 * live accountDataSynced event alone is not enough, since it is silently dropped whenever the
 * app's Bridge/WebView wasn't attached and resumed at the moment AccountBrowserActivity fired it.
 */
export async function listPendingAccountSyncs(): Promise<PendingAccountSync[]> {
  if (!isRunningInAndroidApp()) return [];
  try {
    const { syncs } = await LocalBrowser.listPendingAccountSyncs();
    return syncs;
  } catch {
    return [];
  }
}

/**
 * Only call after the corresponding result has actually been merged into the account and saved -
 * acking first and failing to save after would lose it permanently. A failed ack call here is
 * harmless: the record simply stays pending and is safely re-delivered (and re-acked) next time.
 */
export async function ackPendingAccountSyncs(syncIds: string[]): Promise<void> {
  if (!isRunningInAndroidApp() || syncIds.length === 0) return;
  try {
    await LocalBrowser.ackPendingAccountSyncs({ syncIds });
  } catch {
    // best-effort - see doc comment above.
  }
}
