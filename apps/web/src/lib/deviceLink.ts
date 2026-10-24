/**
 * 🔗 The phone ↔ laptop link over HIS Firebase (his Oct 24 2026 choice: two ways, his own project): the
 * pairing code, what each side remembers, and one round (`runLinkRound`) - send what changed here,
 * apply what changed there (lib/deviceSync.ts), all encrypted (lib/deviceSyncCrypto.ts).
 *
 * Firestore: starnet/{space}/link/{phone|laptop} → { seq, ack, at } (that side's head) and
 * starnet/{space}/link/{side}/batches/{seq} → { iv, data } (its changes, in order).
 * Settings live in `starnet.*` (never in a backup, never in the repo).
 */

import { baselineOf, diff, flattenAll, flattenKey, merge, nextBaseline, unflattenKey, type Baseline, type HeldDeletion, type SyncConflict, type SyncOp } from "./deviceSync";
import { isLinkKey, newLinkKey, openText, sealText } from "./deviceSyncCrypto";
import { readDocument, writeDocument, type FetchFn } from "./firestoreRest";
import { checkConfigInput, newSpaceId } from "./liveSyncConfig";

export type LinkRole = "phone" | "laptop";

export interface LinkConfig {
  apiKey: string;
  projectId: string;
  spaceId: string;
  key: string;
  role: LinkRole;
  enabled: boolean;
}

