/**
 * 🖥️ STAR NET for Windows (desktop/ - his Oct 21 2026 choice after the council): the same app in a
 * Windows window. The page knows it runs there by the bridge the app's preload gives it; every
 * Android-only part stays off as in a browser.
 */

export const DESKTOP_DOWNLOAD_URL = "https://github.com/YAHYASIDE/starnetbroser/releases/download/staging-latest/STAR-NET-Setup.exe";

export function isDesktopApp(): boolean {
  try {
    return typeof window !== "undefined" && Boolean((window as unknown as { starnetDesktop?: unknown }).starnetDesktop);
  } catch {
    return false;
  }
}

/** What the Windows app's preload offers (desktop/preload.js). */
export interface DesktopBridge {
  platform: string;
  version: string;
  openDevice?: (opts: { accountId: string; accountName: string; loginEmail?: string; loginPassword?: string; mailPassword?: string }) => Promise<{ ok: boolean; message?: string }>;
  importSessions?: (sessions: Record<string, Record<string, string>>) => Promise<{ importedCount: number }>;
  exportSessions?: (accountIds: string[], includeMailbox?: boolean) => Promise<Record<string, Record<string, string>>>;
  /** 📧 The device's own mailbox window (desktop/mail.js). */
  openMailbox?: (opts: { accountId: string; accountName: string; email?: string; password?: string }) => Promise<{ ok: boolean; message?: string }>;
  listMailSessions?: () => Promise<{ accountId: string; email: string; signedInAt: number }[]>;
  /** 🔑 the codes read on this laptop (desktop/codes.js), newest first. */
  listVerificationCodes?: () => Promise<{ at: number; accountId: string; kind: "starlink" | "mail" | "card"; code: string }[]>;
  clearVerificationCodes?: () => Promise<void>;
  deleteSession?: (accountId: string) => Promise<boolean>;
}

/** The bridge, or null outside the Windows app (or on an older one without device windows). */
export function desktopBridge(): DesktopBridge | null {
  if (!isDesktopApp()) return null;
  return (window as unknown as { starnetDesktop: DesktopBridge }).starnetDesktop;
}

/** On the laptop the Starlink read (sync) is still the phone's - said instead of «Android only». */
export const DESKTOP_SYNC_LATER_MESSAGE = "المزامنة من Starlink تعمل من الهاتف حاليًا - على اللابتوب افتح الجهاز بزر «فتح».";
