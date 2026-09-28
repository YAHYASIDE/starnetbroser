"use client";

/**
 * The Telegram bot, app side. The token and chat live only in the phone's private native storage
 * (LocalBrowser plugin → TelegramStore.java) - this module never sees the token after connecting.
 * Texts come from telegramMessages.ts; sending is queued natively, so it goes out even offline or
 * with the app closed. What gets sent automatically is chosen in الإعدادات (TelegramPrefs).
 */

import { loadPromises } from "./paymentPromises";
import { repOpenPromises, repPromisesDueLines } from "./repPromises";
import { nextWeeklyTime, weeklyText } from "./ownerInsightsText";
import { cardNeed, computeRenewalForecast } from "./renewalForecast";
import { currentCardBalanceUsd } from "./starlinkDebt";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { LocalBrowser, type TelegramInboxMessage, type TelegramPollMessage } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "./localBrowser";
import { buildEveningSummary, localDay, nextEveningTime } from "./eveningSummary";
import { loadCashEntries } from "./cashStore";
import { loadClientStore } from "./clientStore";
import { getCurrency, loadCurrencyStore } from "./currencyStore";
import { loadInvoices } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import { loadRepresentativeStore, loadRepSettlements } from "./repStore";
import { REP_HELP, REP_KEYBOARD, repAccounts, repMoney, repMorningMarkup, repMorningText, repStatementText, repWelcomeText } from "./telegramRepMessages";
import type { PrintableDocument } from "./pdfDocument";
import type { TelegramReplySnapshot } from "./telegramReplies";
import { renderPrintablePdf } from "./pdfExport";
import {
  buildEveningTelegram,
  buildMorningTelegram,
  buildPaymentTelegram,
  cleanBotToken,
  DEFAULT_TELEGRAM_PREFS,
  TelegramPrefs,
} from "./telegramMessages";

const PREFS_KEY = "starnet.telegramPrefs";
const TOKEN_FORMAT_HELP = "هذا ليس مفتاح بوت - انسخ السطر الطويل الذي يبدأ بأرقام ثم «:» من آخر رسالة أرسلها لك @BotFather";
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
    await LocalBrowser.telegramSetOptions({ stopped: prefs.stopped, repsStopped: prefs.repStopped });
    if (!prefs.morning) await LocalBrowser.telegramCancel({ key: "morning" });
    if (!prefs.evening) await LocalBrowser.telegramCancel({ key: "evening" });
    if (!prefs.weekly) await LocalBrowser.telegramCancel({ key: "weekly" });
    if (!prefs.repMorning) for (const repId of Object.keys(loadRepChats())) await LocalBrowser.telegramCancel({ key: repMorningKey(repId) });
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
  repsConfigured?: boolean;
  repsBotName?: string;
}

export async function telegramConnection(): Promise<TelegramConnection> {
  if (!isRunningInAndroidApp()) return { configured: false };
  try {
    const status = await LocalBrowser.telegramStatus();
    safeSet(CONNECTED_KEY, status.configured ? "1" : null);
    safeSet(REPS_CONNECTED_KEY, status.repsConfigured ? "1" : null);
    return {
      configured: status.configured,
      botName: status.botName ?? undefined,
      chatName: status.chatName ?? undefined,
      repsConfigured: Boolean(status.repsConfigured),
      repsBotName: status.repsBotName ?? undefined,
    };
  } catch {
    return { configured: false };
  }
}

