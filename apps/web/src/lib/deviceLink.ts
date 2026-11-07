/**
 * 🔗 The link over HIS Firebase (his Oct 24 2026 choice: two ways, his own project) - since Oct 31 2026 a **team**
 * («المسؤول 2»: his phone, the laptop and a second admin's phone, each a full copy, each change reaching all): the
 * pairing code, what each member remembers, and one round (`runLinkRound`) - send what changed here, apply what every
 * other member changed (lib/deviceSync.ts), all encrypted (lib/deviceSyncCrypto.ts).
 *
 * Firestore: starnet/{space}/link/{member} → { seq, ack, at } (that member's head),
 * starnet/{space}/link/{member}/batches/{seq} → { iv, data } (its changes, in order) and
 * starnet/{space}/team/members → { iv, data } (who is in the team, sealed). The first two members of an older link
 * are «phone» and «laptop» (their old paths). Settings live in `starnet.*` (never in a backup, never in the repo).
 */

import { baselineOf, diff, flattenAll, flattenKey, merge, nextBaseline, unflattenKey, type Baseline, type FlatData, type HeldDeletion, type SyncConflict, type SyncOp } from "./deviceSync";
import { isLinkKey, newLinkKey, openText, sealText } from "./deviceSyncCrypto";
import { readDocument, writeDocument, type FetchFn } from "./firestoreRest";
import { COUNTED_STORES, describeOp, isNotableStore, nextOrigins, type Origin, type TeamActivity } from "./teamActivity";
import { checkConfigInput, newSpaceId } from "./liveSyncConfig";

export type LinkRole = "phone" | "laptop";

export interface LinkConfig {
  apiKey: string;
  projectId: string;
  spaceId: string;
  key: string;
  /** This member's id - «phone» / «laptop» for the two of an older link, random for the others. */
  memberId: string;
  /** His name for it («هاتفي»، «اللابتوب»، «المسؤول 2») - shown on what it recorded. */
  name: string;
  /** The older link's role (kept so an older config still reads). */
  role?: LinkRole;
  enabled: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  /** When it joined (ISO). */
  at: string;
}

export interface LinkState {
  /** My last batch number. */
  seq: number;
  /** The older link: the other side's last batch I applied (read into `cursors`). */
  cursor: number;
  /** Each other member's last batch I applied. */
  cursors: Record<string, number>;
  /** Stores whose mass deletion he confirmed (sent on the next round, then forgotten). */
  confirmed: string[];
  held: HeldDeletion[];
  lastAt?: string;
  lastOk?: boolean;
  lastMessage?: string;
  /** 📥 Receiving: batches read of all the other members' / how many they wrote (the copy's %). */
  progress?: { done: number; total: number };
  /** 🔢 How many records each counted store has here, and at each other member (from its head) - the copy's check. */
  counts?: Record<string, number>;
  theirCounts?: Record<string, { counts: Record<string, number>; at: string }>;
}

/** ⭐ The main member: the phone that made the link (YAHYA) - his Nov 6 2026 choice. */
export const MAIN_MEMBER = "phone";

export function isMainMember(memberId: string): boolean {
  return memberId === MAIN_MEMBER;
}

/** 🗑️ A deletion another member made, held on YAHYA until he decides (his Nov 6 2026 choice «الحذف من المسؤول 2
 * يحتاج موافقتي»). One per round of that member: the deletions of things / money, with what was deleted along with
 * them (a payment's cash entries…). */
export interface PendingDeletion {
  /** `<member>|<at>` */
  id: string;
  by: string;
  byName: string;
  at: string;
  ops: SyncOp[];
  /** «📡 جهاز X» / «💵 عملية 5,000 أوقية» - what he reads. */
  labels: string[];
}

export interface StoredConflict extends SyncConflict {
  seenAt: string;
}

export interface LinkStorage {
  /** Every business store (`starnet_*`): key → stored text. */
  readAll(): Record<string, string>;
  read(key: string): string | null;
  write(key: string, value: string | null): void;
  /** Settings of the link itself (`starnet.deviceLink*`). */
  getSetting(key: string): string | null;
  setSetting(key: string, value: string | null): void;
}

