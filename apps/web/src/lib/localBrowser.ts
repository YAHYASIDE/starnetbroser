"use client";

import { Capacitor, PluginListenerHandle } from "@capacitor/core";
import {
  AccountDataSyncedEvent,
  KastDevice,
  LocalBrowser,
  OpenMailBrowserOptions,
  PendingAccountSync,
  STARLINK_ACCOUNT_HOME_URL,
  STARLINK_ACTIVATE_URL,
  SessionStatus,
} from "@starnet/local-browser-plugin";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { SIGNUP_RECOVERY_EMAIL, outlookSignupFor, starlinkActivationFor } from "./accountCreation";
import { passwordSuggestionsFor } from "./usedPasswords";
import { CANCEL_SUBSCRIPTION_REASON } from "./subscriptionCancel";
import { type CardDeposit, loadCardDeposits, loadPaymentCards, mergeCardDeposits, saveCardDeposits } from "./kastCards";
import { fillItems, loadCardFillBook } from "./cardFill";
import { isRepWorkspace } from "./repMode";
import { ingestBankNotices, loadBankInbox, saveBankInbox, type BankInbox } from "./bankNotices";
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
  /** Offered there when that password is missing or wrong. */
  mailSuggestions?: string[];
  /** Typed into Microsoft's «Add an email address» there. */
  mailRecoveryEmail?: string;
}

/** The mailbox extras for a device's Starlink browser («📧 البريد» inside it): its email's code,
 * the codes to offer, and the shop's recovery email. */
export function mailExtrasFor(account: StarlinkAccountSummary, accounts: StarlinkAccountSummary[] = []): Pick<StarlinkLogin, "mailPassword" | "mailSuggestions" | "mailRecoveryEmail"> {
  const mail = mailLoginFor(account, accounts);
  return {
    ...(mail.password ? { mailPassword: mail.password } : {}),
    ...(mail.suggestions ? { mailSuggestions: mail.suggestions } : {}),
    mailRecoveryEmail: SIGNUP_RECOVERY_EMAIL,
  };
}

export interface MailLogin {
  email?: string;
  password?: string;
  /** Offered when the password field is empty or the password was wrong. */
  suggestions?: string[];
  /** Typed into Microsoft's «Add an email address» (no recovery email yet): the shop's Gmail. */
  recoveryEmail?: string;
}

/** 📧 البريد: the device's main email and that email's own password ("كود الإيميل"), plus the
 * passwords to offer when that one is missing or wrong (its other codes, then the most used). */
export function mailLoginFor(
  account: Pick<StarlinkAccountSummary, "expectedEmail" | "expectedEmailPassword" | "extraEmails" | "starlinkPassword" | "wifiPassword">,
  accounts: StarlinkAccountSummary[] = [],
): MailLogin {
  const email = account.expectedEmail?.trim() || undefined;
  const password = account.expectedEmailPassword?.trim() || undefined;
  // The saved one is already typed in; offering it again after it was refused is no help.
  const suggestions = passwordSuggestionsFor({ name: "", ...account }, accounts).filter((v) => v !== password);
  return { ...(email ? { email } : {}), ...(password ? { password } : {}), ...(suggestions.length ? { suggestions } : {}), recoveryEmail: SIGNUP_RECOVERY_EMAIL };
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

/** 🔄 «تحديث من Starlink» / «مزامنة الآن»: the device's browser opens, runs «مزامنة» (the same
 * read as the button) and closes back to the app. A device not signed in to Starlink is skipped at
 * once (the operator's choice - no sign-in attempt) and reported (takeAutoSyncResults). */
export async function openAutoSync(account: StarlinkAccountSummary, label?: string): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) return { ok: false, message: ANDROID_ONLY_MESSAGE };
  try {
    const { supported } = await LocalBrowser.isSupported();
    if (!supported) return { ok: false, message: UNSUPPORTED_DEVICE_MESSAGE };
    markInternalLeave();
    await LocalBrowser.openAccountBrowser({
      accountId: account.id,
      accountName: account.name || "حساب Starlink",
      url: STARLINK_ACCOUNT_HOME_URL,
      autoSync: true,
      ...(label ? { autoSyncLabel: label } : {}),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر فتح المتصفح المحلي" };
  }
}

// ---- 🔄 Sync fully in the background (BackgroundSyncService) ----

const BACKGROUND_SYNC_KEY = "starnet.backgroundSync";

/** The operator chose to sync in the background (settings) - phone-only choice, not backed up. */
export function isBackgroundSyncEnabled(): boolean {
  try {
    return window.localStorage.getItem(BACKGROUND_SYNC_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBackgroundSyncEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(BACKGROUND_SYNC_KEY, "1");
    else window.localStorage.removeItem(BACKGROUND_SYNC_KEY);
  } catch {
    // storage unavailable - stays off
  }
}

/** «الظهور فوق التطبيقات» is granted (the background sync can run). */
export async function backgroundSyncCanRun(): Promise<boolean> {
  if (!isRunningInAndroidApp()) return false;
  try {
    return (await LocalBrowser.backgroundSyncStatus()).canRun;
  } catch {
    return false;
  }
}

export async function openOverlaySettings(): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.openOverlaySettings();
  } catch {
    // nothing to open
  }
}

