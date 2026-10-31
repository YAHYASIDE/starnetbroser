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

import { baselineOf, diff, flattenAll, flattenKey, merge, nextBaseline, unflattenKey, type Baseline, type HeldDeletion, type SyncConflict, type SyncOp } from "./deviceSync";
import { isLinkKey, newLinkKey, openText, sealText } from "./deviceSyncCrypto";
import { readDocument, writeDocument, type FetchFn } from "./firestoreRest";
import { describeOp, nextOrigins, type Origin, type TeamActivity } from "./teamActivity";
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
const LOG_SIZE = 300;
/** The team list is read again this often (Firebase's free reads are counted per day). */
const TEAM_EVERY_MS = 5 * 60_000;
const CODE_PREFIX = "STARNET-LINK-";
/** Firestore's document limit is 1 MiB - a batch's JSON stays well under it (base64 adds a third). */
const BATCH_CHARS = 550_000;
const MAX_BATCHES_PER_ROUND = 25;

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

/** Forget everything the link knew (unlink, or before a new pairing). */
export function resetLink(s: LinkStorage): void {
  for (const key of [CONFIG, STATE, BASE, CONFLICTS, TEAM, ORIGINS, LOG]) s.setSetting(key, null);
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
  /** 👥 What the other members' changes were (a notification for the notable ones). */
  incoming: TeamActivity[];
}

/** One round of the link. Never throws: a network / Firebase problem is the round's message. */
export async function runLinkRound(s: LinkStorage, fetchFn: FetchFn = fetch, now: Date = new Date()): Promise<RoundResult> {
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

  // 0. The team (read again every few minutes; I add myself once).
  const team = await readTeam(s, config, fetchFn, now);
  if (!team.ok) return finish(fail(team.message));
  const others = team.members.filter((m) => m.id !== config.memberId);

  // 1. What every other member sent since last time.
  const cursors: Record<string, number> = { ...state.cursors };
  const remoteOps: (SyncOp & { by: string })[] = [];
  let behind = false;
  for (const member of others) {
    const head = await readDocument(config, headPath(config, member.id), fetchFn);
    if (!head.ok) return finish(fail(head.message));
    const theirSeq = Number(head.value?.seq ?? 0);
    let cursor = cursors[member.id] ?? 0;
    // A member that started over (a new link) restarts its numbering.
    if (theirSeq < cursor) cursor = 0;
    const startCursor = cursor;
    while (cursor < theirSeq && cursor - startCursor < MAX_BATCHES_PER_ROUND) {
      const doc = await readDocument(config, batchPath(config, member.id, cursor + 1), fetchFn);
      if (!doc.ok) break;
      if (!doc.value) {
        cursor += 1;
        continue;
      }
      try {
        const ops = JSON.parse(await openText({ iv: doc.value.iv ?? "", data: doc.value.data ?? "" }, config.key)) as SyncOp[];
        for (const op of ops) remoteOps.push({ ...op, by: member.id });
      } catch {
        return finish(fail("تعذّر فك تشفير بيانات عضو آخر - أعد الربط برمز جديد"));
      }
      cursor += 1;
    }
    if (cursor < theirSeq) behind = true;
    cursors[member.id] = cursor;
  }
  // Several members' changes: the later change of one record wins (each member's own order kept).
  remoteOps.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

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
  if (seq !== state.seq || cursorsMoved || !state.lastAt) {
    const headWritten = await writeDocument(config, headPath(config, config.memberId), { seq: String(seq), ack: JSON.stringify(cursors), at }, fetchFn);
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
  const nameOf = (id: string) => team.members.find((m) => m.id === id)?.name ?? "عضو";
  const incoming: TeamActivity[] = [];
  for (const op of remoteOps) {
    if (lost.has(`${op.k}|${op.r}|${op.at}`)) continue;
    const a = describeOp(op, flat[op.k]?.records[op.r], nameOf(op.by));
    if (a) incoming.push(a);
  }
  if (incoming.length > 0) {
    s.setSetting(ORIGINS, JSON.stringify(nextOrigins(loadOrigins(s), incoming)));
    s.setSetting(LOG, JSON.stringify([...[...incoming].reverse(), ...loadActivityLog(s)].slice(0, LOG_SIZE)));
  }
  const nextState: LinkState = { seq, cursor: 0, cursors, confirmed: state.confirmed.filter((k) => held.some((h) => h.k === k)), held, lastAt: at };
  saveLinkState(s, nextState);
  const applied = remoteOps.length - merged.conflicts.filter((c) => c.kept === "local").length;
  const result: RoundResult = {
    ok: !sendError,
    message: sendError ?? (behind ? "⏳ يستلم البيانات على دفعات…" : "✓ متزامن"),
    sent: sentOps,
    applied: Math.max(0, applied),
    changedKeys: merged.changedKeys,
    conflicts: merged.conflicts.length,
    held,
    incoming,
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
