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
