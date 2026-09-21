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
 * Reading the Starlink account holder's name/email/phone is explicitly deferred - not part of
 * this field set.
 */
export interface SyncedStarlinkFields {
  dishStatus?: SyncedDeviceStatus;
  wifiStatus?: SyncedDeviceStatus;
  /** Normalized to one fixed value - never left as whatever free text the page happened to show. */
  serviceStatus?: SyncedServiceStatus;
  planName?: string;
  renewalDate?: string;
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
}