export async function connectTelegram(token: string): Promise<{ ok: true; botName: string; chatName: string } | { ok: false; message: string }> {
  if (!isRunningInAndroidApp()) return { ok: false, message: "الربط يعمل داخل تطبيق أندرويد فقط" };
  const clean = cleanBotToken(token);
  if (!clean) return { ok: false, message: TOKEN_FORMAT_HELP };
  try {
    const result = await LocalBrowser.telegramConnect({ token: clean });
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
export async function sendTelegramText(text: string, replyMarkup?: string): Promise<boolean> {
  if (!isTelegramConnected()) return false;
  try {
    return (await LocalBrowser.telegramSend({ text, ...(replyMarkup ? { replyMarkup } : {}) })).queued;
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

/** "💵 دفعة جديدة" - to the operator and to the device's rep, as each option allows. */
export function notifyPaymentTelegram(input: Parameters<typeof buildPaymentTelegram>[0] & { representativeId?: string }): void {
  const prefs = loadTelegramPrefs();
  const text = buildPaymentTelegram(input);
  if (isTelegramConnected() && prefs.payments) void sendTelegramText(text);
  if (input.representativeId && prefs.repPayments) void sendRepText(input.representativeId, text);
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
      const day = localDay(at);
      const promisesDue = loadPromises().filter((p) => p.status === "open" && p.dueDate <= day);
      const cardShortUsd = cardNeed(computeRenewalForecast(input.accounts, at, 7), currentCardBalanceUsd(input.ledgerStore)).shortUsd;
      const text = buildMorningTelegram({ accounts: input.accounts, clients: loadClientStore(), owedByCurrency: input.owedByCurrency, today: day, promisesDue, cardShortUsd });
      await LocalBrowser.telegramSchedule({ key: "morning", at: at.getTime(), text });
    }
    if (prefs.evening) {
      const at = nextEveningTime(now, input.eveningHour);
      const summary = buildEveningSummary({ day: localDay(at), accounts: input.accounts, ledgerStore: input.ledgerStore, cash: loadCashEntries() });
      if (summary) await LocalBrowser.telegramSchedule({ key: "evening", at: at.getTime(), text: buildEveningTelegram(summary) });
    }
    if (prefs.weekly) {
      const at = nextWeeklyTime(now, input.eveningHour);
      const text = weeklyText({
        accounts: input.accounts,
        clients: loadClientStore(),
        ledger: input.ledgerStore,
        promises: loadPromises(),
        repNames: Object.fromEntries(Object.values(loadRepresentativeStore()).map((r) => [r.id, r.name])),
        weekEnd: localDay(at),
        now,
      });
      await LocalBrowser.telegramSchedule({ key: "weekly", at: at.getTime(), text });
    }
  } catch {
    // Tried again on the next data change.
  }
  await rescheduleRepMornings(input.accounts, input.morningHour);
}

// ---- Reps bot: one bot for all representatives, each linked to his own chat ----

const REPS_CONNECTED_KEY = "starnet.telegramRepsConnected";
const REP_CHATS_KEY = "starnet.telegramRepChats";
const REP_REQUESTS_KEY = "starnet.telegramRepRequests";
const REPS_OFFSET_KEY = "starnet.telegramRepsOffset";

export interface RepChat {
  chatId: string;
  /** The Telegram name, to recognise him in الإعدادات. */
  name: string;
}

export interface RepLinkRequest {
  chatId: string;
  name: string;
  username: string;
  at: string;
}

export function isRepsBotConnected(): boolean {
  return isRunningInAndroidApp() && safeGet(REPS_CONNECTED_KEY) === "1";
}

export function loadRepChats(): Record<string, RepChat> {
  try {
    return JSON.parse(safeGet(REP_CHATS_KEY) ?? "{}") as Record<string, RepChat>;
  } catch {
    return {};
  }
}

async function saveRepChats(chats: Record<string, RepChat>): Promise<void> {
  safeSet(REP_CHATS_KEY, JSON.stringify(chats));
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.telegramSetRepChats({ chats: Object.fromEntries(Object.entries(chats).map(([repId, c]) => [repId, c.chatId])) });
  } catch {
    // Pushed again on the next change.
  }
}

export function loadRepRequests(): RepLinkRequest[] {
  try {
    return JSON.parse(safeGet(REP_REQUESTS_KEY) ?? "[]") as RepLinkRequest[];
  } catch {
    return [];
  }
}

function saveRepRequests(requests: RepLinkRequest[]) {
  safeSet(REP_REQUESTS_KEY, JSON.stringify(requests.slice(-20)));
}

export async function connectRepsBot(token: string): Promise<{ ok: true; botName: string } | { ok: false; message: string }> {
  if (!isRunningInAndroidApp()) return { ok: false, message: "الربط يعمل داخل تطبيق أندرويد فقط" };
  const clean = cleanBotToken(token);
  if (!clean) return { ok: false, message: TOKEN_FORMAT_HELP };
  try {
    const result = await LocalBrowser.telegramConnect({ token: clean, bot: "reps" });
    safeSet(REPS_CONNECTED_KEY, "1");
    await saveRepChats(loadRepChats());
    await saveTelegramPrefs(loadTelegramPrefs());
    return { ok: true, botName: result.botName };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر الربط" };
  }
}

export async function disconnectRepsBot(): Promise<void> {
  for (const repId of Object.keys(loadRepChats())) {
    try {
      await LocalBrowser.telegramCancel({ key: repMorningKey(repId) });
    } catch {
      // nothing scheduled
    }
  }
  safeSet(REPS_CONNECTED_KEY, null);
  safeSet(REP_CHATS_KEY, null);
  safeSet(REP_REQUESTS_KEY, null);
  safeSet(REPS_OFFSET_KEY, null);
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.telegramDisconnect({ bot: "reps" });
  } catch {
    // Nothing stored natively then.
  }
}

