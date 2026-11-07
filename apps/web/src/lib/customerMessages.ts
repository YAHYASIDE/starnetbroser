/**
 * 📨 His ready messages for the customer (his Nov 7 2026 lists - «حالة الجهاز» 9 and «التفعيل» 5 - and his four
 * choices the same day: «الرسالة تُحدّث الجهاز», «الرسائل من بطاقة الجهاز أيضًا», «سجل ما أُرسل للزبون», «تعديل نصوص
 * الرسائل»). One list for the device browser's «📸 لقطة ذكية» and the card's ⋯ «📨 رسالة للزبون»:
 *  - the defaults are his own words (mirrored by ShotMessages.java, the browser's fallback);
 *  - his edits are kept apart (`starnet_customer_messages_v1`, only what he changed) so «↺ الأصل» always works;
 *  - every message sent is logged per device (`starnet_customer_message_log_v1`), newest first;
 *  - a few messages also change the device: «تم التوثيق» marks it, «نظن أنه محروق» puts it in «المعطلة» (🔥 محروق,
 *    its D untouched - money is his decision), «إطفاء 3 أيام» sets a ⏰ reminder 3 days later to tell the customer
 *    to turn it on.
 * Both stores start with `starnet_`, so they're in the backup and the team link. Pure + small stores.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

export type CustomerMessageKind = "travel" | "status" | "activation";
/** What sending it does to the device besides the log. */
export type CustomerMessageEffect = "travelDone" | "burned" | "off3days" | "none";

export interface CustomerMessage {
  id: string;
  kind: CustomerMessageKind;
  /** The button. */
  label: string;
  /** The message's middle (between the greeting and the device line). */
  body: string;
  effect: CustomerMessageEffect;
}

export const DEFAULT_CUSTOMER_MESSAGES: readonly CustomerMessage[] = [
  { id: "travelDone", kind: "travel", label: "✅ تم التوثيق", body: "✅ تم توثيق جهاز Starlink الخاص بك بنجاح.", effect: "travelDone" },
  { id: "ok", kind: "status", label: "✅ يعمل جيدًا", body: "✅ جهازك يعمل بشكل طبيعي وجيد، بدون أي أعطال.", effect: "none" },
  { id: "noPower", kind: "status", label: "🔌 يعمل - الكهرباء غير واصلة", body: "🔌 جهازك يعمل بشكل طبيعي، لكن الكهرباء غير واصلة إليه.", effect: "none" },
  { id: "expired", kind: "status", label: "⛔ الاشتراك منتهٍ", body: "⛔ انتهى اشتراك جهازك والخدمة موقوفة.", effect: "none" },
  { id: "weakPlan", kind: "status", label: "🐢 خطة ضعيفة جدًا", body: "🐢 جهازك يعمل بخطة ضعيفة جدًا.", effect: "none" },
  { id: "abroad", kind: "status", label: "🌍 موقوف خارج البلد", body: "🌍 جهازك موقوف لأنه خارج البلد، ولا يمكن أن يعمل في الوقت الحالي.", effect: "none" },
  {
    id: "off3days",
    kind: "status",
    label: "⏸️ إطفاء 3 أيام",
    body: "⏸️ يجب إطفاء جهازك لمدة 3 أيام متتالية.\n⚠️ تحذير: أي تشغيل للجهاز قبل اكتمال 3 أيام قد يؤدي إلى إطفائه مرة ثانية لـ 3 أيام.",
    effect: "off3days",
  },
  { id: "burned", kind: "status", label: "🔥 نظن أنه محروق", body: "🔥 نظن أن جهازك محروق.", effect: "burned" },
  { id: "wires", kind: "status", label: "⚡ ضعف في الأسلاك أو الكهرباء", body: "⚡ في جهازك ضعف في الأسلاك أو الكهرباء.", effect: "none" },
  { id: "paid0", kind: "status", label: "💵 تم الدفع - الحساب 0", body: "💵 تم استلام دفعتك وتم تصفير حسابك - المتبقي عليك 0.", effect: "none" },
  { id: "act100", kind: "activation", label: "📶 100 جيجا", body: "📶 تم تفعيل 100 جيجا لجهازك.", effect: "none" },
  { id: "roaming", kind: "activation", label: "🌐 تجوال غير محدود", body: "🌐 تم تفعيل تجوال غير محدود لجهازك.", effect: "none" },
  { id: "act50", kind: "activation", label: "📶 50 جيجا", body: "📶 تم تفعيل 50 جيجا لجهازك.", effect: "none" },
  { id: "actWeak", kind: "activation", label: "🐢 تفعيل - الخدمة ضعيفة", body: "🐢 تم تفعيل جهازك، والخدمة ضعيفة.", effect: "none" },
  { id: "actNo", kind: "activation", label: "❌ لا يمكن التفعيل", body: "❌ لا يمكن تفعيل خدمة لجهازك في الوقت الحالي.", effect: "none" },
];