const CONFIG = "starnet.deviceLink";
const STATE = "starnet.deviceLinkState";
const BASE = "starnet.deviceLinkBase";
const CONFLICTS = "starnet.deviceLinkConflicts";
const TEAM = "starnet.deviceLinkTeam";
const ORIGINS = "starnet.deviceLinkOrigins";
const LOG = "starnet.deviceLinkLog";
const PENDING = "starnet.deviceLinkPendingDeletes";
const LOG_SIZE = 300;
/** The team list is read again this often (Firebase's free reads are counted per day) - a member who just joined
 * is seen within a minute (his Nov 5 2026 «ليس بالسرعة المطلوبة»). */
const TEAM_EVERY_MS = 60_000;
const CODE_PREFIX = "STARNET-LINK-";
/** Firestore's document limit is 1 MiB - a batch's JSON stays well under it (base64 adds a third). */
const BATCH_CHARS = 550_000;
const MAX_BATCHES_PER_ROUND = 50;
/** One record bigger than this (a rep's «تسجيلاتي» file with its Starlink sessions) goes out in parts - a
 * single batch over Firestore's 1 MiB was refused, and the rep's devices never reached «المسؤول 2» (his
 * Nov 5 2026 report). */
const PART_CHARS = 400_000;
/** Reading never stops in the middle of a record's parts - up to this many batches more. */
const MAX_PART_BATCHES = 400;

const headPath = (c: LinkConfig, member: string) => `starnet/${c.spaceId}/link/${member}`;
const batchPath = (c: LinkConfig, member: string, seq: number) => `starnet/${c.spaceId}/link/${member}/batches/${seq}`;
const teamPath = (c: LinkConfig) => `starnet/${c.spaceId}/team/members`;
/** An older link's two members, before anyone wrote the team list. */
const LEGACY_TEAM: TeamMember[] = [
  { id: "phone", name: "الهاتف", at: "" },
  { id: "laptop", name: "اللابتوب", at: "" },
];

