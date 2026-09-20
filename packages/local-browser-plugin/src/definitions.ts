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
}
