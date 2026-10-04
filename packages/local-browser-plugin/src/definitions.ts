import type { PluginListenerHandle } from "@capacitor/core";

/**
 * The page every isolated account browser opens by default. Callers may
 * override it, but this is the one product requirement actually specifies.
 */
export const STARLINK_ACCOUNT_HOME_URL = "https://starlink.com/account/home";
/** «تفعيل Starlink» - where a brand-new account starts (🆕 «إنشاء حساب جديد»). */
export const STARLINK_ACTIVATE_URL = "https://starlink.com/activate";

export interface OpenAccountBrowserOptions {
  /** Same id as StarlinkAccountSummary.id - the isolation key. */
  accountId: string;
  /** Shown in the native browser's top bar. */
  accountName: string;
  /** Defaults to STARLINK_ACCOUNT_HOME_URL when omitted. */
  url?: string;
  /** Typed into the Starlink login form's empty email field (never submitted by itself). */
  loginEmail?: string;
  /** Typed into the Starlink login form's empty password field (never submitted by itself). */
  loginPassword?: string;
  /** The device email's own password - only for its mailbox («📧 البريد» in the browser's bar). */
  mailPassword?: string;
  /** Offered in «📧 البريد» when its password field is empty or the password was wrong. */
  mailSuggestions?: string[];
  /** Typed into Microsoft's «Add an email address» in «📧 البريد» (the shop's codes mailbox). */
  mailRecoveryEmail?: string;
  /** 🆕 «إنشاء حساب جديد»: «تفعيل Starlink» is filled with the KIT (then «متابعة»), and
   * «معلومات الاتصال» with the name, email and phone - the rest is done by hand. */
  activation?: StarlinkActivationFill;
  /** 🤖 «إضافة الحساب»: «التالي» and «تسجيل الدخول» are pressed by itself once the fields are
   * typed, and the «التحقق بخطوتين» code is read from the mailbox and entered - no hand needed.
   * Stops on a wrong password. */
  autoLogin?: boolean;
  /** 🛑 «إلغاء الاشتراك»: cancel every subscription of the device on Starlink with this reason
   * (Manage → Cancel service → reason → Continue To Cancel ×2 → Confirm & Cancel Service). Only
   * ever set after the operator pressed the card's button and confirmed. The end date comes back as
   * pendingCancellationDate through accountDataSynced. */
  cancelSubscriptionReason?: string;
  /** 🔄 «تحديث من Starlink» / «مزامنة الآن»: the browser signs in if needed, runs «مزامنة» by
   * itself (the same read as the button), then closes and returns to the app. */
  autoSync?: boolean;
  /** Shown while the auto-sync runs, e.g. "3 / 10" in a run over several devices. */
  autoSyncLabel?: string;
}

/** 🔄 How one device's auto-sync ended: read and saved, nothing read, the save failed, not signed in
 * to Starlink (skipped at once), no end within the time limit (skipped), or closed by hand. */
export type AutoSyncOutcome = "ok" | "nothing" | "saveFailed" | "signedOut" | "stuck" | "closed";

export interface AutoSyncResult {
  accountId: string;
  outcome: AutoSyncOutcome;
  /** ms since epoch */
  at: number;
}

export interface StarlinkActivationFill {
  kit: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Without the country code. */
  phone: string;
}

export interface MailSession {
  accountId: string;
  /** The email the mailbox was opened with ("" when it had none). */
  email: string;
  /** When the inbox was last reached (ms since epoch). */
  signedInAt: number;
}

export interface ListMailSessionsResult {
  sessions: MailSession[];
}

export interface OpenMailBrowserOptions {
  /** The device (StarlinkAccountSummary.id) whose mailbox this is - its own isolated profile. */
  accountId: string;
  /** Shown in the mailbox's top bar when there is no email. */
  accountName: string;
  /** Typed into the Microsoft sign-in form's empty email field (never submitted by itself). */
  email?: string;
  /** Typed into the Microsoft sign-in form's empty password field (never submitted by itself). */
  password?: string;
  /** Offered (a list to pick from) when the password field is empty or the password was wrong. */
  suggestions?: string[];
  /** Typed into Microsoft's «Add an email address» when the account has no recovery email yet. */
  recoveryEmail?: string;
  /** 🆕 «إنشاء حساب جديد»: Microsoft's signup (email, password and these names typed in, nothing
   * pressed) instead of the inbox. */
  signup?: { firstName: string; lastName: string; recoveryEmail?: string };
  /** 🤖 «إضافة الحساب»: Microsoft's sign-in steps are pressed through by itself - the saved
   * password first («Use your password»), a code sent to the shop's Gmail (`recoveryEmail`, read
   * through «بريد الرموز») only when the password is missing or wrong and Microsoft offers that
   * address, «Add an email address» / «Verify your email» filled with it, terms and «Stay signed
   * in?» accepted. Stops (and says why) on an unknown page or a refused password. */
  auto?: boolean;
  /** With `signup` or `auto`: the device's Starlink browser opened once the inbox opens. */
  then?: Omit<OpenAccountBrowserOptions, "accountId">;
}

