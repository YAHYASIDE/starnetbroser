/**
 * "وضع المحيط" (Ocean Mode) alarm: which live devices have Starlink's maritime switch ON, and
 * the one-time Telegram alert per device. Pure except the small alerted-ids store (a setting -
 * `starnet.` prefix, not backed up).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

export function oceanModeAccounts(accounts: StarlinkAccountSummary[]): StarlinkAccountSummary[] {
  return accounts.filter((a) => a.oceanMode === true && !a.archivedAt && !a.deletedAt);
}

/** Devices to alert about now (ON and not alerted yet), and the alerted set to keep: a device
 * turned OFF leaves it, so turning it ON again alerts again. */
export function oceanAlertsToSend(accounts: StarlinkAccountSummary[], alerted: string[]): { send: StarlinkAccountSummary[]; keep: string[] } {
  const on = oceanModeAccounts(accounts);
  const onIds = new Set(on.map((a) => a.id));
  return { send: on.filter((a) => !alerted.includes(a.id)), keep: alerted.filter((id) => onIds.has(id)).concat(on.filter((a) => !alerted.includes(a.id)).map((a) => a.id)) };
}

export function oceanTelegramText(devices: StarlinkAccountSummary[]): string {
  return [
    "🚨🚨 تحذير خطير: وضع المحيط مفعّل!",
    "",
    ...devices.map((d) => `🌊 ${d.name}`),
    "",
    "وضع المحيط يحسب كل جيجابايت بسعر بحري (2 - 6 دولار) وقد تصل الفاتورة إلى آلاف الدولارات.",
    "أوقفه فوراً: افتح الحساب ← الاشتراك ← البيانات ← وضع المحيط ← إيقاف.",
  ].join("\n");
}

const ALERTED_KEY = "starnet.oceanAlerted";

export function loadOceanAlerted(): string[] {
  try {
    const raw = window.localStorage.getItem(ALERTED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveOceanAlerted(ids: string[]): void {
  try {
    window.localStorage.setItem(ALERTED_KEY, JSON.stringify(ids));
  } catch {
    // Best effort - at worst the Telegram alert repeats once.
  }
}
