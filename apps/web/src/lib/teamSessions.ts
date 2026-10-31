/**
 * 🔐 The devices' Starlink sessions shared in the link team (his Oct 31 2026 choice «نعم، مشفّرة مع الجهاز»): a device
 * one member signed into opens signed-in on the others too - like «📤 نسخ الجلسة», which keeps both signed in.
 *
 * Every 30 minutes each member reads its devices' sessions (cookies only) and sends a device's when it is new, or
 * changed and its last send is 6 hours old (cookies turn over by themselves - not a reason to send each time). Sealed
 * with the link's key: starnet/{space}/sessions/{member}__{device} and the member's index
 * starnet/{space}/sessionIndex/{member} (device → when). A session that came from another member goes in by itself
 * only where this phone has none for that device - a working session here is never written over; «📥 خذ جلسات
 * الفريق» takes every newer one on purpose.
 */

import type { SessionsByAccount } from "./accountBackup";
import { openText, sealText } from "./deviceSyncCrypto";
import type { LinkConfig, TeamMember } from "./deviceLink";
import { readDocument, writeDocument, type FetchFn } from "./firestoreRest";

export const SESSION_ROUND_MS = 30 * 60_000;
const RESEND_MS = 6 * 60 * 60_000;

/** What I sent: device → its fingerprint and when. */
export type SentSessions = Record<string, { h: string; at: number }>;
/** What I took from the team: device → the sent time I took. */
export type TakenSessions = Record<string, number>;

