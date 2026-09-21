import { WebPlugin } from "@capacitor/core";
import type {
  AckPendingAccountSyncsOptions,
  AckPendingAccountSyncsResult,
  DeleteAccountSessionOptions,
  DeleteAccountSessionResult,
  IsSupportedResult,
  ListPendingAccountSyncsResult,
  LocalBrowserPlugin,
  OpenAccountBrowserOptions,
  SetAutoSyncAccountIdsOptions,
  SetAutoSyncAccountIdsResult,
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
}