/** A new member's id. */
function newMemberId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return "m" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function parse<T>(text: string | null, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadLinkConfig(s: LinkStorage): LinkConfig | null {
  const c = parse<Partial<LinkConfig> | null>(s.getSetting(CONFIG), null);
  if (!c || !c.apiKey || !c.projectId || !c.spaceId || !c.key) return null;
  // an older phone / laptop config: its role is its member id
  const memberId = c.memberId || (c.role === "phone" || c.role === "laptop" ? c.role : "");
  if (!memberId) return null;
  const name = c.name || (memberId === "phone" ? "الهاتف" : memberId === "laptop" ? "اللابتوب" : "عضو");
  return { ...(c as LinkConfig), memberId, name, enabled: c.enabled !== false };
}

export function saveLinkConfig(s: LinkStorage, config: LinkConfig | null): void {
  s.setSetting(CONFIG, config ? JSON.stringify(config) : null);
}

export function loadLinkState(s: LinkStorage): LinkState {
  const st: LinkState = { seq: 0, cursor: 0, cursors: {}, confirmed: [], held: [], ...parse<Partial<LinkState>>(s.getSetting(STATE), {}) };
  // the older link kept one cursor, for the other side
  if (st.cursor > 0 && Object.keys(st.cursors).length === 0) {
    const config = loadLinkConfig(s);
    const theirs = config?.memberId === "phone" ? "laptop" : config?.memberId === "laptop" ? "phone" : null;
    if (theirs) st.cursors = { [theirs]: st.cursor };
  }
  return st;
}

/** 🔗 «سجّله <name>»: what another member added or changed, by record (`<key>|<record id>`). */
export function loadOrigins(s: LinkStorage): Record<string, Origin> {
  return parse<Record<string, Origin>>(s.getSetting(ORIGINS), {});
}

/** «ماذا وصل منه»: the latest changes from the other members, newest first. */
export function loadActivityLog(s: LinkStorage): TeamActivity[] {
  return parse<TeamActivity[]>(s.getSetting(LOG), []);
}

/** The team as last read (this phone's copy). */
export function loadTeam(s: LinkStorage): TeamMember[] {
  return parse<{ members?: TeamMember[] }>(s.getSetting(TEAM), {}).members ?? [];
}

function saveLinkState(s: LinkStorage, state: LinkState): void {
  s.setSetting(STATE, JSON.stringify(state));
}

export function loadConflicts(s: LinkStorage): StoredConflict[] {
  return parse<StoredConflict[]>(s.getSetting(CONFLICTS), []);
}

export function clearConflicts(s: LinkStorage): void {
  s.setSetting(CONFLICTS, null);
}

/** 🗑️ Deletions from the other members waiting for YAHYA, oldest first. */
export function loadPendingDeletions(s: LinkStorage): PendingDeletion[] {
  return parse<PendingDeletion[]>(s.getSetting(PENDING), []);
}

/** ✓ «احذفها»: the held deletions go in here (and out to the rest of the team on the next round). Returns the stores
 * that changed (the page reloads them). */
export function approvePendingDeletion(s: LinkStorage, id: string): string[] {
  const all = loadPendingDeletions(s);
  const item = all.find((p) => p.id === id);
  if (!item) return [];
  const changed = new Set<string>();
  for (const op of item.ops) {
    const raw = s.read(op.k);
    if (raw === null) continue;
    const flat = flattenKey(raw, op.s);
    if (op.v === null) {
      if (!(op.r in flat.records)) continue;
      delete flat.records[op.r];
    } else {
      flat.records[op.r] = op.v;
      if (!flat.order.includes(op.r)) flat.order.push(op.r);
    }
    s.write(op.k, unflattenKey(flat));
    changed.add(op.k);
  }
  // he decided: a store's many deletions at once are not held again
  const st = loadLinkState(s);
  saveLinkState(s, { ...st, confirmed: [...new Set([...st.confirmed, ...changed])] });
  s.setSetting(PENDING, JSON.stringify(all.filter((p) => p.id !== id)));
  return [...changed];
}

/** ✗ «أبقِها»: nothing is deleted here, and these records go out again - the member who deleted them gets them back. */
export function rejectPendingDeletion(s: LinkStorage, id: string): void {
  const all = loadPendingDeletions(s);
  const item = all.find((p) => p.id === id);
  if (!item) return;
  const base = parse<Baseline>(s.getSetting(BASE), {});
  for (const op of item.ops) delete base[op.k]?.hashes[op.r];
  s.setSetting(BASE, JSON.stringify(base));
  s.setSetting(PENDING, JSON.stringify(all.filter((p) => p.id !== id)));
}

/** Forget everything the link knew (unlink, or before a new pairing). */
export function resetLink(s: LinkStorage): void {
  for (const key of [CONFIG, STATE, BASE, CONFLICTS, TEAM, ORIGINS, LOG, PENDING]) s.setSetting(key, null);
}

/** The phone makes the link (his Firebase + a new space + a new key). */
export function newPhoneLink(apiKey: string, projectId: string): { ok: true; config: LinkConfig } | { ok: false; message: string } {
  const checked = checkConfigInput(apiKey, projectId);
  if (!checked.ok) return checked;
  return { ok: true, config: { apiKey: checked.apiKey, projectId: checked.projectId, spaceId: newSpaceId(), key: newLinkKey(), memberId: "phone", name: "هاتفي", enabled: true } };
}

/** «📋 رمز الربط»: everything a new member (the laptop, «المسؤول 2»…) needs, in one line to paste. Any member can give it. */
export function linkCode(config: LinkConfig): string {
  const json = JSON.stringify({ a: config.apiKey, p: config.projectId, s: config.spaceId, k: config.key });
  return CODE_PREFIX + btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readLinkCode(code: string): { ok: true; config: LinkConfig } | { ok: false; message: string } {
  const text = code.trim().replace(/\s+/g, "");
  if (!text.startsWith(CODE_PREFIX)) return { ok: false, message: "هذا ليس رمز ربط - انسخه من الهاتف: الإعدادات ← «🔗 ربط اللابتوب» ← «📋 نسخ رمز الربط»" };
  try {
    const b64 = text.slice(CODE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const v = JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4))) as { a?: string; p?: string; s?: string; k?: string };
    const checked = checkConfigInput(v.a ?? "", v.p ?? "");
    if (!checked.ok || !v.s || !/^[0-9a-f]{24}$/.test(v.s) || !isLinkKey(v.k ?? "")) return { ok: false, message: "رمز الربط ناقص - انسخه كاملًا من الهاتف" };
    return { ok: true, config: { apiKey: checked.apiKey, projectId: checked.projectId, spaceId: v.s, key: v.k!, memberId: newMemberId(), name: "عضو جديد", enabled: true } };
  } catch {
    return { ok: false, message: "رمز الربط ناقص - انسخه كاملًا من الهاتف" };
  }
}