export const KIND_TITLES: Record<CustomerMessageKind, string> = {
  travel: "🛂 التوثيق",
  status: "📨 حالة الجهاز",
  activation: "⚡ التفعيل",
};

/** The line under a message that changes the device (settings + the card's sheet). */
export function effectHint(effect: CustomerMessageEffect): string | null {
  switch (effect) {
    case "travelDone":
      return "يُعلَّم الجهاز «تم التوثيق»";
    case "burned":
      return "يدخل الجهاز «المعطلة» (🔥 محروق) - دون لمس D";
    case "off3days":
      return "⏰ تذكير بعد 3 أيام: أخبر الزبون أن يشغّله";
    default:
      return null;
  }
}

export const MAX_LABEL = 40;
export const MAX_BODY = 600;

/** id -> what he changed (only the changed parts). */
export type CustomerMessageEdits = Record<string, { label?: string; body?: string }>;

const EDITS_KEY = "starnet_customer_messages_v1";
const LOG_KEY = "starnet_customer_message_log_v1";

function readObject<T>(key: string): T {
  if (typeof window === "undefined") return {} as T;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}

export function loadMessageEdits(): CustomerMessageEdits {
  return readObject<CustomerMessageEdits>(EDITS_KEY);
}

export function saveMessageEdits(edits: CustomerMessageEdits): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
}

function cleanLabel(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}

function cleanBody(text: string | undefined): string {
  return (text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY);
}

/** The messages as he uses them: his edits over the defaults (an emptied text falls back to his original). */
export function customerMessages(edits: CustomerMessageEdits = {}): CustomerMessage[] {
  return DEFAULT_CUSTOMER_MESSAGES.map((m) => {
    const edit = edits[m.id];
    const label = cleanLabel(edit?.label);
    const body = cleanBody(edit?.body);
    return { ...m, label: label || m.label, body: body || m.body };
  });
}

export function messagesOfKind(list: CustomerMessage[], kind: CustomerMessageKind): CustomerMessage[] {
  return list.filter((m) => m.kind === kind);
}

/** Saves one message's texts; what equals the default is dropped (so «↺ الأصل» = save the defaults). */
export function editCustomerMessage(edits: CustomerMessageEdits, id: string, input: { label: string; body: string }): CustomerMessageEdits {
  const base = DEFAULT_CUSTOMER_MESSAGES.find((m) => m.id === id);
  if (!base) return edits;
  const label = cleanLabel(input.label);
  const body = cleanBody(input.body);
  const entry: { label?: string; body?: string } = {};
  if (label && label !== base.label) entry.label = label;
  if (body && body !== base.body) entry.body = body;
  const next = { ...edits };
  if (entry.label || entry.body) next[id] = entry;
  else delete next[id];
  return next;
}

export function isEdited(edits: CustomerMessageEdits, id: string): boolean {
  return Boolean(edits[id]?.label || edits[id]?.body);
}

/** The whole message (same as ShotMessages.text in the browser): greeted by name when known, the body, the device, the signature. */
export function customerMessageText(body: string, customerName?: string | null, deviceName?: string | null): string {
  const name = (customerName ?? "").trim();
  const device = (deviceName ?? "").trim();
  const hello = name ? `مرحبًا ${name}،\n` : "مرحبًا،\n";
  return `${hello}${body.trim()}${device ? `\n📡 الجهاز: ${device}` : ""}\n⭐ STAR NET`;
}