/** A short fingerprint of a device's cookies (FNV-1a) - only to tell a change, never sent. */
export function sessionFingerprint(cookies: Record<string, string>): string {
  const text = JSON.stringify(Object.keys(cookies).sort().map((k) => [k, cookies[k]]));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function hasCookies(cookies: Record<string, string> | undefined): boolean {
  return Boolean(cookies && Object.values(cookies).some((v) => v && v.trim()));
}

/** The devices whose session goes out now. */
export function sessionsToSend(local: SessionsByAccount, sent: SentSessions, now: number): string[] {
  return Object.keys(local).filter((id) => {
    const cookies = local[id];
    if (!hasCookies(cookies)) return false;
    const before = sent[id];
    if (!before) return true;
    return before.h !== sessionFingerprint(cookies!) && now - before.at >= RESEND_MS;
  });
}

/** The newest session of each device among the other members' indexes. */
export function newestSessions(indexes: { member: string; index: Record<string, number> }[]): Record<string, { member: string; at: number }> {
  const out: Record<string, { member: string; at: number }> = {};
  for (const { member, index } of indexes) {
    for (const [id, at] of Object.entries(index)) if (!out[id] || at > out[id]!.at) out[id] = { member, at };
  }
  return out;
}

/** What to take: newer than what I took, and - unless he asked («📥 خذ جلسات الفريق») - only where I have none. */
export function sessionsToTake(
  newest: Record<string, { member: string; at: number }>,
  taken: TakenSessions,
  local: SessionsByAccount,
  sent: SentSessions,
  force: boolean,
): { id: string; member: string; at: number }[] {
  return Object.entries(newest)
    .filter(([id, n]) => n.at > (taken[id] ?? 0) && n.at > (sent[id]?.at ?? 0))
    .filter(([id]) => force || !hasCookies(local[id]))
    .map(([id, n]) => ({ id, ...n }));
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "_");
const sessionPath = (c: LinkConfig, member: string, id: string) => `starnet/${c.spaceId}/sessions/${member}__${safeId(id)}`;
const indexPath = (c: LinkConfig, member: string) => `starnet/${c.spaceId}/sessionIndex/${member}`;

export interface SessionDeps {
  config: LinkConfig;
  team: TeamMember[];
  /** The devices to look at (not deleted). */
  accountIds: string[];
  exportSessions(ids: string[]): Promise<SessionsByAccount>;
  importSessions(sessions: SessionsByAccount): Promise<{ ok: boolean; importedCount: number }>;
  getSetting(key: string): string | null;
  setSetting(key: string, value: string | null): void;
  fetchFn?: FetchFn;
  now?: number;
}

const SENT = "starnet.teamSessionsSent";
const TAKEN = "starnet.teamSessionsTaken";

function parse<T>(text: string | null, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** One sessions round. `force` = «📥 خذ جلسات الفريق». Never throws. */
export async function runSessionRound(d: SessionDeps, force = false): Promise<{ ok: boolean; sent: number; taken: number; message: string }> {
  const fetchFn = d.fetchFn ?? fetch;
  const now = d.now ?? Date.now();
  const { config } = d;
  try {
    const local = await d.exportSessions(d.accountIds);
    const sent = parse<SentSessions>(d.getSetting(SENT), {});
    const taken = parse<TakenSessions>(d.getSetting(TAKEN), {});

    // 1. Mine out.
    const out = sessionsToSend(local, sent, now);
    if (out.length > 0) {
      for (const id of out) {
        const sealed = await sealText(JSON.stringify(local[id]), config.key);
        const w = await writeDocument(config, sessionPath(config, config.memberId, id), { iv: sealed.iv, data: sealed.data }, fetchFn);
        if (!w.ok) return { ok: false, sent: 0, taken: 0, message: w.message };
        sent[id] = { h: sessionFingerprint(local[id]!), at: now };
      }
      const index = Object.fromEntries(Object.entries(sent).map(([id, s]) => [id, s.at]));
      const sealedIndex = await sealText(JSON.stringify(index), config.key);
      const w = await writeDocument(config, indexPath(config, config.memberId), { iv: sealedIndex.iv, data: sealedIndex.data }, fetchFn);
      if (!w.ok) return { ok: false, sent: 0, taken: 0, message: w.message };
      d.setSetting(SENT, JSON.stringify(sent));
    }

    // 2. Theirs in.
    const indexes: { member: string; index: Record<string, number> }[] = [];
    for (const m of d.team) {
      if (m.id === config.memberId) continue;
      const doc = await readDocument(config, indexPath(config, m.id), fetchFn);
      if (!doc.ok || !doc.value?.iv) continue;
      try {
        indexes.push({ member: m.id, index: JSON.parse(await openText({ iv: doc.value.iv, data: doc.value.data ?? "" }, config.key)) as Record<string, number> });
      } catch {
        // a member's index sealed with an older key - skipped
      }
    }
    const wanted = new Set(d.accountIds);
    const take = sessionsToTake(newestSessions(indexes), taken, local, sent, force).filter((t) => wanted.has(t.id));
    const incoming: SessionsByAccount = {};
    for (const t of take) {
      const doc = await readDocument(config, sessionPath(config, t.member, t.id), fetchFn);
      if (!doc.ok || !doc.value?.iv) continue;
      try {
        incoming[t.id] = JSON.parse(await openText({ iv: doc.value.iv, data: doc.value.data ?? "" }, config.key)) as Record<string, string>;
        taken[t.id] = t.at;
      } catch {
        // skipped
      }
    }
    let imported = 0;
    if (Object.keys(incoming).length > 0) {
      const r = await d.importSessions(incoming);
      imported = r.importedCount;
      if (r.ok) {
        d.setSetting(TAKEN, JSON.stringify(taken));
        // what came in is not sent back as mine (until it changes here and 6 hours pass)
        for (const [id, cookies] of Object.entries(incoming)) sent[id] = { h: sessionFingerprint(cookies), at: taken[id]! };
        d.setSetting(SENT, JSON.stringify(sent));
      }
    }
    return { ok: true, sent: out.length, taken: imported, message: "✓" };
  } catch (e) {
    return { ok: false, sent: 0, taken: 0, message: e instanceof Error ? e.message : "تعذّر نقل الجلسات" };
  }
}
