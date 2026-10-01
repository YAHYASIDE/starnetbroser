"use client";

import { Capacitor, PluginListenerHandle } from "@capacitor/core";
import {
  AccountDataSyncedEvent,
  LocalBrowser,
  PendingAccountSync,
  STARLINK_ACCOUNT_HOME_URL,
  SessionStatus,
} from "@starnet/local-browser-plugin";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { SessionsByAccount } from "./accountBackup";
import { markInternalLeave } from "./appLock";

export interface AutoSyncAccountRef {
  id: string;
  name: string;
  /** See autoSyncList.ts - omitted for a device that must not be synced automatically. */
  renewalDate?: string;
  serviceStatus?: string;
  representativeId?: string;
}

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

/** What the Starlink login form is filled with: the device's main email, and as the password its
 * "كود الواي فاي" (the operator uses it as the Starlink password), else the email's own code. */
export function starlinkLoginFor(
  account: Pick<StarlinkAccountSummary, "expectedEmail" | "wifiPassword" | "expectedEmailPassword" | "starlinkPassword">,
): StarlinkLogin {
  const loginEmail = account.expectedEmail?.trim() || undefined;
  // The Starlink password itself first (the one that last worked), then the codes as before.
  const loginPassword = account.starlinkPassword?.trim() || account.wifiPassword?.trim() || account.expectedEmailPassword?.trim() || undefined;
  return { ...(loginEmail ? { loginEmail } : {}), ...(loginPassword ? { loginPassword } : {}) };
}

export interface StarlinkLogin {
  loginEmail?: string;
  loginPassword?: string;
  /** The email's own password - for «📧 البريد» inside the Starlink browser. */
  mailPassword?: string;
}

export interface MailLogin {
  email?: string;
  password?: string;
}

/** 📧 البريد: the device's main email and that email's own password ("كود الإيميل"). */
export function mailLoginFor(account: Pick<StarlinkAccountSummary, "expectedEmail" | "expectedEmailPassword">): MailLogin {
  const email = account.expectedEmail?.trim() || undefined;
  const password = account.expectedEmailPassword?.trim() || undefined;
  return { ...(email ? { email } : {}), ...(password ? { password } : {}) };
}

/** The devices whose mailbox is signed in on this phone (the green «📧 البريد»). Empty off-app. */
export async function listMailSessions(): Promise<{ accountId: string; email: string; signedInAt: number }[]> {
  if (!isRunningInAndroidApp()) return [];
  try {
    const { sessions } = await LocalBrowser.listMailSessions();
    return sessions;
  } catch {
    return [];
  }
}

/** Opens the device's Outlook mailbox inside the app, in its own isolated profile. */
export async function openIsolatedMailbox(accountId: string, accountName: string, login: MailLogin = {}): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) {
    return { ok: false, message: ANDROID_ONLY_MESSAGE };
  }
  try {
    const { supported } = await LocalBrowser.isSupported();
    if (!supported) {
      return { ok: false, message: UNSUPPORTED_DEVICE_MESSAGE };
    }
    markInternalLeave();
    await LocalBrowser.openMailBrowser({ accountId, accountName, ...login });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر فتح البريد" };
  }
}