/** A change on the wire: a whole one, or one part of a big one (`p`: its parts' id, this part's index, how many). */
export type WireOp = SyncOp & { p?: { id: string; i: number; n: number } };

function partId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A change too big for one batch → its parts (in order); a small one stays as it is. */
export function splitOp(op: SyncOp, part = PART_CHARS, id: () => string = partId): WireOp[] {
  if (op.v === null || op.v.length <= part) return [op];
  const n = Math.ceil(op.v.length / part);
  const pid = id();
  return Array.from({ length: n }, (_, i) => ({ ...op, v: op.v!.slice(i * part, (i + 1) * part), p: { id: pid, i, n } }));
}

/** Splits changes into batches small enough for one Firestore document each (a big change in parts). */
export function chunkOps(ops: SyncOp[], limit = BATCH_CHARS, part = PART_CHARS): WireOp[][] {
  const out: WireOp[][] = [];
  let current: WireOp[] = [];
  let size = 2;
  for (const op of ops.flatMap((o) => splitOp(o, part))) {
    const len = JSON.stringify(op).length + 1;
    if (current.length > 0 && size + len > limit) {
      out.push(current);
      current = [];
      size = 2;
    }
    current.push(op);
    size += len;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * One member's batches as read (each with its number) → whole changes: the parts of a big one joined back.
 * `complete`: every batch up to his head was read. A record whose parts are not all here yet is left for the
 * next round (`cursor` goes back to before its first part) - unless he finished writing (`complete`): then its
 * missing parts were never written (his round failed half way; it went out again whole, under a new id).
 */
export function joinParts(read: { seq: number; ops: WireOp[] }[], cursor: number, complete: boolean): { ops: SyncOp[]; cursor: number } {
  const groups = new Map<string, { first: number; parts: (string | undefined)[] }>();
  for (const b of read) {
    for (const op of b.ops) {
      if (!op.p) continue;
      const g = groups.get(op.p.id) ?? { first: b.seq, parts: Array.from({ length: op.p.n }) };
      g.parts[op.p.i] = op.v ?? "";
      groups.set(op.p.id, g);
    }
  }
  let until = cursor;
  if (!complete) {
    for (const g of groups.values()) if (g.parts.some((x) => x === undefined)) until = Math.min(until, g.first - 1);
  }
  const ops: SyncOp[] = [];
  for (const b of read) {
    if (b.seq > until) break;
    for (const op of b.ops) {
      if (!op.p) {
        ops.push(op);
        continue;
      }
      const g = groups.get(op.p.id)!;
      // the whole change, once - where its last part came
      if (op.p.i !== op.p.n - 1 || g.parts.some((x) => x === undefined)) continue;
      const { p: _p, ...whole } = op;
      ops.push({ ...whole, v: g.parts.join("") });
    }
  }
  return { ops, cursor: until };
}

/** A device going to the trash (`deletedAt` newly set) - a deletion to him. */
function isTrashing(op: SyncOp, before: string | undefined): boolean {
  if (op.k !== "starnet_demo_accounts_v1" || op.v === null || before === undefined) return false;
  try {
    return !(JSON.parse(before) as { deletedAt?: unknown }).deletedAt && Boolean((JSON.parse(op.v) as { deletedAt?: unknown }).deletedAt);
  } catch {
    return false;
  }
}

/**
 * 🗑️ On YAHYA: the other members' rounds that delete a thing or money here (or send a device to the trash) are held -
 * all their deletions together, what was deleted along with it too; their other changes go in as usual.
 */
export function holdDeletions(remoteOps: (SyncOp & { by: string })[], here: FlatData, nameOf: (id: string) => string): { apply: (SyncOp & { by: string })[]; held: PendingDeletion[] } {
  const groups = new Map<string, (SyncOp & { by: string })[]>();
  for (const op of remoteOps) {
    const id = `${op.by}|${op.at}`;
    groups.set(id, [...(groups.get(id) ?? []), op]);
  }
  const heldIds = new Set<string>();
  const held: PendingDeletion[] = [];
  for (const [id, ops] of groups) {
    const before = (op: SyncOp) => here[op.k]?.records[op.r];
    const notable = ops.filter((op) => (op.v === null && isNotableStore(op.k) && before(op) !== undefined) || isTrashing(op, before(op)));
    if (notable.length === 0 || isMainMember(ops[0]!.by)) continue;
    const hold = ops.filter((op) => op.v === null || isTrashing(op, before(op)));
    for (const op of hold) heldIds.add(`${id}|${op.k}|${op.r}`);
    // a record posted from another one (a payment's cash entry) goes with it, unnamed
    const posted = (op: SyncOp) => /"sourceId"\s*:\s*"[^"]/.test(before(op) ?? "");
    const labels = notable.filter((op) => !posted(op)).map((op) => describeOp({ ...op, v: null }, before(op), nameOf(op.by))?.label).filter((l): l is string => Boolean(l));
    held.push({ id, by: ops[0]!.by, byName: nameOf(ops[0]!.by), at: ops[0]!.at, ops: hold.map(({ by: _by, ...op }) => op), labels });
  }
  return { apply: remoteOps.filter((op) => !heldIds.has(`${op.by}|${op.at}|${op.k}|${op.r}`)), held };
}

/** 🔢 How many records each counted store has (a ledger's emptied-device marks don't count). */
export function storeCounts(data: FlatData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { k } of COUNTED_STORES) {
    const flat = data[k];
    out[k] = flat ? Object.keys(flat.records).filter((r) => !r.endsWith("\u001f")).length : 0;
  }
  return out;
}