export interface IsSupportedResult {
  /**
   * Whether this device's installed WebView supports the AndroidX WebKit
   * Multi-Profile API (real per-account cookie/storage isolation). false on
   * web (GitHub Pages) and on any Android device with too old a WebView.
   */
  supported: boolean;
}

export interface DeleteAccountSessionOptions {
  accountId: string;
}

export interface DeleteAccountSessionResult {
  /** false when there was nothing to delete, or deletion wasn't possible. */
  deleted: boolean;
}

export type SyncedDeviceStatus = "online" | "offline" | "warning" | "unknown";
export type SyncedServiceStatus = "active" | "standby" | "canceled" | "suspended";

/**
 * Stage 1 of on-device Starlink sync - fields as read from the account's own isolated WebView,
 * via "تحديث من Starlink" (see packages/local-browser-plugin/src/webExtraction). Every field is
 * optional: absent means "not found on this page/section", never a fabricated value, and callers
 * must never overwrite existing local data with an absent field. A single tap only reads
 * whatever section of the Starlink portal is currently open - accountNumber/starlinkId showing
 * up alongside dishStatus is not expected, and that's fine; results across taps on different
 * sections (Devices, then Subscriptions, then Billing, ...) are meant to be merged cumulatively.
 *
 * The Starlink account holder's own name and registered email ARE read (see `accountHolderName`/
 * `accountEmail`). Per explicit product decision, `accountHolderName` is written to its own
 * separate field (`starlinkAccountHolderName`, see mergeSyncedFields in apps/web) - the card shows
 * it alongside the operator's own `name` as two distinct slots, never merging or overwriting one
 * with the other. `phone`, read from the same Settings page, IS merged onto the operator's own
 * WhatsApp `phone` field - each account browses in its own isolated session (a separate Starlink
 * login per account/customer, the whole point of this app), so that number genuinely is this
 * customer's own contact number, not a reseller-wide login's. Per explicit product decision
 * mergeSyncedFields only ever fills this in when the operator hasn't already entered one by hand -
 * see that function's own doc for why a sync must never silently overwrite a manual entry.
 */