/** Links a Telegram chat (from a request) to a rep and welcomes him. A chat belongs to one rep. */
export async function linkRepChat(repId: string, request: RepLinkRequest, repName: string): Promise<void> {
  const chats = Object.fromEntries(Object.entries(loadRepChats()).filter(([, c]) => c.chatId !== request.chatId));
  chats[repId] = { chatId: request.chatId, name: request.name || request.username };
  await saveRepChats(chats);
  saveRepRequests(loadRepRequests().filter((r) => r.chatId !== request.chatId));
  await sendRepText(repId, repWelcomeText(repName));
}

export async function unlinkRep(repId: string): Promise<void> {
  const chats = loadRepChats();
  delete chats[repId];
  await saveRepChats(chats);
  try {
    await LocalBrowser.telegramCancel({ key: repMorningKey(repId) });
  } catch {
    // nothing scheduled
  }
}

export function dismissRepRequest(chatId: string) {
  saveRepRequests(loadRepRequests().filter((r) => r.chatId !== chatId));
  if (isRunningInAndroidApp()) void LocalBrowser.telegramForgetRequest({ chatId }).catch(() => undefined);
}

/** Someone not linked yet wrote to the reps bot: remember him for الإعدادات (once). */
export function recordRepRequest(message: TelegramPollMessage): boolean {
  const requests = loadRepRequests();
  if (requests.some((r) => r.chatId === message.chatId)) return false;
  saveRepRequests([...requests, { chatId: message.chatId, name: message.name, username: message.username, at: new Date().toISOString() }]);
  return true;
}

export function repIdForChat(chatId: string): string | undefined {
  return Object.entries(loadRepChats()).find(([, c]) => c.chatId === chatId)?.[0];
}

/** Queued to a linked rep; false when he isn't linked. */
export async function sendRepText(repId: string, text: string, replyMarkup: string = REP_KEYBOARD): Promise<boolean> {
  const chat = loadRepChats()[repId];
  if (!chat || !isRepsBotConnected()) return false;
  try {
    return (await LocalBrowser.telegramSend({ text, bot: "reps", chatId: chat.chatId, replyMarkup })).queued;
  } catch {
    return false;
  }
}

/** A direct answer to someone who isn't linked (the "request received" reply). */
export async function replyToChat(chatId: string, text: string): Promise<void> {
  try {
    await LocalBrowser.telegramSend({ text, bot: "reps", chatId, reply: true });
  } catch {
    // best effort
  }
}

/** A device file a rep sent the reps bot, as text; null when it can't be fetched. */
export async function downloadRepFile(fileId: string): Promise<string | null> {
  if (!isRunningInAndroidApp() || !isRepsBotConnected()) return null;
  try {
    return (await LocalBrowser.telegramDownloadFile({ fileId })).text;
  } catch {
    return null;
  }
}

export async function pollRepsBot(): Promise<TelegramPollMessage[]> {
  if (!isRepsBotConnected()) return [];
  const offset = Number(safeGet(REPS_OFFSET_KEY)) || 0;
  try {
    const result = await LocalBrowser.telegramPoll({ offset, bot: "reps" });
    safeSet(REPS_OFFSET_KEY, String(result.nextOffset));
    return result.messages;
  } catch {
    return [];
  }
}

function repMorningKey(repId: string): string {
  return `rep_${repId.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 50)}`;
}

/** Each linked rep's "☀️ تجديدات أجهزتك", scheduled for the next morning (cancelled when he has none). */
async function rescheduleRepMornings(accounts: StarlinkAccountSummary[], morningHour: number): Promise<void> {
  if (!isRepsBotConnected() || !loadTelegramPrefs().repMorning) return;
  const reps = loadRepresentativeStore();
  const clients = loadClientStore();
  const at = new Date();
  at.setHours(morningHour, 0, 0, 0);
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  for (const [repId, chat] of Object.entries(loadRepChats())) {
    const rep = reps[repId];
    const mine = repAccounts(accounts, repId);
    const open = repOpenPromises(repId, loadPromises(), new Set(mine.map((a) => a.clientId).filter((c): c is string => Boolean(c))));
    const promiseLines = repPromisesDueLines(open, localDay(at));
    const renewals = rep ? repMorningText(rep.name, mine, clients, localDay(at)) : null;
    const text = rep && (renewals || promiseLines.length) ? [renewals ?? `☀️ صباح الخير ${rep.name}`, ...promiseLines].join("\n") : null;
    const replyMarkup = repMorningMarkup(mine, clients, localDay(at));
    try {
      await LocalBrowser.telegramSchedule({ key: repMorningKey(repId), at: at.getTime(), text: text ?? "", bot: "reps", chatId: chat.chatId, replyMarkup });
    } catch {
      // Tried again on the next data change.
    }
  }
}