/** ✅ / ⚠️ This phone against another member's counts: the stores that differ. */
export function compareCounts(mine: Record<string, number>, theirs: Record<string, number>): { k: string; label: string; mine: number; theirs: number }[] {
  return COUNTED_STORES.filter(({ k }) => (mine[k] ?? 0) !== (theirs[k] ?? 0)).map(({ k, label }) => ({ k, label, mine: mine[k] ?? 0, theirs: theirs[k] ?? 0 }));
}

export interface RoundResult {
  ok: boolean;
  message: string;
  sent: number;
  applied: number;
  /** Stores whose text changed here - the app must reload them. */
  changedKeys: string[];
  conflicts: number;
  held: HeldDeletion[];
  /** 👥 What the other members' changes were (a notification for the notable ones). */
  incoming: TeamActivity[];
  /** 🗑️ New deletions waiting for YAHYA. */
  pending?: number;
}

/** One round of the link. Never throws: a network / Firebase problem is the round's message. `sendOnly`: only
 * what changed here goes out (he is in the middle of something - nothing is written into his screens); the other
 * members' changes come in on the next full round. */
export async function runLinkRound(s: LinkStorage, fetchFn: FetchFn = fetch, now: Date = new Date(), opts: { sendOnly?: boolean } = {}): Promise<RoundResult> {
  const config = loadLinkConfig(s);
  const fail = (message: string): RoundResult => ({ ok: false, message, sent: 0, applied: 0, changedKeys: [], conflicts: 0, held: [], incoming: [] });
  if (!config || !config.enabled) return fail("الربط غير مفعّل");
  const state = loadLinkState(s);
  const at = now.toISOString();
  const baseline = parse<Baseline>(s.getSetting(BASE), {});
  const snapshot = s.readAll();
  const flat = flattenAll(snapshot, baseline);
  const confirmed = new Set(state.confirmed);
  const { ops: localOps, held } = diff(baseline, flat, at, confirmed);
  if (opts.sendOnly && localOps.length === 0) return { ok: state.lastOk !== false, message: state.lastMessage ?? "✓ متزامن", sent: 0, applied: 0, changedKeys: [], conflicts: 0, held, incoming: [] };

  // 0. The team (read again every few minutes; I add myself once).
  const team = await readTeam(s, config, fetchFn, now);
  if (!team.ok) return finish(fail(team.message));
  const others = opts.sendOnly ? [] : team.members.filter((m) => m.id !== config.memberId);

  // 1. What every other member sent since last time.
  const cursors: Record<string, number> = { ...state.cursors };
  const remoteOps: (SyncOp & { by: string })[] = [];
  const theirCounts = { ...(state.theirCounts ?? {}) };
  let seqTotal = 0;
  let seqDone = 0;
  let behind = false;
  for (const member of others) {
    const head = await readDocument(config, headPath(config, member.id), fetchFn);
    if (!head.ok) return finish(fail(head.message));
    const theirSeq = Number(head.value?.seq ?? 0);
    if (head.value?.sti) {
      try {
        theirCounts[member.id] = { counts: JSON.parse(await openText({ iv: head.value.sti, data: head.value.std ?? "" }, config.key)) as Record<string, number>, at: head.value.at ?? "" };
      } catch {
        // counts sealed with an older key - not compared
      }
    }
    seqTotal += theirSeq;
    let cursor = cursors[member.id] ?? 0;
    // A member that started over (a new link) restarts its numbering.
    if (theirSeq < cursor) cursor = 0;
    const startCursor = cursor;
    const read: { seq: number; ops: WireOp[] }[] = [];
    let openParts = 0;
    while (cursor < theirSeq && (cursor - startCursor < MAX_BATCHES_PER_ROUND || (openParts > 0 && cursor - startCursor < MAX_BATCHES_PER_ROUND + MAX_PART_BATCHES))) {
      const doc = await readDocument(config, batchPath(config, member.id, cursor + 1), fetchFn);
      if (!doc.ok) break;
      if (!doc.value) {
        cursor += 1;
        continue;
      }
      try {
        const ops = JSON.parse(await openText({ iv: doc.value.iv ?? "", data: doc.value.data ?? "" }, config.key)) as WireOp[];
        read.push({ seq: cursor + 1, ops });
        for (const op of ops) if (op.p) openParts += op.p.i === op.p.n - 1 ? -(op.p.n - 1) : 1;
      } catch {
        return finish(fail("تعذّر فك تشفير بيانات عضو آخر - أعد الربط برمز جديد"));
      }
      cursor += 1;
    }
    const joined = joinParts(read, cursor, cursor >= theirSeq);
    for (const op of joined.ops) remoteOps.push({ ...op, by: member.id });
    cursor = joined.cursor;
    if (cursor < theirSeq) behind = true;
    cursors[member.id] = cursor;
    seqDone += Math.min(cursor, theirSeq);
  }
  // Several members' changes: the later change of one record wins (each member's own order kept).
  remoteOps.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  // 2. Theirs onto ours, ours kept when later - on YAHYA his own always, elsewhere YAHYA's always. On YAHYA another
  // member's deletions of things / money wait for him.
  const nameOf = (id: string) => team.members.find((m) => m.id === id)?.name ?? "عضو";
  const main = isMainMember(config.memberId);
  const { apply: applyOps, held: newPending } = main ? holdDeletions(remoteOps, flat, nameOf) : { apply: remoteOps, held: [] };
  if (newPending.length > 0) {
    const known = new Set(loadPendingDeletions(s).map((p) => p.id));
    s.setSetting(PENDING, JSON.stringify([...loadPendingDeletions(s), ...newPending.filter((p) => !known.has(p.id))]));
  }
  const merged = merge(flat, localOps, applyOps, main ? { localWins: true } : { remoteWins: (op) => isMainMember((op as SyncOp & { by?: string }).by ?? "") });
  // A change he made while this round ran is never written over: the key is re-read and theirs re-applied.
  for (const k of merged.changedKeys) {
    const fresh = s.read(k);
    if (fresh !== (snapshot[k] ?? null)) {
      const again = merge({ [k]: flattenKey(fresh ?? "null", merged.data[k]?.shape) }, [], applyOps.filter((op) => op.k === k));
      merged.data[k] = again.data[k] ?? merged.data[k]!;
    }
    s.write(k, unflattenKey(merged.data[k]!));
  }

  // 3. Ours to them.
  let seq = state.seq;
  let sentOps = 0;
  const unsent: SyncOp[] = [];
  let sendError: string | null = null;
  for (const batch of chunkOps(merged.outgoing)) {
    if (sendError) {
      unsent.push(...batch);
      continue;
    }
    const sealed = await sealText(JSON.stringify(batch), config.key);
    const written = await writeDocument(config, batchPath(config, config.memberId, seq + 1), { iv: sealed.iv, data: sealed.data, at }, fetchFn);
    if (!written.ok) {
      sendError = written.message;
      unsent.push(...batch);
      continue;
    }
    seq += 1;
    sentOps += batch.length;
  }
  // The head only when something moved (Firebase's free writes are counted per day).
  const cursorsMoved = Object.entries(cursors).some(([id, c]) => (state.cursors[id] ?? 0) !== c);
  const counts = storeCounts(merged.data);
  const countsMoved = JSON.stringify(counts) !== JSON.stringify(state.counts ?? {});
  if (!opts.sendOnly && (seq !== state.seq || cursorsMoved || countsMoved || !state.lastAt)) {
    const sealedCounts = await sealText(JSON.stringify(counts), config.key);
    const headWritten = await writeDocument(config, headPath(config, config.memberId), { seq: String(seq), ack: JSON.stringify(cursors), at, sti: sealedCounts.iv, std: sealedCounts.data }, fetchFn);
    if (!headWritten.ok && !sendError) sendError = headWritten.message;
  }

  // 4. Remember: everything now agreed, except what is still to send or still held.
  const base = nextBaseline(merged.data, baseline, held);
  for (const op of unsent) {
    const prev = baseline[op.k]?.hashes[op.r];
    const entry = base[op.k];
    if (!entry) continue;
    if (prev === undefined) delete entry.hashes[op.r];
    else entry.hashes[op.r] = prev;
  }
  s.setSetting(BASE, JSON.stringify(base));
  if (merged.conflicts.length > 0) {
    const all = [...merged.conflicts.map((c) => ({ ...c, seenAt: at })), ...loadConflicts(s)].slice(0, 200);
    s.setSetting(CONFLICTS, JSON.stringify(all));
  }
  // 👥 Who did what: marks on what they added / changed, and the log (a lost change of theirs is not theirs here).
  const lost = new Set(merged.conflicts.filter((c) => c.kept === "local").map((c) => `${c.k}|${c.r}|${c.at}`));
  const incoming: TeamActivity[] = [];
  for (const op of applyOps) {
    if (lost.has(`${op.k}|${op.r}|${op.at}`)) continue;
    const a = describeOp(op, flat[op.k]?.records[op.r], nameOf(op.by));
    if (a) incoming.push(a);
  }
  if (incoming.length > 0) {
    s.setSetting(ORIGINS, JSON.stringify(nextOrigins(loadOrigins(s), incoming)));
    s.setSetting(LOG, JSON.stringify([...[...incoming].reverse(), ...loadActivityLog(s)].slice(0, LOG_SIZE)));
  }
  const nextState: LinkState = {
    seq,
    cursor: 0,
    cursors,
    confirmed: state.confirmed.filter((k) => held.some((h) => h.k === k)),
    held,
    lastAt: at,
    progress: opts.sendOnly ? state.progress : { done: seqDone, total: seqTotal },
    counts: opts.sendOnly ? state.counts : counts,
    theirCounts,
  };
  saveLinkState(s, nextState);
  const applied = applyOps.length - merged.conflicts.filter((c) => c.kept === "local").length;
  const result: RoundResult = {
    ok: !sendError,
    message: sendError ?? (behind ? `⏳ يستلم البيانات ${seqTotal ? Math.floor((seqDone / seqTotal) * 100) : 0}%` : "✓ متزامن"),
    sent: sentOps,
    applied: Math.max(0, applied),
    changedKeys: merged.changedKeys,
    conflicts: merged.conflicts.length,
    held,
    incoming,
    pending: newPending.length,
  };
  return finish(result);

  function finish(r: RoundResult): RoundResult {
    const st = loadLinkState(s);
    saveLinkState(s, { ...st, lastAt: at, lastOk: r.ok, lastMessage: r.message });
    return r;
  }
}

