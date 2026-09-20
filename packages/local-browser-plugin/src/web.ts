import { WebPlugin } from "@capacitor/core";
import type {
  DeleteAccountSessionOptions,
  DeleteAccountSessionResult,
  IsSupportedResult,
  LocalBrowserPlugin,
  OpenAccountBrowserOptions,
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
}
