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
  /** 👥 An alert from a member of the link team (his Nov 7 2026 ask «لكل المسؤولين أن يضيفوا تنبيهًا على الأجهزة»):
   * the member's name - `repId` is then empty. */
  by?: string;
  /** 🔴 urgent / 🟡 normal (a team alert; a rep's warning has none). */
  level?: FlagLevel;
}

export type FlagLevel = "urgent" | "normal";

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

/** Not reviewed yet - 🔴 urgent first, then newest first - the red bar's list. */
export function openOwnerFlags(store: OwnerFlagStore): OwnerFlag[] {
  return Object.values(store)
    .filter((f) => !f.reviewedAt)
    .sort((a, b) => Number(b.level === "urgent") - Number(a.level === "urgent") || b.at - a.at);
}

/** 👥 A team member's alert on a device (from its card's ⋯ or its browser's 🚩); null when there is nothing to say. */
export function newTeamFlag(
  input: { deviceId: string; deviceName: string; email?: string; note: string; level: FlagLevel; by: string },
  now = Date.now(),
  random: () => string = randomId,
): OwnerFlag | null {
  const base = newRepFlag({ repId: "", deviceId: input.deviceId, deviceName: input.deviceName, email: input.email, note: input.note }, now, random);
  if (!base) return null;
  return { ...base, receivedAt: now, by: input.by.trim() || "مسؤول", level: input.level };
}

/** 🚩 from a device's browser (staged there as a read, `fields.teamFlag`): the alerts, by whoever this phone is, and
 * every such read handled (to acknowledge). The read's id is the alert's - a second drain adds nothing. */
export function teamFlagsFromBrowser(
  syncs: { syncId: string; accountId: string; fields: { teamFlag?: { note?: string; level?: string; at?: number } } }[],
  devices: { id: string; name: string; email?: string }[],
  by: string,
): { flags: OwnerFlag[]; syncIds: string[] } {
  const flags: OwnerFlag[] = [];
  const syncIds: string[] = [];
  for (const sync of syncs) {
    const t = sync.fields?.teamFlag;
    if (!t) continue;
    syncIds.push(sync.syncId);
    const device = devices.find((d) => d.id === sync.accountId);
    if (!device) continue;
    const at = typeof t.at === "number" && t.at > 0 ? t.at : Date.now();
    const flag = newTeamFlag({ deviceId: device.id, deviceName: device.name, email: device.email, note: t.note ?? "", level: t.level === "urgent" ? "urgent" : "normal", by }, at, () => `browser-${sync.syncId}`);
    if (flag) flags.push(flag);
  }
  return { flags, syncIds };
}

export function isBrowserTeamFlag(sync: { fields?: { teamFlag?: unknown } }): boolean {
  return Boolean(sync.fields?.teamFlag);
}

/** A team alert is closed by YAHYA only (his Nov 7 2026 choice); a rep's warning, and anything on a phone that
 * isn't linked, by whoever sees it. */
export function canReviewFlag(flag: Pick<OwnerFlag, "repId" | "by">, linked: boolean, isMain: boolean): boolean {
  if (flag.repId || !flag.by) return true;
  return !linked || isMain;
}

/** «🔴 مسؤول 2: الطبق لا يتصل - DEMO 7» - the phone notification for a team alert. */
export function teamFlagMessage(flag: OwnerFlag): string {
  return `${flag.level === "urgent" ? "🔴" : "🟡"} 🚩 ${flag.by ?? "مسؤول"} - ${flag.deviceName}: ${flag.note}`;
}

/** The top bar's words: how many, the first device, 🔴 when one is urgent. */
export function flagsBarText(flags: OwnerFlag[]): string {
  if (!flags.length) return "";
  const urgent = flags.some((f) => f.level === "urgent") ? "🔴 " : "";
  const team = flags.every((f) => !f.repId);
  const reps = flags.every((f) => f.repId);
  const what = team ? "تنبيه من الفريق" : reps ? "تحذير من المندوب" : "تنبيه";
  return `${urgent}🚩 ${flags.length} ${what} · ${flags[0]!.deviceName}`;
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

// ---- operator: which rep's phone already has his channel ----

const LINK_SENT_KEY = "starnet.repFlagLinkSent";

/** repId → the channel space his last delivered copy carried. */
export function loadFlagLinkSent(): Record<string, string> {
  const s = read<Record<string, string>>(LINK_SENT_KEY, {});
  return s && typeof s === "object" ? s : {};
}

export function markFlagLinkSent(repId: string, spaceId: string): void {
  try {
    window.localStorage.setItem(LINK_SENT_KEY, JSON.stringify({ ...loadFlagLinkSent(), [repId]: spaceId }));
  } catch {
    // sent again next time
  }
}

/** True when the operator has a Firebase but this rep's phone hasn't got his channel yet. */
export function repNeedsFlagLink(repId: string, hasFirebase: boolean, sent: Record<string, string> = loadFlagLinkSent(), channels: Record<string, FlagChannel> = loadFlagChannels()): boolean {
  if (!hasFirebase) return false;
  const channel = channels[repId];
  return !channel || sent[repId] !== channel.spaceId;
}
