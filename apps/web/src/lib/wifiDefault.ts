/**
 * 📶 His fixed Wi-Fi code (his Oct 17 2026 ask: the same code on every new dish). Kept on his phone
 * only (`starnet.`) - never in the app's code, which is public. He types it once in «إنشاء حساب جديد»
 * and taps «📌 ثابت»; every new account starts with it (still editable).
 */

const KEY = "starnet.wifiDefault";

/** A dish takes 8 to 63 characters. */
export function isValidWifiCode(code: string): boolean {
  const trimmed = code.trim();
  return trimmed.length >= 8 && trimmed.length <= 63;
}

export function loadWifiDefault(): string {
  try {
    return window.localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Saves it (a too-short code is refused - false) or clears it with "". */
export function saveWifiDefault(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed && !isValidWifiCode(trimmed)) return false;
  try {
    if (trimmed) window.localStorage.setItem(KEY, trimmed);
    else window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