export interface SyncedStarlinkFields {
  dishStatus?: SyncedDeviceStatus;
  wifiStatus?: SyncedDeviceStatus;
  /** Normalized to one fixed value - never left as whatever free text the page happened to show. */
  serviceStatus?: SyncedServiceStatus;
  planName?: string;
  renewalDate?: string;
  /** Set only alongside the real "scheduled to end" banner (a resumable pending cancellation,
   * e.g. "من المقرر أن تنتهي خدمتك في ..." with a "استئناف"/Resume option) - the service is still
   * `serviceStatus: "active"` right now, this is just the date it will actually stop unless
   * resumed before then. Never set for an ordinary upcoming renewal with nothing pending. */
  pendingCancellationDate?: string;
  /** The Starlink account holder's own name, as Starlink reports it - written to its own separate
   * field, never onto the account's `name` (see this interface's own doc comment). */
  accountHolderName?: string;
  /** The account's registered login email, read from the Settings page. */
  accountEmail?: string;
  /** The account's registered contact phone, read from the same Settings page as `accountEmail` -
   * see this interface's own doc for why this one (unlike every other synced field) is only ever
   * used to fill in a currently-empty `phone`, never to overwrite one already set. */
  phone?: string;
  /** Starts with "SL-" - the subscription's own identifier, never confused with accountNumber
   * ("ACC-...") or starlinkId (the dish's identifier). */
  subscriptionId?: string;
  /** Just the number, e.g. "261" - always gigabytes. */
  dataUsageGb?: string;
  /** Always two decimal places, e.g. "0.00" - a real, confirmed zero balance, not "not found". */
  balanceDue?: string;
  /** Canonical form, e.g. "USD" - "$", "US$", "$US" and "USD" all normalize to this. */
  currency?: string;
  /** Billing → Payment Method: the last 4 digits of the card that pays this device ("VISA ending
   * in 1234") - matched against KAST's payment notices. Never the full number. */
  paymentCardLast4?: string;
  /** Starts with "ACC-" - the STAR NET/Starlink account number, never confused with starlinkId. */
  accountNumber?: string;
  /** The dish's own internal identifier - not the account number. */
  starlinkId?: string;
  serialNumber?: string;
  kitNumber?: string;
  /** ISO 3166 two-letter code of the service address's country, e.g. "GR" - from the Home page's
   * "موقع الخدمة" card. */
  serviceCountry?: string;
  /** True/false only ever set explicitly (never absent-means-false) - see
   * extractStarlinkFields.ts's own doc for why this is a separate flag from `serviceStatus`: the
   * kit has been outside its registered country/region for too long, independent of billing. */
  isRestricted?: boolean;
  /** The password the operator typed in Starlink's sign-in form after the saved one was refused,
   * once it got in - becomes the device's starlinkPassword. Never logged. */
  loginPassword?: string;
  /** The device email's password that just worked in «📧 البريد» (picked from the suggestions or
   * typed) when it differs from the saved «كود البريد» - replaces it. */
  mailPassword?: string;
  /** 🚗 "service is restricted because it is moving too fast" - a residential plan used while
   * moving; it works again once stopped. Explicit true/false; never the out-of-country restriction. */
  movingRestricted?: boolean;
  /** The email is a limited user on someone else's account (no billing icon): billing, balance
   * and the billing-suspension state can't be read from it. Judged on the Home page only. */
  limitedAccess?: boolean;
  /** Settings → Users: the email tokens that have an account Admin role there (the "primary"
   * emails). The web side matches these against this account's own login email to decide whether
   * it is primary - the reliable signal, since a real admin email can still miss the billing icon
   * the `limitedAccess` rail check relies on. */
  adminEmails?: string[];
  /** Every subscription's name on this one account, from the Subscriptions list page - a device
   * can legitimately have more than one (each its own KIT and number). */
  subscriptionNames?: string[];
  /** "وضع المحيط" (Ocean Mode) switch on the subscription page: true = ON - maritime per-GB
   * billing that can reach thousands of dollars. Read only, never toggled by the app. */
  oceanMode?: boolean;
  /** "باقة الأولوية نفدت" banner: the plan's priority data (e.g. 100 GB) is used up - the service
   * still works, at limited speed, until the next cycle. Explicit true/false like isRestricted. */
  priorityDataExhausted?: boolean;
  /** "لا توجد اشتراكات" on the subscriptions page: this email has no subscription (canceled or
   * moved away) - the device shows under «المعطلة» as ملغي اشتراك. Explicit true/false. */
  noSubscription?: boolean;
  /** The alerts Starlink lists under «الأجهزة» (each box with «Learn More»), as shown - e.g.
   * "Starlink is partially obstructed. …". Set (possibly empty) only when the devices section was
   * read, so an empty list clears alerts that are gone. */
  dishAlerts?: string[];
  /** Diagnostic: what the dot reader saw under "الأجهزة" (labels, results, candidate colors) -
   * shown in the device's edit dialog, to fix a dot that reads wrong. No account data. */
  dotTrace?: string;
}

export interface AccountDataSyncedEvent {
  /** Unique per sync result - see PendingAccountSync for why this exists. */
  syncId: string;
  accountId: string;
  fields: SyncedStarlinkFields;
}

/**
 * A sync result durably staged on-device (Android SharedPreferences, see PendingSyncStore.java)
 * because the live "accountDataSynced" event is silently dropped whenever the app's Bridge/WebView
 * wasn't attached and resumed at the moment it fired - e.g. while AccountBrowserActivity (a
 * separate Activity) was on top of it. Stays here, intact, until the web UI calls
 * ackPendingAccountSyncs for its syncId - callers must list and merge these on every app open and
 * resume, not just rely on the live event.
 */
export interface PendingAccountSync extends AccountDataSyncedEvent {
  /** ms since epoch, when AccountBrowserActivity durably recorded this result. */
  recordedAt: number;
}

export interface ListPendingAccountSyncsResult {
  syncs: PendingAccountSync[];
}

export interface AckPendingAccountSyncsOptions {
  /** syncIds that have been merged and saved on the web side, and can now be discarded. */
  syncIds: string[];
}

export interface AckPendingAccountSyncsResult {
  /**
   * false means the native write to discard these syncIds did not actually reach disk - callers
   * must treat every id in that call as still pending and retry the ack later, never as delivered.
   */
  acked: boolean;
}

export interface AutoSyncAccountEntry {
  /** Same id as StarlinkAccountSummary.id - the isolation key. */
  accountId: string;
  /** Unused by the background worker itself (there is no UI to show it to) - kept only in case
   * future diagnostics need it. */
  accountName?: string;
  /** Defaults to STARLINK_ACCOUNT_HOME_URL when omitted. */
  url?: string;
  /** The renewal date the app knows ("2026/09/28") - decides how often the device is synced
   * automatically (7/3/1 days, just expired). Omitted = never automatically, card "تحديث" only. */
  renewalDate?: string;
  /** Last known "active" | "suspended" | ... - a device that newly reads as stopped triggers the
   * grouped "⛔ توقف" notification. */
  serviceStatus?: string;
  /** The device's representative - his linked Telegram chat (reps bot) hears when it stops. */
  representativeId?: string;
}