/** For the device browser (an intent extra): his current lists, read by ShotMessages.fromJson (defaults when missing). */
export function messagesForBrowser(list: CustomerMessage[]): string {
  const pack = (kind: CustomerMessageKind) => messagesOfKind(list, kind).map((m) => ({ id: m.id, label: m.label, body: m.body }));
  return JSON.stringify({ travel: pack("travel")[0] ?? null, status: pack("status"), activation: pack("activation") });
}

// ---- 📜 what was sent ----

export interface SentCustomerMessage {
  /** The message's id (DEFAULT_CUSTOMER_MESSAGES). */
  id: string;
  /** Its button label when it was sent. */
  label: string;
  at: number;
  /** Who sent it (the team member's name), when known. */
  by?: string;
  /** 📸 with the browser's screenshot, or 📨 from the card. */
  via: "browser" | "card";
}

/** deviceId -> its sent messages, newest first. */
export type CustomerMessageLog = Record<string, SentCustomerMessage[]>;

export const MAX_SENT_PER_DEVICE = 30;
/** Fired after a send is logged (the card's sheet reads the log again). */
export const MESSAGE_LOG_EVENT = "starnet:customer-message-log";

export function loadMessageLog(): CustomerMessageLog {
  return readObject<CustomerMessageLog>(LOG_KEY);
}

export function saveMessageLog(log: CustomerMessageLog): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

/** The log with one more message on the device (the same message at the same moment is kept once). */
export function addSentMessage(log: CustomerMessageLog, deviceId: string, sent: SentCustomerMessage): CustomerMessageLog {
  const list = log[deviceId] ?? [];
  if (list.some((s) => s.id === sent.id && s.at === sent.at)) return log;
  const entry: SentCustomerMessage = { id: sent.id, label: sent.label, at: sent.at, via: sent.via, ...(sent.by ? { by: sent.by } : {}) };
  const next = [entry, ...list].sort((a, b) => b.at - a.at).slice(0, MAX_SENT_PER_DEVICE);
  return { ...log, [deviceId]: next };
}

export function sentMessages(log: CustomerMessageLog, deviceId: string): SentCustomerMessage[] {
  return log[deviceId] ?? [];
}

/** «منذ 5 دقائق» · «منذ 3 ساعات» · «منذ يومين» · «2026/11/02» (older than a week). */
export function sentAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return minutes === 1 ? "منذ دقيقة" : minutes === 2 ? "منذ دقيقتين" : `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "منذ ساعة" : hours === 2 ? "منذ ساعتين" : `منذ ${hours} ساعات`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return days === 1 ? "منذ يوم" : days === 2 ? "منذ يومين" : `منذ ${days} أيام`;
  const d = new Date(at);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

// ---- what the message does to the device ----

export const OFF_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface MessageEffectPlan {
  travelDone?: true;
  /** Put the device in «المعطلة» (only when it isn't already). */
  fault?: NonNullable<StarlinkAccountSummary["deviceFault"]>;
  /** ⏰ A reminder on this phone. */
  reminder?: { at: number; note: string };
}

export function messageEffectPlan(
  message: Pick<CustomerMessage, "effect">,
  account: Pick<StarlinkAccountSummary, "deviceFault">,
  now: number,
): MessageEffectPlan {
  switch (message.effect) {
    case "travelDone":
      return { travelDone: true };
    case "burned":
      return account.deviceFault
        ? {}
        : { fault: { reason: "burned", note: "نظن أنه محروق (أُرسلت رسالة للزبون)", reportedAt: new Date(now).toISOString() } };
    case "off3days":
      return { reminder: { at: now + OFF_DAYS_MS, note: "⏸️ انتهت 3 أيام الإطفاء - أخبر الزبون أن يشغّل الجهاز" } };
    default:
      return {};
  }
}

/** yyyy-mm-dd of a moment in this phone's time (the dated pin's day). */
export function localDateOf(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The message a staged read names (the browser's «📸» picks), or null. */
export function messageById(list: CustomerMessage[], id: unknown): CustomerMessage | null {
  return typeof id === "string" ? list.find((m) => m.id === id) ?? null : null;
}

/** A device browser's read that says «I sent this message to the customer». */
export function isBrowserCustomerMessage(sync: { fields?: unknown }): boolean {
  const f = sync.fields as { customerMessage?: { id?: unknown } } | undefined;
  return typeof f?.customerMessage?.id === "string";
}