/** The team list: cached a few minutes; I am added (with my name) when missing or renamed. */
async function readTeam(s: LinkStorage, config: LinkConfig, fetchFn: FetchFn, now: Date): Promise<{ ok: true; members: TeamMember[] } | { ok: false; message: string }> {
  const cached = parse<{ members?: TeamMember[]; readAt?: number }>(s.getSetting(TEAM), {});
  const me = cached.members?.find((m) => m.id === config.memberId);
  // alone in the team: read it every round (the one pairing with it shows up at once)
  const alone = (cached.members?.length ?? 0) < 2;
  if (cached.members && me && me.name === config.name && !alone && now.getTime() - (cached.readAt ?? 0) < TEAM_EVERY_MS) return { ok: true, members: cached.members };
  const doc = await readDocument(config, teamPath(config), fetchFn);
  if (!doc.ok) return doc;
  let members: TeamMember[] = [];
  if (!doc.value?.iv) {
    // an older two-sided link: the other side counts only if it ever wrote its head
    for (const legacy of LEGACY_TEAM) {
      if (legacy.id === config.memberId) continue;
      const head = await readDocument(config, headPath(config, legacy.id), fetchFn);
      if (head.ok && head.value) members.push(legacy);
    }
  } else {
    try {
      members = JSON.parse(await openText({ iv: doc.value.iv, data: doc.value.data ?? "" }, config.key)) as TeamMember[];
    } catch {
      return { ok: false, message: "تعذّر فك تشفير قائمة الفريق - أعد الربط برمز جديد" };
    }
  }
  const mine = members.find((m) => m.id === config.memberId);
  if (!mine || mine.name !== config.name || !doc.value?.iv) {
    members = [...members.filter((m) => m.id !== config.memberId), { id: config.memberId, name: config.name, at: mine?.at || now.toISOString() }];
    const sealed = await sealText(JSON.stringify(members), config.key);
    const written = await writeDocument(config, teamPath(config), { iv: sealed.iv, data: sealed.data }, fetchFn);
    if (!written.ok) return written;
  }
  s.setSetting(TEAM, JSON.stringify({ members, readAt: now.getTime() }));
  return { ok: true, members };
}