export interface SetAutoSyncAccountIdsOptions {
  /** The FULL current list - this always replaces whatever was set before, never adds to it. */
  accounts: AutoSyncAccountEntry[];
}

/** "owner" = the operator's own bot (default); "reps" = the representatives' bot. */
/** "reps" = the reps' 📡 devices bot; "money" / "alerts" = their optional 💰 and 🔔 bots (sending to
 * one that isn't connected goes through the devices bot instead). */
export type TelegramBot = "owner" | "reps" | "money" | "alerts";

export interface TelegramStatus {
  configured: boolean;
  botName?: string | null;
  chatName?: string | null;
  /** Whether the background sync also sends "⛔ توقف" to Telegram. */
  stoppedEnabled: boolean;
  repsConfigured?: boolean;
  repsBotName?: string | null;
  moneyConfigured?: boolean;
  moneyBotName?: string | null;
  alertsConfigured?: boolean;
  alertsBotName?: string | null;
  /** Bots keep answering with the app closed (TelegramReplyService). */
  instant?: boolean;
  /** ...and its service is actually running right now. */
  instantRunning?: boolean;
  /** STAR NET is exempt from battery optimization (keeps the service alive on strict phones). */
  batteryUnrestricted?: boolean;
  /** What the reply service last did (times "dd/MM HH:mm:ss", error kinds - never a token). */
  diagnostics?: Record<string, string | boolean>;
}

export interface TelegramPollMessage {
  text: string;
  /** The private chat it came from (owner bot: always the connected chat). */
  chatId: string;
  name: string;
  username: string;
  /** A device file a linked rep's app shared to the reps bot (text is then empty) - download it
   * with telegramDownloadFile. */
  fileId?: string;
  fileName?: string;
}

/** A message TelegramReplyService left for the app (the app is in front, or it needs a PDF /
 * to record a link request). `replied`: the service already answered it. */
export interface TelegramInboxMessage extends TelegramPollMessage {
  bot: TelegramBot;
  replied: boolean;
  /** A record from the reps bot's device menu (never a message to answer): a ✏️ edit waiting
   * for approval, the owner's ✅/❌ on one in his bot, a 📝 note, or a 💵 payment or a 🏦 loan entered
   * step by step (waiting for approval too) - `data` is its JSON. */
  kind?: "repEdit" | "repEditDecision" | "repNote" | "repPayment" | "repLoan" | "repActivation" | "repActivationDecision" | "repBookEntry" | "repBookUndo";
  data?: string;
}

export interface TelegramPollResult {
  /** Text messages, oldest first. */
  messages: TelegramPollMessage[];
  /** Pass back as `offset` next time - marks these as read. */
  nextOffset: number;
}

export interface SetAutoSyncEnabledOptions {
  enabled: boolean;
}

export interface SetAutoSyncEnabledResult {
  /** The setting actually stored. */
  enabled: boolean;
}

export interface SetAutoSyncAccountIdsResult {
  /** false means the native write did not actually reach disk - the previous list (and whatever
   * job was or wasn't scheduled for it) is still in effect, not this call's. */
  saved: boolean;
}

export interface ExportSessionCookiesOptions {
  accountIds: string[];
  /** Also read each device's Outlook mailbox session (a "mail:<id>" entry). Off by default. */
  mailbox?: boolean;
}

export interface ExportSessionCookiesResult {
  /** accountId -> (url -> raw combined cookie string, e.g. "name1=value1; name2=value2"). An id
   * whose profile was never created (never opened via openAccountBrowser) is simply absent - not
   * an error. This is a best-effort session snapshot: cookies only, no attributes (expiry/secure/
   * domain) and no localStorage/IndexedDB. Callers must treat this as sensitive as a password and
   * never write it to disk/a file unencrypted (see apps/web/src/lib/backupCrypto.ts). */
  sessions: Record<string, Record<string, string>>;
}

export interface ImportSessionCookiesOptions {
  sessions: Record<string, Record<string, string>>;
}

export interface ImportSessionCookiesResult {
  /** How many accountIds actually had at least one cookie restored - not the total cookie count. */
  importedCount: number;
}

export interface CheckSessionOptions {
  accountId: string;
}

/** "loggedIn": the isolated browser lands on the Starlink account portal. "loginRequired": it lands
 * on a sign-in page. "none": this account has no saved session at all (never opened, or no cookies).
 * "unknown": offline, a load error, or no clear answer in time - check again later. */
export type SessionStatus = "loggedIn" | "loginRequired" | "none" | "unknown";

export interface CheckSessionResult {
  status: SessionStatus;
}

export interface AuthorizeDriveOptions {
  /** false: never show a Google screen - reject with code "DRIVE_CONSENT_REQUIRED" instead (the
   * automatic daily upload). Defaults to true (the "ربط Google Drive" button). */
  interactive?: boolean;
}

