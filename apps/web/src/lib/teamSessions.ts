/**
 * 🔐 The devices' Starlink sessions shared in the link team (his Oct 31 2026 choice «نعم، مشفّرة مع الجهاز»): a device
 * one member signed into opens signed-in on the others too - like «📤 نسخ الجلسة», which keeps both signed in.
 *
 * Every 30 minutes each member reads its devices' sessions (cookies only) and sends a device's - only one signed in
 * (`isSignedInSession`, since Nov 5 2026) - when it is new, or changed and its last send is 6 hours old (cookies turn over by themselves - not a reason to send each time). Sealed
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

/** What I sent: device → its fingerprint, when, and its sign-in ticket's fingerprint (`t`, since Nov 8 2026). */
export type SentSessions = Record<string, { h: string; at: number; t?: string }>;
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

/** Starlink's sign-in ticket: the ASP.NET cookies `Starlink.Com.Access.V1` (or its chunks `…V1C1`, `…V1C2`) and
 * `Starlink.Com.Sso`. A ticket under another name still shows by its size: no visit leaves a 1,000-character cookie. */
const SIGN_IN_COOKIE = /^starlink\.com\.(access|sso)/i;
const TICKET_CHARS = 1000;

/**
 * Whether these cookies carry a Starlink sign-in - not just what any visit leaves (his Nov 5 2026 report: on «المسؤول 2»
 * every device opened signed out). A device opened once while signed out has a few cookies too; counting those as «a
 * session» kept the team's real one from ever coming in, and sent the empty one out as the newest.
 * `cookies`: address → its cookie line («a=1; b=2») - or cookie name → value.
 */
/** 🔑 A fingerprint of the sign-in ticket alone (the other cookies change at every visit): a new one = a new sign-in. */
export function ticketFingerprint(cookies: Record<string, string> | undefined): string {
  if (!cookies) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(cookies)) {
    if (!value || !value.trim()) continue;
    if (SIGN_IN_COOKIE.test(key.trim())) parts.push(`${key}=${value}`);
    for (const part of value.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (v && (SIGN_IN_COOKIE.test(name) || v.length >= TICKET_CHARS)) parts.push(`${name}=${v}`);
    }
  }
  return parts.length ? sessionFingerprint(Object.fromEntries(parts.sort().map((p, i) => [String(i), p]))) : "";
}

export function isSignedInSession(cookies: Record<string, string> | undefined): boolean {
  if (!cookies) return false;
  for (const [key, value] of Object.entries(cookies)) {
    if (!value || !value.trim()) continue;
    if (SIGN_IN_COOKIE.test(key.trim())) return true;
    for (const part of value.split(";")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const v = part.slice(eq + 1).trim();
      if (v && (SIGN_IN_COOKIE.test(part.slice(0, eq).trim()) || v.length >= TICKET_CHARS)) return true;
    }
  }
  return false;
}

/** The devices whose session goes out now - only a signed-in one: a new device, a new sign-in (another ticket - his
 * Nov 8 2026 report: a device YOUBE signed into again stayed signed out on YAHYA's phone for hours), else a changed
 * session once 6 h passed (the other cookies change at every visit). */