/** Starts the background sync of these devices; false when it can't (permission missing, web). */
export async function startBackgroundSync(accounts: { id: string; name: string }[], label: string): Promise<boolean> {
  if (!isRunningInAndroidApp() || accounts.length === 0) return false;
  try {
    const { started } = await LocalBrowser.startBackgroundSync({
      accounts: accounts.map((a) => ({ accountId: a.id, accountName: a.name || "" })),
      label,
    });
    return started;
  } catch {
    return false;
  }
}

/** 🔄 How each auto-sync ended since the last call - and forgets them ([] on web). */
export async function takeAutoSyncResults(): Promise<{ accountId: string; outcome: "ok" | "nothing" | "saveFailed" | "signedOut" | "stuck" | "closed" }[]> {
  if (!isRunningInAndroidApp()) return [];
  try {
    const { results } = await LocalBrowser.takeAutoSyncResults();
    return results;
  } catch {
    return [];
  }
}

/** 🛑 «إلغاء الاشتراك»: the device's Starlink browser cancels every subscription by itself (signing
 * in first if needed). Only called after the operator pressed the card's button and confirmed. */
export async function openCancelSubscription(account: StarlinkAccountSummary, accounts: StarlinkAccountSummary[] = []): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) return { ok: false, message: ANDROID_ONLY_MESSAGE };
  try {
    const { supported } = await LocalBrowser.isSupported();
    if (!supported) return { ok: false, message: UNSUPPORTED_DEVICE_MESSAGE };
    markInternalLeave();
    await LocalBrowser.openAccountBrowser({
      accountId: account.id,
      accountName: account.name || "حساب Starlink",
      url: STARLINK_ACCOUNT_HOME_URL,
      ...starlinkLoginFor(account),
      ...mailExtrasFor(account, accounts),
      autoLogin: true,
      cancelSubscriptionReason: CANCEL_SUBSCRIPTION_REASON,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر فتح المتصفح المحلي" };
  }
}

/**
 * 🤖 «إضافة الحساب» for a device that already has an email: its mailbox first, signed in by itself
 * (the saved «كود البريد», else a code to the shop's Gmail), then its Starlink browser, signed in
 * by itself too («التالي», «تسجيل الدخول», the «التحقق بخطوتين» code from the mailbox). A Gmail
 * device skips the mailbox step (Google refuses its sign-in inside the app).
 */
export function autoSignInOptionsFor(account: StarlinkAccountSummary, accounts: StarlinkAccountSummary[] = []): OpenMailBrowserOptions {
  const mail = mailLoginFor(account, accounts);
  return {
    accountId: account.id,
    accountName: account.name || "حساب Starlink",
    ...mail,
    auto: true,
    then: {
      accountName: account.name || "حساب Starlink",
      url: STARLINK_ACCOUNT_HOME_URL,
      ...starlinkLoginFor(account),
      ...mailExtrasFor(account, accounts),
      autoLogin: true,
    },
  };
}

export async function openAutoSignIn(account: StarlinkAccountSummary, accounts: StarlinkAccountSummary[] = []): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) return { ok: false, message: ANDROID_ONLY_MESSAGE };
  try {
    const { supported } = await LocalBrowser.isSupported();
    if (!supported) return { ok: false, message: UNSUPPORTED_DEVICE_MESSAGE };
    markInternalLeave();
    await LocalBrowser.openMailBrowser(autoSignInOptionsFor(account, accounts));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر فتح البريد" };
  }
}

/**
 * 🆕 «إنشاء حساب جديد», continued from `step`: "mail" opens Microsoft's signup (filled with the
 * new email, its password and the customer's name) and, once the new inbox opens, «تفعيل
 * Starlink»; "starlink" opens «تفعيل Starlink» directly (KIT, then name/email/phone).
 */
