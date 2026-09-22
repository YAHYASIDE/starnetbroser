import type { PluginListenerHandle } from "@capacitor/core";

/**
 * The page every isolated account browser opens by default. Callers may
 * override it, but this is the one product requirement actually specifies.
 */
export const STARLINK_ACCOUNT_HOME_URL = "https://starlink.com/account/home";

export interface OpenAccountBrowserOptions {
  /** Same id as StarlinkAccountSummary.id - the isolation key. */
  accountId: string;
  /** Shown in the native browser's top bar. */
  accountName: string;
  /** Defaults to STARLINK_ACCOUNT_HOME_URL when omitted. */
  url?: string;
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
  /** Starts with "ACC-" - the STAR NET/Starlink account number, never confused with starlinkId. */
  accountNumber?: string;
  /** The dish's own internal identifier - not the account number. */
  starlinkId?: string;
  serialNumber?: string;
  kitNumber?: string;
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
}

export interface SetAutoSyncAccountIdsOptions {
  /** The FULL current list - this always replaces whatever was set before, never adds to it. */
  accounts: AutoSyncAccountEntry[];
}

export interface SetAutoSyncAccountIdsResult {
  /** false means the native write did not actually reach disk - the previous list (and whatever
   * job was or wasn't scheduled for it) is still in effect, not this call's. */
  saved: boolean;
}

export interface ExportSessionCookiesOptions {
  accountIds: string[];
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

  removeAllListeners(): Promise<void>;

  /**
   * Every sync result not yet acknowledged, oldest first. Always empty on web. Call this on app
   * open and on every resume - it is the only delivery path guaranteed not to lose a result,
   * however long the app stayed backgrounded after "تحديث من Starlink" was tapped.
   */
  listPendingAccountSyncs(): Promise<ListPendingAccountSyncsResult>;

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
   * AutoSyncWorker runs on its normal hourly schedule, just requested right now instead of
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
   * needed). Rejects on an unsupported device. Does not verify the sessions are still valid -
   * Starlink may have long since invalidated an exported session, in which case this restores a
   * dead one, and the account will simply appear logged out again once opened.
   */
  importSessionCookies(options: ImportSessionCookiesOptions): Promise<ImportSessionCookiesResult>;
}
