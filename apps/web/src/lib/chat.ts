/**
 * 💬 الدردشة داخل التطبيق (his Nov 7 2026 ask «هل يمكن أن أضيف ميزة الاتصال والدردشة داخل التطبيق»; his choices: with the
 * team, with each rep, and the customers (they have no app → their WhatsApp); text + pictures + a device attached).
 *
 * Conversations: «team» (YAHYA, المسؤول 2… - the team link's space and key) and «rep:<id>» (the operator's phones ↔ that
 * rep - his warnings channel's space and key). Every message is a sealed Firestore document (lib/chatTransport.ts);
 * each phone keeps what it read here (`starnet_chat_v1`, id → message - in the backup): everything, never dropped (his
 * Nov 8 2026 «لا تحذف شيئًا من الهاتف أبدًا») - the pictures / voices / files themselves in their own IndexedDB
 * (lib/chatMediaStore.ts, `stored`), so the business data's localStorage never fills.
 * What was read is per phone (`starnet.chatRead`). Pure + small stores.
 */

import { chatOpMessageId, chatOpText, cleanChatOp, cleanChatOpRate, type ChatOp, type ChatOpRate } from "./chatOps";

export const TEAM_CONV = "team";
export const MAX_CHAT_TEXT = 2000;
/** A picture's data URL at most (it travels inside the sealed document). */
export const MAX_CHAT_IMAGE = 200_000;
/** 📄 A file's (the rep's statement PDF) data URL at most - it travels inside the sealed document (Firestore ≤ 1 MB). */
export const MAX_CHAT_FILE = 600_000;
export const STATEMENT_ASK_TEXT = "🧾 أطلب كشف حسابي";
/** 🎤 A voice message's data URL at most (~90 s of speech at 16 kbit/s) - it travels inside the sealed document. */
export const MAX_CHAT_AUDIO = 400_000;
/** 🎤 The longest voice message. */
export const MAX_VOICE_SECONDS = 90;
export const CALL_TEXT = "📞 مكالمة صوتية";

export interface ChatMessage {
  /** Random hex - the same message read twice is one message. */
  id: string;
  /** «team» or «rep:<repId>». */
  conv: string;
  /** In a rep's conversation: «owner» (the operator's side) or «rep». The team: always «owner». */
  from: "owner" | "rep";
  /** The sender's name (team member / rep). */
  by: string;
  /** The team member's id (to know my own messages on a team phone). */
  member?: string;
  text: string;
  /** 📷 a small JPEG data URL. */
  image?: string;
  /** 📡 a device attached - tap opens its card. */
  device?: { id: string; name: string };
  /** 🎤 a voice message: an audio data URL (webm/ogg/mp4) and its length in seconds. */
  audio?: string;
  seconds?: number;
  /** 🗑️ Its picture / voice is no longer kept on this phone (the old limit of 40, before Nov 8 2026). */
  mediaGone?: boolean;
  /** 📄 a file (the rep's statement PDF): its name, size, and the PDF data URL (until it is moved to `stored`). */
  file?: { name: string; size: number; data?: string };
  /** 🧾 The rep asks for his statement - the operator's side shows «أرسل كشفه». */
  statementAsk?: true;
  /** 💳 A money operation's card (lib/chatOps.ts) - from the operator's side, in a rep's conversation. */
  op?: ChatOp;
  /** 💳 A control message (never shown as a bubble): the rep's «✅ جيد» / «❌ غير جيد» on a card. */
  opRate?: ChatOpRate;
  /** 💾 What of it lives in the chat media store (`chatmedia:<id>`) instead of this message. */
  stored?: ("image" | "audio" | "file")[];
  /** 📞 a voice call started (its signalling document: lib/callSignal.ts) - the other side rings. */
  call?: { id: string };
  /** ↩️ the message it answers (WhatsApp's quote): its id, who wrote it and a short preview. */
  reply?: { id: string; by: string; preview: string };
  /** ↪️ forwarded from another conversation. */
  forwarded?: true;
  /** 🗑️ A control message (never shown): «delete this message for everyone» - only its own sender's counts. */
  deleteOf?: string;
  /** 🗑️ On this phone only: «حذف عندي», or a «delete for everyone» that arrived. */
  deleted?: true;
  /** ms epoch, the sender's phone. */
  at: number;
}

export type ChatStore = Record<string, ChatMessage>;

export function repConv(repId: string): string {
  return `rep:${repId}`;
}