export function sessionsToSend(local: SessionsByAccount, sent: SentSessions, now: number): string[] {
  return Object.keys(local).filter((id) => {
    const cookies = local[id];
    if (!isSignedInSession(cookies)) return false;
    const before = sent[id];
    if (!before) return true;
    if (before.t && before.t !== ticketFingerprint(cookies)) return true;
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

/**
 * What to take: the newest of each device - newer than what I took and than what I sent. Since his Nov 9 2026 report
 * («يخرجه مرات ويخرجني مرات», on any device) a phone that still holds a session takes a newer one too: when one phone
 * renews a device's sign-in, Starlink may end the copy the other phone holds - which still LOOKS signed in here (the
 * cookie is there), so it never took the new one and stayed on the sign-in page. The newest sign-in now follows to
 * every phone. A device signed out here takes the team's whatever this phone sent before (an older build sent empty
 * sessions as its own). `force` («📥 خذ جلسات الفريق») is the same rule, asked now.
 */
export function sessionsToTake(
  newest: Record<string, { member: string; at: number }>,
  taken: TakenSessions,
  local: SessionsByAccount,
  sent: SentSessions,
  _force: boolean,
): { id: string; member: string; at: number }[] {
  return Object.entries(newest)
    .filter(([id, n]) => {
      if (!isSignedInSession(local[id])) return n.at > (taken[id] ?? 0);
      return n.at > (taken[id] ?? 0) && n.at > (sent[id]?.at ?? 0);
    })
    .map(([id, n]) => ({ id, ...n }));
}

/** My sent list without the devices not signed in here (an older build sent their empty sessions) - so my index
 * never offers them to the team. */
export function cleanSent(sent: SentSessions, local: SessionsByAccount): { sent: SentSessions; dropped: number } {
  const out: SentSessions = {};
  let dropped = 0;
  for (const [id, s] of Object.entries(sent)) {
    if (isSignedInSession(local[id])) out[id] = s;
    else dropped += 1;
  }
  return { sent: out, dropped };
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
  /** 📊 «نقل الجلسات 45%» - sessions fetched of those to take. */
  onProgress?: (done: number, total: number) => void;
}

/** Why a device is still signed out here after a round (his Nov 6 2026 ask: the names, and why). */
export type MissingReason = "none" | "empty" | "stale" | "failed";

export const MISSING_REASON_TEXT: Record<MissingReason, string> = {
  none: "غير مسجّل في الهاتف الآخر أيضًا - سجّل الدخول فيه هناك أو هنا",
  empty: "وصلت جلسته فارغة",
  stale: "أُخذت جلسته ولم تعمل - سجّل الدخول فيه من جديد في أحد الهاتفين ثم «📥»",
  failed: "تعذّر جلب جلسته - أعد «📥»",
};

const SENT = "starnet.teamSessionsSent";
const TAKEN = "starnet.teamSessionsTaken";

function parse<T>(text: string | null, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export interface SessionRoundResult {
  ok: boolean;
  sent: number;
  taken: number;
  message: string;
  /** What this phone has: devices signed in / opened but not signed in. */
  here?: { signedIn: number; signedOut: number };
  /** Devices the other members offer a session for, and those that came empty (not put in). */
  offered?: number;
  empty?: number;
  /** Devices still signed out here, and why. */
  missing?: { id: string; reason: MissingReason }[];
}

/** The line under «📥 خذ جلسات الفريق» - enough to tell where a session stops. */
export function sessionsNoteText(r: SessionRoundResult): string {
  if (!r.ok) return `⚠️ الجلسات: ${r.message}`;
  const parts = [`🔐 هنا: ${r.here?.signedIn ?? 0} مسجّلة · ${r.here?.signedOut ?? 0} بلا دخول`, `من الفريق: ${r.offered ?? 0} متاحة · أُخذت ${r.taken}`, `أُرسلت ${r.sent}`];
  if (r.empty) parts.push(`${r.empty} فارغة لم تُؤخذ`);
  return parts.join(" | ");
}

/** One sessions round. `force` = «📥 خذ جلسات الفريق». Never throws. */
export async function runSessionRound(d: SessionDeps, force = false): Promise<SessionRoundResult> {
  const fetchFn = d.fetchFn ?? fetch;
  const now = d.now ?? Date.now();
  const { config } = d;
  try {
    const local = await d.exportSessions(d.accountIds);
    const cleaned = cleanSent(parse<SentSessions>(d.getSetting(SENT), {}), local);
    const sent = cleaned.sent;
    const taken = parse<TakenSessions>(d.getSetting(TAKEN), {});

    // 1. Mine out (and my index again when it offered sessions that aren't signed in here).
    const out = sessionsToSend(local, sent, now);
    if (out.length > 0 || cleaned.dropped > 0) {
      for (const id of out) {
        const sealed = await sealText(JSON.stringify(local[id]), config.key);
        const w = await writeDocument(config, sessionPath(config, config.memberId, id), { iv: sealed.iv, data: sealed.data }, fetchFn);
        if (!w.ok) return { ok: false, sent: 0, taken: 0, message: w.message };
        sent[id] = { h: sessionFingerprint(local[id]!), at: now, t: ticketFingerprint(local[id]) };
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
    const newest = newestSessions(indexes);
    const take = sessionsToTake(newest, taken, local, sent, force).filter((t) => wanted.has(t.id));
    const incoming: SessionsByAccount = {};
    let empty = 0;
    const why: Record<string, MissingReason> = {};
    let done = 0;
    d.onProgress?.(0, take.length);
    // a few at a time - a full team's sessions come in a minute, not ten
    for (let i = 0; i < take.length; i += 6) {
      await Promise.all(
        take.slice(i, i + 6).map(async (t) => {
          try {
            const doc = await readDocument(config, sessionPath(config, t.member, t.id), fetchFn);
            if (!doc.ok || !doc.value?.iv) {
              why[t.id] = "failed";
              return;
            }
            const cookies = JSON.parse(await openText({ iv: doc.value.iv, data: doc.value.data ?? "" }, config.key)) as Record<string, string>;
            // an empty session another phone sent (an older build) is never put in - it would sign this one out
            if (!isSignedInSession(cookies)) {
              empty += 1;
              why[t.id] = "empty";
              return;
            }
            incoming[t.id] = cookies;
            taken[t.id] = t.at;
          } catch {
            why[t.id] = "failed";
          } finally {
            done += 1;
            d.onProgress?.(done, take.length);
          }
        }),
      );
    }
    let imported = 0;
    if (Object.keys(incoming).length > 0) {
      const r = await d.importSessions(incoming);
      imported = r.importedCount;
      if (r.ok) {
        d.setSetting(TAKEN, JSON.stringify(taken));
        // what came in is not sent back as mine (until it changes here and 6 hours pass)
        for (const [id, cookies] of Object.entries(incoming)) sent[id] = { h: sessionFingerprint(cookies), at: taken[id]!, t: ticketFingerprint(cookies) };
        d.setSetting(SENT, JSON.stringify(sent));
      }
    }
    // what this phone has now - the ones just put in count as signed in
    const now_ = { ...local, ...(imported > 0 ? incoming : {}) };
    const signedIn = d.accountIds.filter((id) => isSignedInSession(now_[id])).length;
    const missing = d.accountIds
      .filter((id) => !isSignedInSession(now_[id]))
      .map((id) => ({ id, reason: why[id] ?? (newest[id] ? "stale" : "none") }) as { id: string; reason: MissingReason });
    return {
      ok: true,
      sent: out.length,
      taken: imported,
      message: "✓",
      here: { signedIn, signedOut: d.accountIds.length - signedIn },
      offered: Object.keys(newest).filter((id) => wanted.has(id)).length,
      empty,
      missing,
    };
  } catch (e) {
    return { ok: false, sent: 0, taken: 0, message: e instanceof Error ? e.message : "تعذّر نقل الجلسات" };
  }
}
