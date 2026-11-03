/**
 * 🚩 «تحذير المندوب» (his Nov 3 2026 ask): a rep puts a warning with a description on one of his
 * devices, in his own app, and it reaches the operator BY ITSELF - no file, no Telegram tap (his
 * choices: from his app, automatic, shown on top of every page + on the device card, gone when the
 * operator taps «✓ راجعته»).
 *
 * The way: the operator's own Firebase (the one of «🔗 ربط اللابتوب والهاتف»). Each rep gets a channel
 * - a random space + a 256-bit key - that travels in his copy (`RepCopy.flagLink`). His app writes
 * each warning, sealed with that key, to `starnet/<space>/flags/<id>`; the operator's app reads the
 * channel, opens it, keeps the warning here and deletes the document. Nothing else travels.
 *
 * Stores: the operator's warnings are business data (`starnet_rep_flags_v1`, in the backup); the
 * channels are secrets (`starnet.repFlagChannels`, phone only); the rep's outbox is his own
 * (`starnet_rep_flag_outbox_v1`). Pure helpers + small stores.
 */

export interface RepFlag {
  /** Random, from the rep's phone - the same warning read twice is one warning. */
  id: string;
  repId: string;
  deviceId: string;
  deviceName: string;
  email?: string;
  note: string;
  /** ms epoch, on the rep's phone */
  at: number;
}

export interface OwnerFlag extends RepFlag {
  receivedAt: number;
  /** «✓ راجعته» */
  reviewedAt?: number;
}

export type OwnerFlagStore = Record<string, OwnerFlag>;

export interface FlagChannel {
  spaceId: string;
  key: string;
}

/** What the rep's copy carries: the operator's Firebase + his channel. */
export interface FlagLink extends FlagChannel {
  apiKey: string;
  projectId: string;
}

export const MAX_FLAG_NOTE = 400;

export function flagCollection(spaceId: string): string {
  return `starnet/${spaceId}/flags`;
}

export function flagDocPath(spaceId: string, id: string): string {
  return `${flagCollection(spaceId)}/${id}`;
}

/** A new warning on the rep's phone; null when there is nothing to say. */
export function newRepFlag(input: { repId: string; deviceId: string; deviceName: string; email?: string; note: string }, now = Date.now(), random: () => string = randomId): RepFlag | null {
  const note = input.note.trim().slice(0, MAX_FLAG_NOTE);
  if (!note || !input.deviceId) return null;
  return {
    id: random(),
    repId: input.repId,
    deviceId: input.deviceId,
    deviceName: input.deviceName.trim() || input.email?.trim() || "جهاز",
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    note,
    at: now,
  };
}

function randomId(): string {
  const bytes = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(12)) : Uint8Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The opened document → a warning, only for THIS channel's rep and with sane fields. */