export interface LinkState {
  /** My last batch number. */
  seq: number;
  /** The other side's last batch I applied. */
  cursor: number;
  /** Stores whose mass deletion he confirmed (sent on the next round, then forgotten). */
  confirmed: string[];
  held: HeldDeletion[];
  lastAt?: string;
  lastOk?: boolean;
  lastMessage?: string;
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
const CODE_PREFIX = "STARNET-LINK-";
/** Firestore's document limit is 1 MiB - a batch's JSON stays well under it (base64 adds a third). */
const BATCH_CHARS = 550_000;
const MAX_BATCHES_PER_ROUND = 25;

const other = (role: LinkRole): LinkRole => (role === "phone" ? "laptop" : "phone");
const headPath = (c: LinkConfig, role: LinkRole) => `starnet/${c.spaceId}/link/${role}`;
const batchPath = (c: LinkConfig, role: LinkRole, seq: number) => `starnet/${c.spaceId}/link/${role}/batches/${seq}`;

function parse<T>(text: string | null, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadLinkConfig(s: LinkStorage): LinkConfig | null {
  const c = parse<Partial<LinkConfig> | null>(s.getSetting(CONFIG), null);
  return c && c.apiKey && c.projectId && c.spaceId && c.key && (c.role === "phone" || c.role === "laptop") ? { ...(c as LinkConfig), enabled: c.enabled !== false } : null;
}

export function saveLinkConfig(s: LinkStorage, config: LinkConfig | null): void {
  s.setSetting(CONFIG, config ? JSON.stringify(config) : null);
}

export function loadLinkState(s: LinkStorage): LinkState {
  return { seq: 0, cursor: 0, confirmed: [], held: [], ...parse<Partial<LinkState>>(s.getSetting(STATE), {}) };
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

/** Forget everything the link knew (unlink, or before a new pairing). */
export function resetLink(s: LinkStorage): void {
  for (const key of [CONFIG, STATE, BASE, CONFLICTS]) s.setSetting(key, null);
}

/** The phone makes the link (his Firebase + a new space + a new key). */
export function newPhoneLink(apiKey: string, projectId: string): { ok: true; config: LinkConfig } | { ok: false; message: string } {
  const checked = checkConfigInput(apiKey, projectId);
  if (!checked.ok) return checked;
  return { ok: true, config: { apiKey: checked.apiKey, projectId: checked.projectId, spaceId: newSpaceId(), key: newLinkKey(), role: "phone", enabled: true } };
}

/** «📋 رمز الربط»: everything the laptop needs, in one line to paste. */
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
    return { ok: true, config: { apiKey: checked.apiKey, projectId: checked.projectId, spaceId: v.s, key: v.k!, role: "laptop", enabled: true } };
  } catch {
    return { ok: false, message: "رمز الربط ناقص - انسخه كاملًا من الهاتف" };
  }
}

/** Splits changes into batches small enough for one Firestore document each. */
export function chunkOps(ops: SyncOp[], limit = BATCH_CHARS): SyncOp[][] {
  const out: SyncOp[][] = [];
  let current: SyncOp[] = [];
  let size = 2;
  for (const op of ops) {
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

export interface RoundResult {
  ok: boolean;
  message: string;
  sent: number;
  applied: number;
  /** Stores whose text changed here - the app must reload them. */
  changedKeys: string[];
  conflicts: number;
  held: HeldDeletion[];
}

/** One round of the link. Never throws: a network / Firebase problem is the round's message. */
export async function runLinkRound(s: LinkStorage, fetchFn: FetchFn = fetch, now: Date = new Date()): Promise<RoundResult> {
  const config = loadLinkConfig(s);
  const fail = (message: string): RoundResult => ({ ok: false, message, sent: 0, applied: 0, changedKeys: [], conflicts: 0, held: [] });
  if (!config || !config.enabled) return fail("الربط غير مفعّل");
  const state = loadLinkState(s);
  const at = now.toISOString();
  const baseline = parse<Baseline>(s.getSetting(BASE), {});
  const snapshot = s.readAll();
  const flat = flattenAll(snapshot, baseline);
  const confirmed = new Set(state.confirmed);
  const { ops: localOps, held } = diff(baseline, flat, at, confirmed);

  // 1. What the other side sent since last time.
  const theirs = other(config.role);
  const head = await readDocument(config, headPath(config, theirs), fetchFn);
  if (!head.ok) return finish(fail(head.message));
  const theirSeq = Number(head.value?.seq ?? 0);
  const remoteOps: SyncOp[] = [];
  let cursor = state.cursor;
  // A side that started over (a new link) restarts its numbering.
  if (theirSeq < cursor) cursor = 0;
  const startCursor = cursor;
  while (cursor < theirSeq && cursor - startCursor < MAX_BATCHES_PER_ROUND) {
    const doc = await readDocument(config, batchPath(config, theirs, cursor + 1), fetchFn);
    if (!doc.ok) break;
    if (!doc.value) {
      cursor += 1;
      continue;
    }
    try {
      remoteOps.push(...(JSON.parse(await openText({ iv: doc.value.iv ?? "", data: doc.value.data ?? "" }, config.key)) as SyncOp[]));
    } catch {
      return finish(fail("تعذّر فك تشفير بيانات الطرف الآخر - أعد الربط برمز جديد من الهاتف"));
    }
    cursor += 1;
  }

  // 2. Theirs onto ours, ours kept when later.
  const merged = merge(flat, localOps, remoteOps);
  // A change he made while this round ran is never written over: the key is re-read and theirs re-applied.
  for (const k of merged.changedKeys) {
    const fresh = s.read(k);
    if (fresh !== (snapshot[k] ?? null)) {
      const again = merge({ [k]: flattenKey(fresh ?? "null", merged.data[k]?.shape) }, [], remoteOps.filter((op) => op.k === k));
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
    const written = await writeDocument(config, batchPath(config, config.role, seq + 1), { iv: sealed.iv, data: sealed.data, at }, fetchFn);
    if (!written.ok) {
      sendError = written.message;
      unsent.push(...batch);
      continue;
    }
    seq += 1;
    sentOps += batch.length;
  }
  // The head only when something moved (Firebase's free writes are counted per day).
  if (seq !== state.seq || cursor !== state.cursor || !state.lastAt) {
    const headWritten = await writeDocument(config, headPath(config, config.role), { seq: String(seq), ack: String(cursor), at }, fetchFn);
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
  const nextState: LinkState = { seq, cursor, confirmed: state.confirmed.filter((k) => held.some((h) => h.k === k)), held, lastAt: at };
  saveLinkState(s, nextState);
  const applied = remoteOps.length - merged.conflicts.filter((c) => c.kept === "local").length;
  const result: RoundResult = {
    ok: !sendError,
    message: sendError ?? (cursor < theirSeq ? "⏳ يستلم البيانات على دفعات…" : "✓ متزامن"),
    sent: sentOps,
    applied: Math.max(0, applied),
    changedKeys: merged.changedKeys,
    conflicts: merged.conflicts.length,
    held,
  };
  return finish(result);

  function finish(r: RoundResult): RoundResult {
    const st = loadLinkState(s);
    saveLinkState(s, { ...st, lastAt: at, lastOk: r.ok, lastMessage: r.message });
    return r;
  }
}

/** He confirmed a store's mass deletion: it goes out on the next round. */
export function confirmHeldDeletion(s: LinkStorage, key: string): void {
  const st = loadLinkState(s);
  saveLinkState(s, { ...st, confirmed: [...new Set([...st.confirmed, key])] });
}

/** The laptop joins: its own business data is replaced by the phone's (he confirmed). */
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

/** The browser's localStorage as the link's storage. */
export function browserLinkStorage(): LinkStorage {
  const ls = window.localStorage;
  return {
    readAll() {
      const out: Record<string, string> = {};
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key && key.startsWith("starnet_")) {
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