export async function openAccountCreation(account: StarlinkAccountSummary, step: "mail" | "starlink"): Promise<OpenResult> {
  if (!isRunningInAndroidApp()) return { ok: false, message: ANDROID_ONLY_MESSAGE };
  const activation = starlinkActivationFor(account);
  const signup = outlookSignupFor(account);
  if (!activation || !signup) return { ok: false, message: "هذا الجهاز ليس قيد الإنشاء" };
  const name = account.name || "حساب جديد";
  const starlink = {
    accountName: name,
    url: STARLINK_ACTIVATE_URL,
    loginEmail: signup.email,
    ...(signup.password ? { loginPassword: signup.password, mailPassword: signup.password } : {}),
    activation,
  };
  try {
    const { supported } = await LocalBrowser.isSupported();
    if (!supported) return { ok: false, message: UNSUPPORTED_DEVICE_MESSAGE };
    markInternalLeave();
    if (step === "starlink") {
      await LocalBrowser.openAccountBrowser({ accountId: account.id, ...starlink });
    } else {
      await LocalBrowser.openMailBrowser({
        accountId: account.id,
        accountName: name,
        email: signup.email,
        password: signup.password,
        signup: { firstName: signup.firstName, lastName: signup.lastName, recoveryEmail: signup.recoveryEmail },
        then: starlink,
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر فتح صفحة الإنشاء" };
  }
}

/** 📨 «بريد الرموز»: link the shop's Gmail (read-only) - see LocalBrowser.linkGmailCodes. */
export async function linkGmailCodes(email: string): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  if (!isRunningInAndroidApp()) return { ok: false, message: ANDROID_ONLY_MESSAGE };
  try {
    const result = await LocalBrowser.linkGmailCodes({ email: email.trim() });
    return { ok: true, email: result.email };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر ربط Gmail" };
  }
}

export async function gmailCodesEmail(): Promise<string | null> {
  if (!isRunningInAndroidApp()) return null;
  try {
    return (await LocalBrowser.gmailCodesStatus()).email ?? null;
  } catch {
    return null;
  }
}

export async function unlinkGmailCodes(): Promise<void> {
  if (isRunningInAndroidApp()) await LocalBrowser.unlinkGmailCodes().catch(() => undefined);
}

// ---- 🖐 app lock by fingerprint ----

/** A fingerprint (or face) can unlock the app on this phone right now. */
export async function biometricAvailable(): Promise<boolean> {
  if (!isRunningInAndroidApp()) return false;
  try {
    return (await LocalBrowser.biometricStatus()).available;
  } catch {
    return false;
  }
}

/** Android's fingerprint prompt: true only when the finger was accepted (cancel = use the PIN). */
export async function unlockWithBiometric(subtitle?: string): Promise<boolean> {
  if (!isRunningInAndroidApp()) return false;
  try {
    const result = await LocalBrowser.authenticateBiometric({ title: "فتح STAR NET", ...(subtitle ? { subtitle } : {}), cancel: "استخدم الرمز" });
    return result.ok;
  } catch {
    return false;
  }
}

// ---- 📧 a device's own Gmail (Starlink's codes, read through Google) ----

let linkedDeviceGmails: Promise<Set<string>> | null = null;

/** The devices' Gmail addresses linked on this phone (asked once, refreshed after a change). */
export function deviceGmailLinked(): Promise<Set<string>> {
  if (!isRunningInAndroidApp()) return Promise.resolve(new Set());
  linkedDeviceGmails ??= LocalBrowser.deviceGmailStatus()
    .then((r) => new Set(r.emails.map((e) => e.toLowerCase())))
    .catch(() => new Set<string>());
  return linkedDeviceGmails;
}

export type DeviceGmailLinkResult = { ok: true } | { ok: false; notOnPhone: boolean; message: string };

export async function linkDeviceGmail(email: string): Promise<DeviceGmailLinkResult> {
  if (!isRunningInAndroidApp()) return { ok: false, notOnPhone: false, message: ANDROID_ONLY_MESSAGE };
  try {
    await LocalBrowser.linkDeviceGmail({ email: email.trim() });
    linkedDeviceGmails = null;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر ربط Gmail";
    // DRIVE_AUTH_FAILED: Google couldn't use that account - mostly it isn't on the phone yet.
    const code = (err as { code?: string } | null)?.code;
    return { ok: false, notOnPhone: code === "DRIVE_AUTH_FAILED", message };
  }
}

export async function unlinkDeviceGmail(email: string): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  await LocalBrowser.unlinkDeviceGmail({ email }).catch(() => undefined);
  linkedDeviceGmails = null;
}

/** The newest Starlink code of the last day in a linked device Gmail. `notLinked`: Google no
 * longer allows reading it (link it again). */
export async function latestDeviceGmailCode(
  email: string,
): Promise<{ ok: true; code: string | null } | { ok: false; notLinked: boolean; message: string }> {
  if (!isRunningInAndroidApp()) return { ok: false, notLinked: false, message: ANDROID_ONLY_MESSAGE };
  try {
    return { ok: true, code: (await LocalBrowser.latestDeviceGmailCode({ email })).code ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذر القراءة من Gmail";
    return { ok: false, notLinked: message === "NOT_LINKED", message };
  }
}

export async function openAddGoogleAccount(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isRunningInAndroidApp()) return { ok: false, message: ANDROID_ONLY_MESSAGE };
  try {
    await LocalBrowser.openAddGoogleAccount();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "افتح إعدادات الهاتف ← الحسابات ← إضافة حساب ← Google" };
  }
}

