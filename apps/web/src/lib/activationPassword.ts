/**
 * 🔑 «كلمة سر التفعيل» (his Nov 21 2026 ask): one word he types once in the settings, and every new device starts with
 * it everywhere a password goes - the email, the Starlink account (Starlink's «تعيين كلمة مرور» is filled with it) and
 * the Wi-Fi. Kept on his phone only (`starnet.` - not backed up, never in the app's code, which is public).
 */

const KEY = "starnet.activationPassword";

/** Starlink and the dish both take 8 to 63 characters. */
export function isValidActivationPassword(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 8 && trimmed.length <= 63;
}

export function loadActivationPassword(): string {
  try {
    return window.localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Saves it (a too-short or too-long word is refused - false) or clears it with "". */
export function saveActivationPassword(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed && !isValidActivationPassword(trimmed)) return false;
  try {
    if (trimmed) window.localStorage.setItem(KEY, trimmed);
    else window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