/** His name for this member (shown on what it records); the team list is updated on the next round. */
export function renameMember(s: LinkStorage, name: string): void {
  const config = loadLinkConfig(s);
  if (!config || !name.trim()) return;
  saveLinkConfig(s, { ...config, name: name.trim().slice(0, 40) });
}

/** He confirmed a store's mass deletion: it goes out on the next round. */
export function confirmHeldDeletion(s: LinkStorage, key: string): void {
  const st = loadLinkState(s);
  saveLinkState(s, { ...st, confirmed: [...new Set([...st.confirmed, key])] });
}

/** A new member joins (the laptop, «المسؤول 2»…) under his name for it: its own business data is replaced by the
 * team's (he confirmed). */
export function joinAsMember(s: LinkStorage, config: LinkConfig, name: string): void {
  joinAsLaptop(s, { ...config, name: name.trim().slice(0, 40) || config.name });
}

/** A member joins: its own business data is replaced by the team's (he confirmed). */
export function joinAsLaptop(s: LinkStorage, config: LinkConfig): void {
  resetLink(s);
  for (const key of Object.keys(s.readAll())) s.write(key, null);
  s.setSetting(BASE, JSON.stringify(baselineOf({})));
  saveLinkConfig(s, config);
}

/** The phone starts a link: everything it has goes out on the first round. */
export function startAsPhone(s: LinkStorage, config: LinkConfig): void {
  resetLink(s);
  saveLinkConfig(s, config);
}