export interface AuthorizeDriveResult {
  /** Short-lived OAuth token for the drive.file scope only - never stored; ask again each time. */
  accessToken: string;
}

export interface ClearDriveTokenOptions {
  accessToken: string;
}

export interface SyncNowOptions {
  /** Omit to sync every registered account; set to scope this run to just one - a single card's
   * own "تحديث" button rather than the header's "مزامنة الآن". */
  accountId?: string;
}

export interface LocalBrowserPlugin {
  /**
   * Feature-detects Multi-Profile support on this device. Never throws.
   * Call this before showing/enabling the "فتح" action so an unsupported
   * device can be told clearly instead of silently falling back to a
   * shared, non-isolated session.
   */
  isSupported(): Promise<IsSupportedResult>;

  /**
   * Opens `url` (default STARLINK_ACCOUNT_HOME_URL) in a dedicated native
   * Activity, using a WebView profile derived deterministically from
   * accountId - never the shared/default profile. Rejects if this device
   * doesn't support Multi-Profile; callers must not fall back to a shared
   * session on rejection.
   */
  openAccountBrowser(options: OpenAccountBrowserOptions): Promise<void>;

  /**
   * 📧 البريد: the device's Outlook mailbox in its own isolated profile (separate from its Starlink
   * one) - signed in once, it stays signed in; «📋 الرمز» copies the newest Starlink code on the
   * page. Rejects on web and on devices without Multi-Profile.
   */
  openMailBrowser(options: OpenMailBrowserOptions): Promise<void>;

  /** The devices whose mailbox (📧 البريد) is signed in on this phone. Empty on web. */
  listMailSessions(): Promise<ListMailSessionsResult>;

  /**
   * Permanently deletes the on-device profile (cookies, localStorage,
   * login state) for one account. Only call this after the user has
   * explicitly confirmed it in a dialog separate from account deletion
   * itself - it is never automatic.
   */
  deleteAccountSession(options: DeleteAccountSessionOptions): Promise<DeleteAccountSessionResult>;

