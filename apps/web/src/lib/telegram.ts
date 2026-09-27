"use client";

/**
 * The Telegram bot, app side. The token and chat live only in the phone's private native storage
 * (LocalBrowser plugin → TelegramStore.java) - this module never sees the token after connecting.
 * Texts come from telegramMessages.ts; sending is queued natively, so it goes out even offline or
 * with the app closed. What gets sent automatically is chosen in الإعدادات (TelegramPrefs).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { LocalBrowser } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "./localBrowser";
import { buildEveningSummary, localDay, nextEveningTime } from "./eveningSummary";
import { loadCashEntries } from "./cashStore";
import { loadClientStore } from "./clientStore";
import type { LedgerByAccount } from "./ledgerStore";
import type { PrintableDocument } from "./pdfDocument";
import { renderPrintablePdf } from "./pdfExport";
import {
  buildEveningTelegram,
  buildMorningTelegram,
  buildPaymentTelegram,
  DEFAULT_TELEGRAM_PREFS,
  TelegramPrefs,
} from "./telegramMessages";

const PREFS_KEY = "starnet.telegramPrefs";
/** A quick "is it connected" answer for buttons (the native store is the truth). */
const CONNECTED_KEY = "starnet.telegramConnected";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked - the defaults apply.
  }
}

export function loadTelegramPrefs(): TelegramPrefs {
  try {
    const raw = safeGet(PREFS_KEY);
    return raw ? { ...DEFAULT_TELEGRAM_PREFS, ...(JSON.parse(raw) as Partial<TelegramPrefs>) } : DEFAULT_TELEGRAM_PREFS;
  } catch {
    return DEFAULT_TELEGRAM_PREFS;
  }
}

export async function saveTelegramPrefs(prefs: TelegramPrefs): Promise<void> {
  safeSet(PREFS_KEY, JSON.stringify(prefs));
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.telegramSetOptions({ stopped: prefs.stopped });
    if (!prefs.morning) await LocalBrowser.telegramCancel({ key: "morning" });
    if (!prefs.evening) await LocalBrowser.telegramCancel({ key: "evening" });
  } catch {
    // Applied on the next schedule.
  }
}

export function isTelegramConnected(): boolean {
  return isRunningInAndroidApp() && safeGet(CONNECTED_KEY) === "1";
}

export interface TelegramConnection {
  configured: boolean;
  botName?: string;
  chatName?: string;
}

export async function telegramConnection(): Promise<TelegramConnection> {
  if (!isRunningInAndroidApp()) return { configured: false };
  try {
    const status = await LocalBrowser.telegramStatus();
    safeSet(CONNECTED_KEY, status.configured ? "1" : null);
    return { configured: status.configured, botName: status.botName ?? undefined, chatName: status.chatName ?? undefined };
  } catch {
    return { configured: false };
  }
}

export async function connectTelegram(token: string): Promise<{ ok: true; botName: string; chatName: string } | { ok: false; message: string }> {
  if (!isRunningInAndroidApp()) return { ok: false, message: "الربط يعمل داخل تطبيق أندرويد فقط" };
  try {
    const result = await LocalBrowser.telegramConnect({ token });
    safeSet(CONNECTED_KEY, "1");
    await saveTelegramPrefs(loadTelegramPrefs());
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر الربط" };
  }
}

export async function disconnectTelegram(): Promise<void> {
  safeSet(CONNECTED_KEY, null);
  safeSet(OFFSET_KEY, null);
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.telegramDisconnect();
  } catch {
    // Nothing stored natively then.
  }
}

/** Queued natively - never throws. */
export async function sendTelegramText(text: string): Promise<boolean> {
  if (!isTelegramConnected()) return false;
  try {
    return (await LocalBrowser.telegramSend({ text })).queued;
  } catch {
    return false;
  }
}

export async function sendTelegramPdf(doc: PrintableDocument, caption?: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isTelegramConnected()) return { ok: false, message: "اربط تيليغرام أولاً من الإعدادات" };
  try {
    const { fileName, base64 } = await renderPrintablePdf(doc);
    await LocalBrowser.telegramSendDocument({ fileName, base64, caption: caption ?? `${doc.title} - ${doc.partyName}` });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر الإرسال" };
  }
}

/** "💵 دفعة جديدة" - when that option is on. */
export function notifyPaymentTelegram(input: Parameters<typeof buildPaymentTelegram>[0]): void {
  if (!isTelegramConnected() || !loadTelegramPrefs().payments) return;
  void sendTelegramText(buildPaymentTelegram(input));
}

/**
 * The next morning and evening summaries, scheduled natively with their text fixed now (like the
 * phone notifications) and refreshed every time the home page's data changes.
 */
export async function rescheduleTelegramSummaries(input: {
  accounts: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  owedByCurrency: Record<string, number>;
  morningHour: number;
  eveningHour: number;
}): Promise<void> {
  if (!isTelegramConnected()) return;
  const prefs = loadTelegramPrefs();
  const now = new Date();
  try {
    if (prefs.morning) {
      const at = new Date(now);
      at.setHours(input.morningHour, 0, 0, 0);
      if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
      const text = buildMorningTelegram({ accounts: input.accounts, clients: loadClientStore(), owedByCurrency: input.owedByCurrency, today: localDay(at) });
      await LocalBrowser.telegramSchedule({ key: "morning", at: at.getTime(), text });
    }
    if (prefs.evening) {
      const at = nextEveningTime(now, input.eveningHour);
      const summary = buildEveningSummary({ day: localDay(at), accounts: input.accounts, ledgerStore: input.ledgerStore, cash: loadCashEntries() });
      if (summary) await LocalBrowser.telegramSchedule({ key: "evening", at: at.getTime(), text: buildEveningTelegram(summary) });
    }
  } catch {
    // Tried again on the next data change.
  }
}

// ---- Commands (TelegramBridge) ----

const OFFSET_KEY = "starnet.telegramOffset";

/** New messages to the bot from the connected chat since last time. */
export async function pollTelegram(): Promise<string[]> {
  if (!isTelegramConnected()) return [];
  const offset = Number(safeGet(OFFSET_KEY)) || 0;
  try {
    const result = await LocalBrowser.telegramPoll({ offset });
    safeSet(OFFSET_KEY, String(result.nextOffset));
    return result.messages.map((m) => m.text);
  } catch {
    return [];
  }
}