/**
 * Phone-only settings the team still shares (his Nov 5 2026 choice «الهاتفان» يوافقان على ما يرسله المندوبون): the
 * reps' codes (they open a rep's «تسجيلاتي» file), their bound phones, and since Nov 7 2026 their warnings / chat channels
 * (💬 every phone of the team talks with the reps - lib/chatTransport.ts). They travel only inside the link, sealed
 * with the team's key - never in a backup.
 */
export const LINK_SHARED_SETTINGS = ["starnet.repDeviceCodes", "starnet.repPhoneKeys", "starnet.repFlagChannels"] as const;

/** 💬 Stores that travel on their own channel, never in the link (the chat: lib/chatTransport.ts - in the link every
 * message would also remount the others' open page). */
export const LINK_EXCLUDED_KEYS = ["starnet_chat_v1"] as const;

/** What the link carries: every business store, and the shared settings above. */
export function isLinkedKey(key: string): boolean {
  if ((LINK_EXCLUDED_KEYS as readonly string[]).includes(key)) return false;
  return key.startsWith("starnet_") || (LINK_SHARED_SETTINGS as readonly string[]).includes(key);
}

/** The browser's localStorage as the link's storage. */
export function browserLinkStorage(): LinkStorage {
  const ls = window.localStorage;
  return {
    readAll() {
      const out: Record<string, string> = {};
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key && isLinkedKey(key)) {
          const v = ls.getItem(key);
          if (v !== null) out[key] = v;
        }
      }
      return out;
    },
    read: (key) => ls.getItem(key),
    write: (key, value) => (value === null ? ls.removeItem(key) : ls.setItem(key, value)),
    getSetting: (key) => ls.getItem(key),
    setSetting: (key, value) => (value === null ? ls.removeItem(key) : ls.setItem(key, value)),
  };
}