/** «🔍 جرّب»: the newest code of the last day, or a message saying why there is none. */
export async function latestGmailCode(): Promise<{ ok: true; code: string | null } | { ok: false; message: string }> {
  if (!isRunningInAndroidApp()) return { ok: false, message: ANDROID_ONLY_MESSAGE };
  try {
    return { ok: true, code: (await LocalBrowser.latestGmailCode()).code ?? null };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر القراءة من Gmail" };
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
/** 📥 The file last opened with STAR NET from Telegram (once); null when none / not on Android. */
export async function takeSharedFile(): Promise<string | null> {
  if (!isRunningInAndroidApp()) return null;
  try {
    return (await LocalBrowser.takeSharedFile()).text;
  } catch {
    return null;
  }
}

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

// ---- 💳 filling Starlink's card form with my own cards (CardFillController on the phone) ----

/** The completed cards go to the device browsers (this phone only); [] removes them. Never on a
 * rep's phone. No-op on web. */
export async function pushFillCards(): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    const cards = isRepWorkspace() ? [] : fillItems(loadPaymentCards(), loadCardFillBook());
    await LocalBrowser.setFillCards({ cards });
  } catch {
    // the next change pushes again
  }
}

// ---- 💳 KAST card mail (KastWatch on the phone) ----

/** The devices' expected Starlink dollars and cards, for the refused-payment alert (also starts
 * the hourly check). No-op on web. */
export async function pushKastDevices(devices: KastDevice[]): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.kastSetDevices({ devices });
  } catch {
    // the next change pushes again
  }
}

/** One check of the KAST mail now (the app just opened / came back). */
export async function kastCheckNow(): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.kastCheckNow();
  } catch {
    // the hourly check still runs
  }
}

/** 💳 Whether STAR NET reads the KAST app's notifications («Notification access»). */
export async function kastNotificationsEnabled(): Promise<boolean | null> {
  if (!isRunningInAndroidApp()) return null;
  try {
    return (await LocalBrowser.kastNotificationsStatus()).enabled;
  } catch {
    return null;
  }
}

/** Opens Android's «Notification access» screen. */
export async function openKastNotificationAccess(): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.openKastNotificationAccess();
  } catch {
    // nothing to open on this phone
  }
}

/** Moves the dollars received (KAST mail) from the phone into the app's own store, then forgets
 * them there. Returns the ones that are new to the app. */
export async function drainKastDeposits(): Promise<CardDeposit[]> {
  if (!isRunningInAndroidApp()) return [];
  try {
    const { deposits } = await LocalBrowser.kastPendingDeposits();
    if (!deposits.length) return [];
    const before = loadCardDeposits();
    const after = mergeCardDeposits(before, deposits);
    saveCardDeposits(after);
    await LocalBrowser.kastAckDeposits({ ids: deposits.map((d) => d.id) });
    const known = new Set(before.map((d) => d.id));
    return after.filter((d) => !known.has(d.id));
  } catch {
    return [];
  }
}

/** 🏦 Moves the bank / wallet notifications kept on the phone into «حسابي»'s suggestions (saved
 * before they're forgotten there). `ownNumbers`: my numbers, to tell my own transfers apart. */
export async function drainBankNotices(ownNumbers: string[]): Promise<{ inbox: BankInbox; added: number } | null> {
  if (!isRunningInAndroidApp()) return null;
  try {
    const { notices } = await LocalBrowser.bankPendingNotices();
    if (!notices.length) return null;
    const result = ingestBankNotices(loadBankInbox(), notices, ownNumbers);
    saveBankInbox(result.inbox);
    await LocalBrowser.bankAckNotices({ ids: notices.map((n) => n.id) });
    return result;
  } catch {
    return null;
  }
}