/** "📊 كشف حسابك" to every linked rep - sent when a month is closed. */
export async function sendRepMonthlyStatements(month: string, ledgerStore: LedgerByAccount): Promise<number> {
  if (!isRepsBotConnected() || !loadTelegramPrefs().repMonthly) return 0;
  const reps = loadRepresentativeStore();
  const currencies = loadCurrencyStore();
  const rates = { MRU: getCurrency(currencies, "MRU")?.rateFromUsd, SIFA: getCurrency(currencies, "SIFA")?.rateFromUsd };
  const invoices = loadInvoices();
  const settlements = loadRepSettlements();
  let sent = 0;
  for (const repId of Object.keys(loadRepChats())) {
    const rep = reps[repId];
    if (!rep) continue;
    const text = repStatementText(rep.name, month, repMoney({ rep, month, ledgerStore, invoices, settlements, rates }));
    if (await sendRepText(repId, `🗓 تم إقفال شهر\n${text}`)) sent += 1;
  }
  return sent;
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

// ---- Replies with the app closed (TelegramReplyService) ----

const INSTANT_KEY = "starnet.telegramInstant";

/** On by default: the bots answer even with the app closed (permanent notification). */
export function isTelegramInstant(): boolean {
  return isRunningInAndroidApp() && safeGet(INSTANT_KEY) !== "0";
}

export async function setTelegramInstant(enabled: boolean): Promise<void> {
  safeSet(INSTANT_KEY, enabled ? null : "0");
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.telegramSetInstant({ enabled });
  } catch {
    // Applied again the next time the app opens.
  }
}

/** Whether the closed-app reply service is running right now, and whether Android lets STAR NET
 * run in the background without limits (what keeps it alive on strict phones). */
export interface TelegramServiceState {
  running: boolean;
  batteryUnrestricted: boolean;
  diagnostics: Record<string, string | boolean>;
}

export async function telegramServiceState(): Promise<TelegramServiceState | null> {
  if (!isRunningInAndroidApp()) return null;
  try {
    const status = await LocalBrowser.telegramStatus();
    return { running: Boolean(status.instantRunning), batteryUnrestricted: Boolean(status.batteryUnrestricted), diagnostics: status.diagnostics ?? {} };
  } catch {
    return null;
  }
}

/** The phone maker's "app launch / autostart" screen, where background running is allowed. */
export async function openAutostartSettings(): Promise<void> {
  try {
    await LocalBrowser.openAutostartSettings();
  } catch {
    // The hint explains the manual path.
  }
}

export async function requestBatteryUnrestricted(): Promise<void> {
  try {
    await LocalBrowser.requestBatteryUnrestricted();
  } catch {
    // Shown as still restricted; the hint explains the manual path.
  }
}

/** Hands the native service the answers prepared from the data right now. */
export async function pushTelegramReplies(snapshot: TelegramReplySnapshot): Promise<void> {
  try {
    await LocalBrowser.telegramSetReplies({ snapshot: JSON.stringify(snapshot) });
  } catch {
    // Pushed again in a minute.
  }
}

/** Messages the service left for the app, and whether that service is actually running now
 * (when it isn't, the app must read the bots itself or nobody would answer). */
export async function takeTelegramInbox(): Promise<{ messages: TelegramInboxMessage[]; running: boolean }> {
  try {
    return await LocalBrowser.telegramTakeInbox();
  } catch {
    return { messages: [], running: false };
  }
}

const KEYBOARD_SENT_KEY = "starnet.telegramRepKeyboard";
/** Bump when the rep keyboard changes, so every linked rep gets the new buttons once. */
const KEYBOARD_VERSION = "6";

/** Gives every linked rep the button keyboard once (a rep linked before it existed never had it). */
export async function sendRepKeyboardOnce(): Promise<void> {
  if (!isRepsBotConnected()) return;
  let sent: Record<string, string> = {};
  try {
    sent = JSON.parse(safeGet(KEYBOARD_SENT_KEY) ?? "{}") as Record<string, string>;
  } catch {
    sent = {};
  }
  let changed = false;
  for (const repId of Object.keys(loadRepChats())) {
    if (sent[repId] === KEYBOARD_VERSION) continue;
    if (await sendRepText(repId, `✨ أزرار سريعة جديدة أسفل المحادثة 👇\n\n${REP_HELP}`, REP_KEYBOARD)) {
      sent[repId] = KEYBOARD_VERSION;
      changed = true;
    }
  }
  if (changed) safeSet(KEYBOARD_SENT_KEY, JSON.stringify(sent));
}