  /**
   * Fires once per "تحديث من Starlink" tap that actually found something on an allow-listed
   * Starlink page. Never fires on web (there is no isolated browser to sync from there). This is
   * a best-effort fast path only - it is silently dropped if the app's Bridge/WebView wasn't
   * attached and resumed at that moment, so callers must also drain listPendingAccountSyncs on
   * open/resume rather than relying on this alone.
   */
  addListener(
    eventName: "accountDataSynced",
    listenerFunc: (event: AccountDataSyncedEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** 📌 A home-screen shortcut opened the running app on this page (best effort - also call
   * takeShortcutRoute on open / resume). */
  addListener(eventName: "shortcutOpened", listenerFunc: (event: { route: string }) => void): Promise<PluginListenerHandle>;

  /** 📌 Pins a page of the app ("/tools#pay") to the phone's home screen; the phone asks to confirm. */
  pinShortcut(options: { id: string; label: string; route: string; emoji?: string; color?: string }): Promise<{ pinned: boolean; unsupported: boolean }>;
  /** The page a 📌 shortcut opened the app on (once), or null. */
  takeShortcutRoute(): Promise<{ route: string | null }>;
  /** 🔔 An app event (a rep's request, a sync report, money on KAST...) in the phone's notification
   * bar - first line the title; tapping it opens the app on `route` (like a 📌 shortcut). */
  postAppEvent(options: { text: string; route?: string }): Promise<{ posted: boolean }>;

  /** 🖐 A fingerprint (or face) can unlock the app on this phone right now. */
  biometricStatus(): Promise<{ available: boolean }>;
  /** 🖐 Android's fingerprint prompt - `ok` only when the finger was accepted (never rejects). */
  authenticateBiometric(options: { title: string; subtitle?: string; cancel: string }): Promise<{ ok: boolean; error?: string }>;

  removeAllListeners(): Promise<void>;

  /**
   * Every sync result not yet acknowledged, oldest first. Always empty on web. Call this on app
   * open and on every resume - it is the only delivery path guaranteed not to lose a result,
   * however long the app stayed backgrounded after "تحديث من Starlink" was tapped.
   */
  listPendingAccountSyncs(): Promise<ListPendingAccountSyncsResult>;

  /** 🔄 How each auto-sync ended since the last call («تحديث من Starlink» / «مزامنة الآن») - and
   * forgets them. Empty on web. */
  takeAutoSyncResults(): Promise<{ results: AutoSyncResult[] }>;
  /** 🔄 Background sync can run (the «الظهور فوق التطبيقات» permission is granted). */
  backgroundSyncStatus(): Promise<{ canRun: boolean }>;
  /** Opens Android's «الظهور فوق التطبيقات» page for STAR NET. */
  openOverlaySettings(): Promise<void>;
  /** 🔄 «مزامنة الآن» fully in the background, one device after another; `started` false when the
   * permission is missing. Progress is a notification with «إيقاف»; the report goes to the bot. */
  startBackgroundSync(options: { accounts: { accountId: string; accountName: string }[]; label?: string }): Promise<{ started: boolean }>;
  stopBackgroundSync(): Promise<void>;

  /**
   * Discards the given syncIds so listPendingAccountSyncs stops returning them. Only call this
   * after the corresponding result has actually been merged into the account and saved - acking
   * first and failing to save after would lose it permanently. Safe to call with ids that are
   * unknown or already acked. Never rejects - a write that didn't reach disk resolves with
   * `acked: false`, and callers must retry those syncIds later rather than treat them as gone.
   */
  ackPendingAccountSyncs(options: AckPendingAccountSyncsOptions): Promise<AckPendingAccountSyncsResult>;

  /**
   * Tells the native side which accounts to sync automatically in the background (WorkManager,
   * roughly hourly), replacing whatever list was set before - never additive. Call this every
   * time the account list changes (added/edited/removed) so a closed/killed app's next scheduled
   * run still reflects the current list. An empty list cancels the background job entirely.
   *
   * This never logs an account in - it only reuses whatever cookies that account's isolated
   * profile already has from a previous openAccountBrowser session, so an account that was never
   * opened simply yields no fields each run, same as a manual sync tap on a logged-out page.
   * Never rejects (resolves `saved: false` if the native write didn't land); a no-op that resolves
   * `saved: true` on web, where there is no isolated browser to schedule anything for.
   */
  setAutoSyncAccountIds(options: SetAutoSyncAccountIdsOptions): Promise<SetAutoSyncAccountIdsResult>;

  /**
   * "مزامنة الآن": triggers an immediate one-time background sync of every account currently in
   * the auto-sync list (see setAutoSyncAccountIds) - the same headless per-account sync
   * AutoSyncWorker runs automatically (see setAutoSyncEnabled), just requested right now instead of
   * waiting for the next window. Resolves once the job has been handed to WorkManager, not once
   * the sync itself has finished - actual results still flow through the existing
   * accountDataSynced event / listPendingAccountSyncs pipeline, same as any other sync.
   *
   * Pass `accountId` to scope this run to just that one account (a single card's own "تحديث"
   * button) instead of every registered account - rejects if that specific id was never opened
   * via openAccountBrowser, same reasoning as the no-accounts-at-all case below.
   *
   * Rejects if this device doesn't support Multi-Profile, or if there are no accounts to sync yet
   * (an account only becomes syncable after opening it once via openAccountBrowser) - callers
   * must surface that to the user rather than treat a resolved call as "sync is done".
   */
  syncNow(options?: SyncNowOptions): Promise<void>;

  /** المزامنة التلقائية on/off - when on, the important devices (near or just past their renewal
   * date, or stopped) are synced automatically, most urgent first; the rest only by hand. */
  setAutoSyncEnabled(options: SetAutoSyncEnabledOptions): Promise<SetAutoSyncEnabledResult>;

  // ---- Telegram bot - the token lives only in the phone's private native storage ----

  /** Checks the token, finds the chat that sent the bot "/start", stores both and says hello.
   * Rejects with an Arabic reason to show as-is. */
  telegramConnect(options: { token: string; bot?: TelegramBot }): Promise<{ botName: string; chatName: string }>;
  telegramStatus(): Promise<TelegramStatus>;
  telegramDisconnect(options?: { bot?: TelegramBot }): Promise<void>;
  telegramSetOptions(options: { stopped?: boolean; repsStopped?: boolean }): Promise<void>;
  /** The reps linked to the reps bot: repId -> chatId (replaces the previous map). */
  telegramSetRepChats(options: { chats: Record<string, string> }): Promise<void>;
  /** Queued natively: sent once there's a network, even if the app closes. Reps bot: to a linked
   * rep's `chatId`, or with `reply` a one-off answer to someone who just wrote to the bot.
   * `replyMarkup`: Telegram reply_markup JSON (buttons). */
  telegramSend(options: { text: string; bot?: TelegramBot; chatId?: string; reply?: boolean; replyMarkup?: string }): Promise<{ queued: boolean }>;
  /** Sends `text` at `at` (epoch ms), replacing what was scheduled under `key` ("morning"...). */
  telegramSchedule(options: { key: string; at: number; text: string; bot?: TelegramBot; chatId?: string; replyMarkup?: string }): Promise<void>;
  telegramCancel(options: { key: string }): Promise<void>;
  /** A PDF - or, with `photo`, a jpeg / png shown as a picture (a transfer screenshot to a rep). */
  /** `contentType`: the document's type (default application/pdf). */
  telegramSendDocument(options: { fileName: string; base64: string; caption?: string; bot?: TelegramBot; chatId?: string; photo?: boolean; contentType?: string }): Promise<void>;
  /** 📥 The file last opened with STAR NET from another app (e.g. Telegram), once; null when none. */
  takeSharedFile(): Promise<{ text: string | null }>;
  /** New messages to a bot (the app answers commands itself). */
  telegramPoll(options: { offset?: number; bot?: TelegramBot }): Promise<TelegramPollResult>;
  /** Replies with the app closed: a foreground service (permanent notification) answers both
   * bots from the texts set with telegramSetReplies. Don't telegramPoll while it's on. */
  telegramSetInstant(options: { enabled: boolean }): Promise<void>;
  /** The prepared answers (JSON of TelegramReplies.Snapshot, see apps/web telegramReplies.ts). */
  telegramSetReplies(options: { snapshot: string }): Promise<void>;
  /** Messages the service left for the app, removed as they're returned. */
  telegramTakeInbox(): Promise<{ messages: TelegramInboxMessage[]; running: boolean }>;
  /** Opens the phone maker's "app launch / autostart" screen (or the app's details page). */
  openAutostartSettings(): Promise<{ opened: "maker" | "app" }>;
  /** Opens Android's "run in background without limits" dialog for STAR NET. */
  requestBatteryUnrestricted(): Promise<void>;
  /** A rep's ✏️ edit decided in the app: its ✅/❌ in the owner's bot then answer "انتهى". */
  telegramResolveEdit(options: { id: string }): Promise<void>;
  /** A dismissed link request: that person is answered again if he writes. */
  telegramForgetRequest(options: { chatId: string }): Promise<void>;
  /** Downloads a file a rep sent the reps bot (his device file - encrypted JSON) as text. */
  /** An ⚡ activation decided in the app: its ✅/❌ in the owner's bot then says it's over. */
  telegramResolveActivation(options: { id: string }): Promise<void>;
  telegramDownloadFile(options: { fileId: string }): Promise<{ text: string }>;
  /** Downloads a 📸 payment photo a rep sent the reps or money bot, as a data: URL. */
  telegramDownloadImage(options: { fileId: string; bot?: "reps" | "money" }): Promise<{ dataUrl: string }>;

  /**
   * Reads the raw login-session cookies for each given account's isolated profile - part of the
   * "protected backup" feature (see apps/web/src/lib/backupCrypto.ts and accountBackup.ts).
   * Resolves with an empty `sessions` map rather than rejecting when nothing could be read (e.g.
   * unsupported device, or none of the given accounts were ever opened) - there is nothing unsafe
   * about an empty export. Callers must never write the result to disk unencrypted.
   */
  exportSessionCookies(options: ExportSessionCookiesOptions): Promise<ExportSessionCookiesResult>;

  /**
   * Restores previously-exported session cookies into each account's isolated profile (created if
   * needed) as persistent cookies that survive the app being closed. Rejects on an unsupported
   * device. Does not verify the sessions are still valid - Starlink may have long since
   * invalidated an exported session, in which case this restores a dead one; use checkSession
   * afterwards to find the accounts that need signing in again.
   */
  importSessionCookies(options: ImportSessionCookiesOptions): Promise<ImportSessionCookiesResult>;

  /**
   * Loads the account's Starlink home page in a hidden WebView on its own isolated profile and
   * reports whether it is still signed in (see SessionStatus). Reads nothing from the page beyond
   * "login page or account portal". Takes up to ~25s; call it one account at a time. Rejects on an
   * unsupported device or on web.
   */
  checkSession(options: CheckSessionOptions): Promise<CheckSessionResult>;

  /**
   * Opens this app's own OS-level notification settings screen (Android's
   * Settings.ACTION_APP_NOTIFICATION_SETTINGS) rather than a redundant in-app toggle - the one
   * switch Android itself provides already controls both sync-result and reminder notifications
   * (see SyncNotifier.java, which checks areNotificationsEnabled() before posting either kind).
   * Never rejects; a no-op on web, where there is no such OS screen to open.
   */
  openNotificationSettings(): Promise<void>;

  /**
   * Google Drive access (drive.file scope: only files this app created) for the off-phone backup.
   * The first interactive call shows Google's account/consent screen; later calls return a token
   * silently. Rejects with code "DRIVE_CONSENT_REQUIRED" (non-interactive, not yet approved),
   * "DRIVE_CANCELLED" or "DRIVE_AUTH_FAILED"; always rejects on web.
   */
  authorizeDrive(options?: AuthorizeDriveOptions): Promise<AuthorizeDriveResult>;

  /** Drops a token Drive rejected (HTTP 401) so the next authorizeDrive returns a fresh one. */
  clearDriveToken(options: ClearDriveTokenOptions): Promise<void>;

  /**
   * 📨 «بريد الرموز»: links the shop's Gmail read-only (one Google screen to pick the account,
   * which must be `email`). The mail browser then reads Microsoft's verification codes from it
   * and types them in. Rejects on web.
   */
  linkGmailCodes(options: { email: string }): Promise<{ email: string }>;

  /** The linked Gmail (no `email` when none). */
  gmailCodesStatus(): Promise<{ email?: string }>;

  unlinkGmailCodes(): Promise<void>;

  /**
   * 💳 The Gmail that receives the card company's STARLINK payment code (for «أضف البطاقة»),
   * linked read-only through Google's screen (the account must be on the phone). Rejects on web.
   */
  linkCardGmail(options: { email: string }): Promise<{ email: string }>;

  /** The linked card-code Gmail (no `email` when none). */
  cardGmailStatus(): Promise<{ email?: string }>;

  unlinkCardGmail(): Promise<void>;

  /** The newest code of the last day in the linked Gmail (no `code` when none) - «🔍 جرّب». */
  latestGmailCode(): Promise<{ code?: string }>;

  /**
   * 📧 A device's own Gmail, linked read-only through Google's screen (the account must be on the
   * phone). Starlink's sign-in then types that device's two-step code by itself. Rejects with code
   * "DRIVE_AUTH_FAILED" when Google can't use the account (mostly: not on the phone yet).
   */
  linkDeviceGmail(options: { email: string }): Promise<{ email: string }>;

  /** The devices' Gmail addresses linked on this phone. */
  deviceGmailStatus(): Promise<{ emails: string[] }>;

  unlinkDeviceGmail(options: { email: string }): Promise<void>;

  /** The newest Starlink code of the last day in a linked device Gmail (no `code` when none);
   * rejects with "NOT_LINKED" when Google no longer allows reading it. */
  latestDeviceGmailCode(options: { email: string }): Promise<{ code?: string }>;

  /** Android's own «إضافة حساب Google» screen. */
  openAddGoogleAccount(): Promise<void>;

  /** 💳 KAST card mail (read from the linked Gmail every hour, even with the app closed): the
   * devices' expected Starlink amounts and cards, to guess which device a refused payment was
   * (the Telegram alert). Also starts the hourly check. */
  kastSetDevices(options: { devices: KastDevice[] }): Promise<void>;

  /** One check of the KAST mail now (the app just opened). */
  kastCheckNow(): Promise<void>;

  /** KAST events not yet saved by the app: dollars received (mail or notification) and Starlink
   * payments (only the KAST app's notification shows those). */
  kastPendingDeposits(): Promise<{ deposits: KastDeposit[] }>;

  /** Whether STAR NET may read notifications («Notification access») - for the KAST app's own. */
  kastNotificationsStatus(): Promise<{ enabled: boolean }>;

  /** Opens Android's «Notification access» screen. */
  openKastNotificationAccess(): Promise<void>;

  /** The app saved these deposits - forget them on the native side. */
  kastAckDeposits(options: { ids: string[] }): Promise<void>;

  /** 🏦 The bank / wallet apps' notifications (بنكيلي، سداد، نيتا، بينانس…) kept since the app last
   * saved them - read through the same «Notification access» as KAST's. Oldest first. */
  bankPendingNotices(): Promise<{ notices: BankNoticeRaw[] }>;

  /** The app saved these as suggestions - forget them on the native side. */
  bankAckNotices(options: { ids: string[] }): Promise<void>;

  /** 💳 The operator's payment cards for filling Starlink's card form in a device's browser
   * (replaces the list; [] removes them all). Kept on this phone only. */
  setFillCards(options: { cards: FillCardItem[] }): Promise<void>;
}

export interface FillCardItem {
  /** What the browser's card list shows («KAST •••• 1234 · 03/30»). */
  label: string;
  /** The card for the page, JSON: {number, name, expMonth, expYear, cvc, postal, address}. */
  payload: string;
}

export interface BankNoticeRaw {
  /** One per posted notification (package + time + content). */
  id: string;
  /** "bankily" | "sedad" | "nita" | "binance" | "masrvi" | "amanty" | "orange". */
  app: string;
  /** The Android package that posted it. */
  pkg: string;
  title: string;
  /** The expanded text when the app gives one. */
  text: string;
  /** When it was posted (ms). */
  at: number;
}

export interface KastDevice {
  name: string;
  /** The device's expected Starlink charge, USD. */
  expectedUsd: number;
  /** Last 4 digits of the card that pays it ("" = not set). */
  cardLast4: string;
}

export interface KastDeposit {
  /** The Gmail message id or the notification's - never handled twice. */
  id: string;
  /** "received" (dollars in) or "spent" (a Starlink payment, from the notification). Older
   * entries have none (= received). */
  kind?: "received" | "spent";
  amountUsd: number;
  sender: string;
  merchant?: string;
  cardLast4?: string;
  /** When the mail arrived (ms). */
  at: number;
}
