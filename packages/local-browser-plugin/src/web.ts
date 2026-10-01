import { WebPlugin } from "@capacitor/core";
import type {
  AckPendingAccountSyncsOptions,
  AckPendingAccountSyncsResult,
  AuthorizeDriveOptions,
  AuthorizeDriveResult,
  CheckSessionOptions,
  ClearDriveTokenOptions,
  CheckSessionResult,
  DeleteAccountSessionOptions,
  DeleteAccountSessionResult,
  ExportSessionCookiesOptions,
  ExportSessionCookiesResult,
  ImportSessionCookiesOptions,
  ImportSessionCookiesResult,
  IsSupportedResult,
  ListPendingAccountSyncsResult,
  LocalBrowserPlugin,
  OpenAccountBrowserOptions,
  OpenMailBrowserOptions,
  ListMailSessionsResult,
  SetAutoSyncAccountIdsOptions,
  SetAutoSyncAccountIdsResult,
  SetAutoSyncEnabledOptions,
  SetAutoSyncEnabledResult,
  TelegramBot,
  TelegramInboxMessage,
  TelegramPollResult,
  TelegramStatus,
  SyncNowOptions,
} from "./definitions";

const WEB_UNSUPPORTED_MESSAGE =
  "هذه الميزة متاحة فقط داخل تطبيق STAR NET لنظام Android - المتصفحات المعزولة لكل حساب تحتاج WebView أصلي ولا يمكن توفيرها من متصفح الويب.";

/**
 * The web/GitHub Pages fallback. There is no native WebView here, so there
 * is no way to give two accounts isolated cookie jars - per the product
 * requirement, this must say so plainly rather than silently opening a
 * shared session.
 */
export class LocalBrowserWeb extends WebPlugin implements LocalBrowserPlugin {
  async isSupported(): Promise<IsSupportedResult> {
    return { supported: false };
  }

  async openAccountBrowser(_options: OpenAccountBrowserOptions): Promise<void> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async openMailBrowser(_options: OpenMailBrowserOptions): Promise<void> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async listMailSessions(): Promise<ListMailSessionsResult> {
    return { sessions: [] };
  }

  async deleteAccountSession(_options: DeleteAccountSessionOptions): Promise<DeleteAccountSessionResult> {
    return { deleted: false };
  }

  async listPendingAccountSyncs(): Promise<ListPendingAccountSyncsResult> {
    return { syncs: [] };
  }

  async ackPendingAccountSyncs(_options: AckPendingAccountSyncsOptions): Promise<AckPendingAccountSyncsResult> {
    return { acked: true };
  }

  // There is no isolated browser (and so no background worker) to schedule anything for on web -
  // resolving `saved: true` with nothing stored is not a lie, since there was never anything to
  // save in the first place, just like ackPendingAccountSyncs above.
  async setAutoSyncAccountIds(_options: SetAutoSyncAccountIdsOptions): Promise<SetAutoSyncAccountIdsResult> {
    return { saved: true };
  }

  // No background worker on web - the choice is simply echoed back.
  async setAutoSyncEnabled(options: SetAutoSyncEnabledOptions): Promise<SetAutoSyncEnabledResult> {
    return { enabled: options.enabled };
  }

  // The Telegram bot lives in the Android app (its token in native storage) - on web it's simply
  // not connected, and anything that would send is refused rather than silently dropped.
  async telegramConnect(_options: { token: string; bot?: TelegramBot }): Promise<{ botName: string; chatName: string }> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async telegramStatus(): Promise<TelegramStatus> {
    return { configured: false, stoppedEnabled: false };
  }

  async telegramDisconnect(_options?: { bot?: TelegramBot }): Promise<void> {
    return;
  }

  async telegramSetOptions(_options: { stopped?: boolean; repsStopped?: boolean }): Promise<void> {
    return;
  }

  async telegramSetRepChats(_options: { chats: Record<string, string> }): Promise<void> {
    return;
  }

  async telegramSend(_options: { text: string; bot?: TelegramBot; chatId?: string; reply?: boolean; replyMarkup?: string }): Promise<{ queued: boolean }> {
    return { queued: false };
  }

  async telegramSchedule(_options: { key: string; at: number; text: string; bot?: TelegramBot; chatId?: string; replyMarkup?: string }): Promise<void> {
    return;
  }

  async telegramCancel(_options: { key: string }): Promise<void> {
    return;
  }

  async telegramSendDocument(_options: { fileName: string; base64: string; caption?: string; bot?: TelegramBot; chatId?: string; photo?: boolean }): Promise<void> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async telegramPoll(_options: { offset?: number; bot?: TelegramBot }): Promise<TelegramPollResult> {
    return { messages: [], nextOffset: 0 };
  }

  async telegramSetInstant(_options: { enabled: boolean }): Promise<void> {
    return;
  }

  async telegramSetReplies(_options: { snapshot: string }): Promise<void> {
    return;
  }

  async telegramTakeInbox(): Promise<{ messages: TelegramInboxMessage[]; running: boolean }> {
    return { messages: [], running: false };
  }

  async openAutostartSettings(): Promise<{ opened: "maker" | "app" }> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async requestBatteryUnrestricted(): Promise<void> {
    return;
  }

  async telegramResolveEdit(_options: { id: string }): Promise<void> {
    return;
  }

  async telegramForgetRequest(_options: { chatId: string }): Promise<void> {
    return;
  }

  async pinShortcut(_options: { id: string; label: string; route: string; emoji?: string; color?: string }): Promise<{ pinned: boolean; unsupported: boolean }> {
    return { pinned: false, unsupported: true };
  }

  async takeShortcutRoute(): Promise<{ route: string | null }> {
    return { route: null };
  }

  async telegramResolveActivation(_options: { id: string }): Promise<void> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async telegramDownloadFile(_options: { fileId: string }): Promise<{ text: string }> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async telegramDownloadImage(_options: { fileId: string; bot?: "reps" | "money" }): Promise<{ dataUrl: string }> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async syncNow(_options?: SyncNowOptions): Promise<void> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  // No isolated profile exists on web, so there is genuinely nothing to read - an empty result is
  // accurate, not a lie, same reasoning as listPendingAccountSyncs above.
  async exportSessionCookies(_options: ExportSessionCookiesOptions): Promise<ExportSessionCookiesResult> {
    return { sessions: {} };
  }

  async importSessionCookies(_options: ImportSessionCookiesOptions): Promise<ImportSessionCookiesResult> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async checkSession(_options: CheckSessionOptions): Promise<CheckSessionResult> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  // There is no OS notification-settings screen to open outside the native app - a silent no-op,
  // not an error, same reasoning as setAutoSyncAccountIds above.
  async openNotificationSettings(): Promise<void> {
    return;
  }

  // Google Drive sign-in goes through Google Play services on the phone - nothing to do on web.
  async authorizeDrive(_options?: AuthorizeDriveOptions): Promise<AuthorizeDriveResult> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async clearDriveToken(_options: ClearDriveTokenOptions): Promise<void> {
    return;
  }

  async linkGmailCodes(_options: { email: string }): Promise<{ email: string }> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }

  async gmailCodesStatus(): Promise<{ email?: string }> {
    return {};
  }

  async unlinkGmailCodes(): Promise<void> {
    return;
  }

  async latestGmailCode(): Promise<{ code?: string }> {
    throw this.unavailable(WEB_UNSUPPORTED_MESSAGE);
  }
}