export function parseFlagPayload(json: string, repId: string): RepFlag | null {
  try {
    const p = JSON.parse(json) as Partial<RepFlag>;
    if (typeof p.id !== "string" || !/^[0-9a-f]{8,40}$/.test(p.id)) return null;
    if (typeof p.deviceId !== "string" || !p.deviceId || typeof p.note !== "string" || !p.note.trim()) return null;
    return {
      id: p.id,
      repId, // whoever the channel belongs to - never what the document claims
      deviceId: p.deviceId.slice(0, 120),
      deviceName: typeof p.deviceName === "string" && p.deviceName.trim() ? p.deviceName.trim().slice(0, 120) : "جهاز",
      ...(typeof p.email === "string" && p.email.trim() ? { email: p.email.trim().slice(0, 200) } : {}),
      note: p.note.trim().slice(0, MAX_FLAG_NOTE),
      at: typeof p.at === "number" && Number.isFinite(p.at) ? p.at : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Adds what came in (a warning already here is kept as it is). Returns the new ones too. */
export function addIncomingFlags(store: OwnerFlagStore, flags: RepFlag[], now = Date.now()): { store: OwnerFlagStore; added: OwnerFlag[] } {
  const next = { ...store };
  const added: OwnerFlag[] = [];
  for (const f of flags) {
    if (next[f.id]) continue;
    const owner: OwnerFlag = { ...f, receivedAt: now };
    next[f.id] = owner;
    added.push(owner);
  }
  return { store: added.length ? next : store, added };
}

/** Not reviewed yet, newest first - the red bar's list. */
export function openOwnerFlags(store: OwnerFlagStore): OwnerFlag[] {
  return Object.values(store)
    .filter((f) => !f.reviewedAt)
    .sort((a, b) => b.at - a.at);
}

/** The open warnings of one device (its card's red line). */
export function openFlagsForDevice(store: OwnerFlagStore, deviceId: string): OwnerFlag[] {
  return openOwnerFlags(store).filter((f) => f.deviceId === deviceId);
}

export function markOwnerFlagReviewed(store: OwnerFlagStore, id: string, now = Date.now()): OwnerFlagStore {
  const f = store[id];
  if (!f || f.reviewedAt) return store;
  return { ...store, [id]: { ...f, reviewedAt: now } };
}

/** What goes to the operator's own bot when a warning arrives. */
export function ownerFlagMessage(flag: RepFlag, repName: string): string {
  return [`🚩 تحذير من المندوب ${repName || ""}`.trim(), `📡 ${flag.deviceName}${flag.email && flag.email !== flag.deviceName ? ` · ${flag.email}` : ""}`, `📝 ${flag.note}`].join("\n");
}

/** What the rep is told once the operator reviewed it. */
export function repReviewedMessage(flag: RepFlag): string {
  return `✓ راجع المسؤول تحذيرك على ${flag.deviceName}\n📝 ${flag.note}`;
}

// ---- the rep's outbox ----

export interface OutboxItem {
  flag: RepFlag;
  /** When it reached the operator's Firebase. */
  sentAt?: number;
}

export function queueFlag(outbox: OutboxItem[], flag: RepFlag): OutboxItem[] {
  return [...outbox.filter((i) => i.flag.id !== flag.id), { flag }].slice(-200);
}

export function markFlagSent(outbox: OutboxItem[], id: string, now = Date.now()): OutboxItem[] {
  return outbox.map((i) => (i.flag.id === id && !i.sentAt ? { ...i, sentAt: now } : i));
}

export function unsentFlags(outbox: OutboxItem[]): RepFlag[] {
  return outbox.filter((i) => !i.sentAt).map((i) => i.flag);
}

/** The rep's own warnings on one device, newest first (shown in his sheet). */
export function outboxForDevice(outbox: OutboxItem[], deviceId: string): OutboxItem[] {
  return outbox.filter((i) => i.flag.deviceId === deviceId).sort((a, b) => b.flag.at - a.flag.at);
}

// ---- storage ----

const OWNER_KEY = "starnet_rep_flags_v1";
const OUTBOX_KEY = "starnet_rep_flag_outbox_v1";
const CHANNELS_KEY = "starnet.repFlagChannels";
export const REP_FLAGS_CHANGED = "starnet:rep-flags";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(REP_FLAGS_CHANGED));
  } catch {
    // storage full - the banner (StorageFullBanner) says so
  }
}

export function loadOwnerFlags(): OwnerFlagStore {
  const s = read<OwnerFlagStore>(OWNER_KEY, {});
  return s && typeof s === "object" && !Array.isArray(s) ? s : {};
}

export function saveOwnerFlags(store: OwnerFlagStore): void {
  write(OWNER_KEY, store);
}

export function loadOutbox(): OutboxItem[] {
  const s = read<OutboxItem[]>(OUTBOX_KEY, []);
  return Array.isArray(s) ? s : [];
}

export function saveOutbox(outbox: OutboxItem[]): void {
  write(OUTBOX_KEY, outbox);
}

export function loadFlagChannels(): Record<string, FlagChannel> {
  const s = read<Record<string, FlagChannel>>(CHANNELS_KEY, {});
  return s && typeof s === "object" ? s : {};
}

/** The rep's channel, made once (a random space + key). */
export function ensureFlagChannel(repId: string, make: () => FlagChannel): FlagChannel {
  const all = loadFlagChannels();
  if (all[repId]) return all[repId]!;
  const channel = make();
  try {
    window.localStorage.setItem(CHANNELS_KEY, JSON.stringify({ ...all, [repId]: channel }));
  } catch {
    // not saved - the next copy makes another one
  }
  return channel;
}

/** 🚩 The operator's Firebase (the team link, else the older live link) - where the channels live. */
export function ownerFirebase(load: { link: () => { apiKey: string; projectId: string } | null; live: () => { apiKey: string; projectId: string } | null }): { apiKey: string; projectId: string } | null {
  const c = load.link() ?? load.live();
  return c && c.apiKey && c.projectId ? { apiKey: c.apiKey, projectId: c.projectId } : null;
}