export async function openIsolatedAccountBrowser(accountId: string, accountName: string, login: StarlinkLogin = {}): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) {
    return { ok: false, message: ANDROID_ONLY_MESSAGE };
  }

  try {
    const { supported } = await LocalBrowser.isSupported();
    if (!supported) {
      return { ok: false, message: UNSUPPORTED_DEVICE_MESSAGE };
    }
    // The device browser is its own Activity - STAR NET going to the background for it must not
    // count as "left the app" for the PIN re-lock.
    markInternalLeave();
    await LocalBrowser.openAccountBrowser({ accountId, accountName, url: STARLINK_ACCOUNT_HOME_URL, ...login });
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
 * acking first and failing to save after would lose it permanently. Returns whether the ack
 * actually reached disk; a false/thrown result means the caller must keep these syncIds around
 * to retry the ack later, without merging or messaging them again (they are already applied).
 */
export async function ackPendingAccountSyncs(syncIds: string[]): Promise<boolean> {
  if (!isRunningInAndroidApp() || syncIds.length === 0) return true;
  try {
    const { acked } = await LocalBrowser.ackPendingAccountSyncs({ syncIds });
    return acked;
  } catch {
    return false;
  }
}

/**
 * Tells the native side which accounts to sync automatically in the background - the important
 * ones by their renewal date and status, see SyncPriority.java/autoSyncList.ts, replacing whatever list was set before. Call this every
 * time the account list changes so a closed/killed app's next scheduled run reflects the current
 * list - it never establishes a login itself, so an account that was never opened via "فتح" simply
 * yields nothing on every run, exactly like a manual sync tap on a logged-out page. No-op on web.
 */
export async function syncAutoSyncAccountList(accounts: AutoSyncAccountRef[]): Promise<boolean> {
  if (!isRunningInAndroidApp()) return true;
  try {
    const { saved } = await LocalBrowser.setAutoSyncAccountIds({
      accounts: accounts.map((account) => ({
        accountId: account.id,
        accountName: account.name,
        renewalDate: account.renewalDate,
        serviceStatus: account.serviceStatus,
        representativeId: account.representativeId,
      })),
    });
    return saved;
  } catch {
    return false;
  }
}

/**
 * "مزامنة الآن": triggers an immediate background sync of every account instead of waiting for
 * the next scheduled run. Only hands the job to the native side - actual results still arrive
 * through the normal accountDataSynced/listPendingAccountSyncs pipeline already wired in
 * HomeView, not through this call's own return value.
 */
// ---- المزامنة التلقائية on/off (الإعدادات) ----

const AUTO_SYNC_OFF_KEY = "starnet.autoSyncOff";

/** On unless turned off. */
export function isAutoSyncEnabled(): boolean {
  try {
    return window.localStorage.getItem(AUTO_SYNC_OFF_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Saves the choice and applies it natively right away (Android app). */
export async function setAutoSyncEnabled(enabled: boolean): Promise<boolean> {
  try {
    if (enabled) window.localStorage.removeItem(AUTO_SYNC_OFF_KEY);
    else window.localStorage.setItem(AUTO_SYNC_OFF_KEY, "1");
  } catch {
    // Storage blocked - the native side still gets the choice below.
  }
  if (!isRunningInAndroidApp()) return true;
  try {
    await LocalBrowser.setAutoSyncEnabled({ enabled });
    return true;
  } catch {
    return false;
  }
}

/** Omit `accountId` to sync every registered account (the header's "مزامنة الآن"); pass it to
 * scope this run to just that one (a single card's own "تحديث" button). */
export async function triggerImmediateSync(accountId?: string): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) {
    return { ok: false, message: ANDROID_ONLY_MESSAGE };
  }
  try {
    await LocalBrowser.syncNow(accountId ? { accountId } : undefined);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر بدء المزامنة" };
  }
}

/**
 * Reads the raw login-session cookies for the given accounts, for the "protected backup" feature
 * (see accountBackup.ts) - the caller is responsible for encrypting this before it ever touches
 * disk. Empty on web/failure, never throws: an empty export is safe, just not useful.
 */
export async function exportAccountSessions(accountIds: string[], includeMailbox = false): Promise<SessionsByAccount> {
  if (!isRunningInAndroidApp()) return {};
  try {
    const { sessions } = await LocalBrowser.exportSessionCookies({ accountIds, ...(includeMailbox ? { mailbox: true } : {}) });
    return sessions;
  } catch {
    return {};
  }
}

/**
 * Restores previously-exported session cookies into their accounts' isolated profiles. Only call
 * this after the sessions have actually been decrypted from a backup file (see
 * accountBackup.ts#readEncryptedBackupFile) - this function itself has no idea where they came
 * from and does no validation beyond what the native side already does.
 */
export async function importAccountSessions(sessions: SessionsByAccount): Promise<{ ok: boolean; importedCount: number }> {
  if (!isRunningInAndroidApp()) return { ok: false, importedCount: 0 };
  try {
    const { importedCount } = await LocalBrowser.importSessionCookies({ sessions });
    return { ok: true, importedCount };
  } catch {
    return { ok: false, importedCount: 0 };
  }
}

/**
 * Whether one account's isolated browser is still signed in to Starlink (see
 * LocalBrowserPlugin#checkSession). "unknown" on web/failure, never throws.
 */
export async function checkAccountSession(accountId: string): Promise<SessionStatus> {
  if (!isRunningInAndroidApp()) return "unknown";
  try {
    const { status } = await LocalBrowser.checkSession({ accountId });
    return status;
  } catch {
    return "unknown";
  }
}

/**
 * Opens Android's own per-app notification settings screen - the one switch that already
 * controls both sync-result and reminder notifications (see SyncNotifier.java). A no-op outside
 * the Android app; never throws, since there's nothing the caller can usefully do about a failed
 * "open a settings screen" beyond letting the button appear to do nothing.
 */
export async function openNotificationSettings(): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.openNotificationSettings();
  } catch {
    // Nothing to recover - see doc comment above.
  }
}