export function repIdOfConv(conv: string): string | null {
  return conv.startsWith("rep:") ? conv.slice(4) || null : null;
}

function randomId(): string {
  const bytes = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(12)) : Uint8Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isChatAudio(audio: unknown): audio is string {
  return typeof audio === "string" && /^data:audio\/(webm|ogg|mp4|mpeg|aac)(;[^,]*)?;base64,[A-Za-z0-9+/=]+$/.test(audio) && audio.length <= MAX_CHAT_AUDIO;
}

function cleanSeconds(seconds: unknown): number | undefined {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? Math.min(MAX_VOICE_SECONDS, Math.round(seconds)) : undefined;
}

function cleanReply(reply: unknown): { id: string; by: string; preview: string } | undefined {
  const r = reply as { id?: unknown; by?: unknown; preview?: unknown } | null | undefined;
  if (!r || typeof r.id !== "string" || !/^[0-9a-f]{8,40}$/.test(r.id)) return undefined;
  return { id: r.id, by: typeof r.by === "string" ? r.by.slice(0, 60) : "", preview: typeof r.preview === "string" ? r.preview.slice(0, 120) : "" };
}

function cleanId(id: unknown): string | undefined {
  return typeof id === "string" && /^[0-9a-f]{8,40}$/.test(id) ? id : undefined;
}

function cleanCall(call: unknown): { id: string } | undefined {
  const id = (call as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" && /^[0-9a-f]{8,40}$/.test(id) ? { id } : undefined;
}

/** 📄 A PDF only, small enough for the sealed document; its name kept short and plain. */
export function cleanFile(file: unknown): { name: string; size: number; data: string } | undefined {
  const f = file as { name?: unknown; data?: unknown } | null | undefined;
  if (!f || typeof f.data !== "string" || f.data.length > MAX_CHAT_FILE || !/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(f.data)) return undefined;
  const name = (typeof f.name === "string" ? f.name : "").replace(/[\\/:*?"<>|\n\r\t]/g, " ").trim().slice(0, 80) || "ملف.pdf";
  const base64 = f.data.length - f.data.indexOf(",") - 1;
  return { name, size: Math.round((base64 * 3) / 4), data: f.data };
}

export function isChatImage(image: unknown): image is string {
  return typeof image === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= MAX_CHAT_IMAGE;
}

/** A message to send; null when there is nothing (no text, no picture, no device). */
export function newChatMessage(
  input: {
    conv: string;
    from: "owner" | "rep";
    by: string;
    member?: string;
    text: string;
    image?: string | null;
    device?: { id: string; name: string } | null;
    audio?: string | null;
    seconds?: number;
    call?: { id: string } | null;
    reply?: { id: string; by: string; preview: string } | null;
    forwarded?: boolean;
    deleteOf?: string | null;
    file?: { name: string; data: string } | null;
    statementAsk?: boolean;
    op?: ChatOp | null;
    opRate?: ChatOpRate | null;
  },
  now = Date.now(),
  random: () => string = randomId,
): ChatMessage | null {
  // 💳 a card keeps the id its operation gives it (the same operation = the same message, never two)
  const op = input.from === "owner" && input.conv !== TEAM_CONV ? cleanChatOp(input.op) : undefined;
  if (op) {
    return { id: chatOpMessageId(op.token), conv: input.conv, from: "owner", by: input.by.trim().slice(0, 60) || "المسؤول", ...(input.member ? { member: input.member } : {}), text: chatOpText(op), op, at: now };
  }
  const opRate = input.from === "rep" ? cleanChatOpRate(input.opRate) : undefined;
  if (opRate) {
    // «❌ غير جيد» is said in words too (the background notification shows it); «✅ جيد» stays quiet
    const text = opRate.verdict === "bad" ? `❌ غير جيد${opRate.note ? `: ${opRate.note}` : ""}` : "";
    return { id: random(), conv: input.conv, from: "rep", by: input.by.trim().slice(0, 60) || "المندوب", text, opRate, at: now };
  }
  const deleteOf = cleanId(input.deleteOf);
  if (deleteOf) {
    return { id: random(), conv: input.conv, from: input.from, by: input.by.trim().slice(0, 60) || "-", ...(input.member ? { member: input.member } : {}), text: "", deleteOf, at: now };
  }
  const call = cleanCall(input.call);
  const reply = cleanReply(input.reply);
  const statementAsk = input.statementAsk === true && input.from === "rep";
  const text = call ? CALL_TEXT : statementAsk ? STATEMENT_ASK_TEXT : input.text.replace(/\r/g, "").trim().slice(0, MAX_CHAT_TEXT);
  const file = cleanFile(input.file);
  const image = isChatImage(input.image) ? input.image : undefined;
  const device = input.device && input.device.id ? { id: input.device.id.slice(0, 120), name: (input.device.name || "جهاز").slice(0, 120) } : undefined;
  const audio = isChatAudio(input.audio) ? input.audio : undefined;
  const seconds = audio ? cleanSeconds(input.seconds) : undefined;
  if (!text && !image && !device && !audio && !file) return null;
  return {
    id: random(),
    conv: input.conv,
    from: input.from,
    by: input.by.trim().slice(0, 60) || (input.from === "rep" ? "المندوب" : "المسؤول"),
    ...(input.member ? { member: input.member } : {}),
    text,
    ...(image ? { image } : {}),
    ...(device ? { device } : {}),
    ...(audio ? { audio } : {}),
    ...(seconds ? { seconds } : {}),
    ...(call ? { call } : {}),
    ...(reply ? { reply } : {}),
    ...(input.forwarded ? { forwarded: true as const } : {}),
    ...(file ? { file } : {}),
    ...(statementAsk ? { statementAsk: true as const } : {}),
    at: now,
  };
}

/** An opened document → a message for THIS conversation, with sane fields (anything else is dropped). */
export function parseChatPayload(json: string, conv: string): ChatMessage | null {
  try {
    const p = JSON.parse(json) as Partial<ChatMessage>;
    if (typeof p.id !== "string" || !/^[0-9a-f]{8,40}$/.test(p.id)) return null;
    const from = p.from === "rep" ? "rep" : "owner";
    if (conv === TEAM_CONV && from !== "owner") return null;
    const text = typeof p.text === "string" ? p.text.trim().slice(0, MAX_CHAT_TEXT) : "";
    const image = isChatImage(p.image) ? p.image : undefined;
    const device = p.device && typeof p.device.id === "string" && p.device.id ? { id: p.device.id.slice(0, 120), name: typeof p.device.name === "string" ? p.device.name.slice(0, 120) : "جهاز" } : undefined;
    const audio = isChatAudio(p.audio) ? p.audio : undefined;
    const seconds = audio ? cleanSeconds(p.seconds) : undefined;
    const call = cleanCall(p.call);
    const reply = cleanReply(p.reply);
    const deleteOf = cleanId(p.deleteOf);
    const file = cleanFile(p.file);
    const statementAsk = p.statementAsk === true && from === "rep";
    const op = from === "owner" && conv !== TEAM_CONV ? cleanChatOp(p.op) : undefined;
    const opRate = from === "rep" ? cleanChatOpRate(p.opRate) : undefined;
    if (!text && !image && !device && !audio && !deleteOf && !file && !op && !opRate) return null;
    return {
      id: p.id,
      conv, // whichever channel it came on - never what the document claims
      from,
      by: typeof p.by === "string" && p.by.trim() ? p.by.trim().slice(0, 60) : from === "rep" ? "المندوب" : "المسؤول",
      ...(typeof p.member === "string" && p.member ? { member: p.member.slice(0, 60) } : {}),
      text,
      ...(image ? { image } : {}),
      ...(device ? { device } : {}),
      ...(audio ? { audio } : {}),
      ...(seconds ? { seconds } : {}),
      ...(call ? { call } : {}),
      ...(reply ? { reply } : {}),
      ...(p.forwarded === true ? { forwarded: true as const } : {}),
      ...(deleteOf ? { deleteOf } : {}),
      ...(file ? { file } : {}),
      ...(statementAsk ? { statementAsk: true as const } : {}),
      ...(op ? { op } : {}),
      ...(opRate ? { opRate } : {}),
      at: typeof p.at === "number" && Number.isFinite(p.at) ? p.at : Date.now(),
    };
  } catch {
    return null;
  }
}

/** The store with these messages added (one already here stays as it is); also which were new. */
export function addChatMessages(store: ChatStore, messages: ChatMessage[]): { store: ChatStore; added: ChatMessage[] } {
  const added = messages.filter((m) => !store[m.id]);
  if (added.length === 0) return { store, added };
  const next = { ...store };
  for (const m of added) next[m.id] = m;
  return { store: next, added }; // 💾 nothing is ever dropped (his Nov 8 2026 choice)
}

/** The same sender (a «delete for everyone» counts only from whoever wrote the message). */
function sameSender(a: Pick<ChatMessage, "from" | "member" | "by">, b: Pick<ChatMessage, "from" | "member" | "by">): boolean {
  if (a.from !== b.from) return false;
  if (a.member || b.member) return a.member === b.member;
  return a.from === "rep" || a.by === b.by;
}

/** 💬 What the conversation shows, oldest first: no control messages; a message its sender deleted for everyone (or
 * deleted here) becomes «🚫 حُذفت هذه الرسالة» without its content. */
export function visibleMessages(store: ChatStore, conv: string): ChatMessage[] {
  const all = messagesOf(store, conv);
  const controls = all.filter((m) => m.deleteOf);
  return all
    .filter((m) => !m.deleteOf && !m.opRate)
    .map((m) => {
      const gone = m.deleted || controls.some((c) => c.deleteOf === m.id && sameSender(c, m));
      if (!gone) return m;
      return { id: m.id, conv: m.conv, from: m.from, by: m.by, ...(m.member ? { member: m.member } : {}), text: "", deleted: true as const, at: m.at };
    });
}

/** 🗑️ «حذف عندي»: the message stays as a mark (so it never comes back from the listener) without its content. */
export function deleteForMe(store: ChatStore, id: string): ChatStore {
  const m = store[id];
  if (!m) return store;
  return { ...store, [id]: { id: m.id, conv: m.conv, from: m.from, by: m.by, ...(m.member ? { member: m.member } : {}), text: "", deleted: true, at: m.at } };
}

/** ↩️ The quote of a message for a reply. */
export function replyOf(m: Pick<ChatMessage, "id" | "by" | "text" | "image" | "device" | "audio">): { id: string; by: string; preview: string } {
  return { id: m.id, by: m.by, preview: messagePreview(m).slice(0, 120) };
}

// ---- ✓✓ read ----

/** Who reads on this side of a conversation: a team member's id, or «owner» / «rep» with a rep. */
export function readerId(conv: string, side: { rep: boolean; memberId: string }): string {
  if (side.rep) return "rep";
  return conv === TEAM_CONV ? side.memberId || "owner" : "owner";
}

/** conv → reader → the time of the last message that reader saw. */
export type ChatSeen = Record<string, Record<string, number>>;

/** ✓✓ blue: another reader of the conversation saw this message of mine. */
export function isReadByOthers(m: Pick<ChatMessage, "conv" | "at">, seen: ChatSeen, me: string): boolean {
  return Object.entries(seen[m.conv] ?? {}).some(([who, at]) => who !== me && at >= m.at);
}

/** A day line between messages: «اليوم», «أمس», or the date. */
export function dayLabel(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(n)) return "اليوم";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key(d) === key(y)) return "أمس";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** A steady color per sender's name (WhatsApp's group names): a hue from the name. */
export function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** One conversation, oldest first. */
export function messagesOf(store: ChatStore, conv: string): ChatMessage[] {
  return Object.values(store)
    .filter((m) => m.conv === conv)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** A message I sent (on this phone's side of the conversation). */
export function isMine(m: Pick<ChatMessage, "conv" | "from" | "member">, side: { rep: boolean; memberId: string }): boolean {
  if (side.rep) return m.from === "rep";
  if (m.conv === TEAM_CONV) return Boolean(m.member) && m.member === side.memberId;
  return m.from === "owner";
}

/** conv → the time of the last message I saw there. */
export type ChatRead = Record<string, number>;

export function unreadCount(store: ChatStore, conv: string, read: ChatRead, side: { rep: boolean; memberId: string }): number {
  const since = read[conv] ?? 0;
  return visibleMessages(store, conv).filter((m) => m.at > since && !isMine(m, side) && !m.deleted).length;
}

/** The line under a conversation / in a notification: «📷 صورة», «📡 DEMO 1», or the text. */
export function messagePreview(m: Pick<ChatMessage, "text" | "image" | "device" | "audio"> & { deleted?: boolean; file?: { name: string }; stored?: ChatMessage["stored"] }): string {
  if (m.deleted) return "🚫 حُذفت هذه الرسالة";
  if (m.text) return m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text;
  if (hasAudio(m)) return "🎤 رسالة صوتية";
  if (hasImage(m)) return "📷 صورة";
  if (m.file) return `📄 ${m.file.name}`;
  if (m.device) return `📡 ${m.device.name}`;
  return "";
}

/** «💬 المسؤول 2: الطبق لا يتصل» - the phone notification. */
export function chatNotification(m: Pick<ChatMessage, "by" | "text" | "image" | "device" | "audio"> & { file?: { name: string }; stored?: ChatMessage["stored"] }): string {
  return `💬 ${m.by}: ${messagePreview(m)}`;
}

/** «14:05» today, «أمس 14:05», else «2026/11/02 14:05». */
export function chatTime(at: number, now: number): string {
  const d = new Date(at);
  const n = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(n)) return hm;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (day(d) === day(y)) return `أمس ${hm}`;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

/** The `at` field the documents are queried by: zero-padded so text order = time order. */
export function chatAtKey(at: number): string {
  return String(Math.max(0, Math.floor(at))).padStart(15, "0");
}

export function chatCollection(spaceId: string): string {
  return `starnet/${spaceId}/chat`;
}

// ---- 💾 media in their own store ----

/** What of a message lives in the chat media store. */
export interface ChatMediaPayload {
  image?: string;
  audio?: string;
  file?: string;
}

export function chatMediaKey(id: string): string {
  return `chatmedia:${id}`;
}

export function hasImage(m: Pick<ChatMessage, "image"> & { stored?: ChatMessage["stored"] }): boolean {
  return Boolean(m.image) || Boolean(m.stored?.includes("image"));
}

export function hasAudio(m: Pick<ChatMessage, "audio"> & { stored?: ChatMessage["stored"] }): boolean {
  return Boolean(m.audio) || Boolean(m.stored?.includes("audio"));
}

/** The message without its picture / voice / file data (they go to the media store), or null when it carries none. */
export function stripChatMedia(m: ChatMessage): { message: ChatMessage; payload: ChatMediaPayload } | null {
  const payload: ChatMediaPayload = {};
  if (m.image) payload.image = m.image;
  if (m.audio) payload.audio = m.audio;
  if (m.file?.data) payload.file = m.file.data;
  const kinds = Object.keys(payload) as ("image" | "audio" | "file")[];
  if (kinds.length === 0) return null;
  const { image: _i, audio: _a, ...rest } = m;
  const message: ChatMessage = { ...rest, ...(m.file ? { file: { name: m.file.name, size: m.file.size } } : {}), stored: [...new Set([...(m.stored ?? []), ...kinds])] };
  return { message, payload };
}

/** The message with its media back (to show, forward, send again). */
export function withChatMedia(m: ChatMessage, payload: ChatMediaPayload | null | undefined): ChatMessage {
  if (!payload) return m;
  return {
    ...m,
    ...(payload.image ? { image: payload.image } : {}),
    ...(payload.audio ? { audio: payload.audio } : {}),
    ...(payload.file && m.file ? { file: { ...m.file, data: payload.file } } : {}),
  };
}

// ---- stores ----

const KEY = "starnet_chat_v1";
const READ_KEY = "starnet.chatRead";
const SEEN_KEY = "starnet.chatSeen";
export const CHAT_EVENT = "starnet:chat";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadChat(): ChatStore {
  return readJson<ChatStore>(KEY, {});
}

export function saveChat(store: ChatStore): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(CHAT_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function loadChatRead(): ChatRead {
  return readJson<ChatRead>(READ_KEY, {});
}

export function markChatRead(conv: string, at: number): void {
  try {
    const read = loadChatRead();
    if ((read[conv] ?? 0) >= at) return;
    window.localStorage.setItem(READ_KEY, JSON.stringify({ ...read, [conv]: at }));
    window.dispatchEvent(new Event(CHAT_EVENT));
  } catch {
    // storage full
  }
}

export function loadChatSeen(): ChatSeen {
  return readJson<ChatSeen>(SEEN_KEY, {});
}

/** ✓✓ What another reader saw (from the conversation's `chatRead` documents). */
export function saveChatSeen(conv: string, who: string, at: number): void {
  try {
    const seen = loadChatSeen();
    if ((seen[conv]?.[who] ?? 0) >= at) return;
    window.localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen, [conv]: { ...(seen[conv] ?? {}), [who]: at } }));
    window.dispatchEvent(new Event(CHAT_EVENT));
  } catch {
    // storage full
  }
}

