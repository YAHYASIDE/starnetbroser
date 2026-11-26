/**
 * ☁️ «Firebase القاعدة الرئيسية» (his Nov 25 2026 «دعنا نفعل فايربيس جيدًا»; his choices: readable by the server with
 * permissions, him and the admins first, the team code as today, a 10$ budget). Every business record lives as its own
 * Firestore document - the server holds the whole, current state - so a phone that was off, a new phone, or (later) a
 * server bot reads everything without any other phone being on. Each phone keeps its copy (lib/bigStorage.ts) for speed
 * and for working offline; the team round (lib/deviceLink.ts) sends its changes here and reads everyone else's.
 *
 * Firestore (his project, the team's space):
 *   starnet/{space}                       → { owner }                     (the phone that moved the team)
 *   starnet/{space}/private/join          → { code }                     (never readable by anyone - the rules check it)
 *   starnet/{space}/members/{uid}         → { member, name, code, at }   (a team phone; only members read the records)
 *   starnet/{space}/records/{id}          → { k, s, r, v, d, a, m, u }   (one record: store, shape, record id, JSON or
 *                                                                          deleted, when changed, by which member, server time)
 * Pure parts (ids, fields, queries, the rules) - tested in cloudDb.test.ts; the HTTPS calls at the bottom.
 */

import type { Shape, SyncOp } from "./deviceSync";
import { documentUrl, explainFirebaseError, idToken, readDocument, type FetchFn, type Result } from "./firestoreRest";
import type { LiveSyncConfig } from "./liveSyncConfig";
import { timedFetch } from "./lowNet";

type Fb = Pick<LiveSyncConfig, "apiKey" | "projectId">;

export const RECORDS = "records";
export const MEMBERS = "members";
/** A record bigger than this (characters) can't be one Firestore document (1 MiB). */
export const MAX_RECORD_CHARS = 900_000;
/** Writes in one commit (Firestore's limit is 500) and characters in one request (its limit is 10 MiB). */
export const COMMIT_WRITES = 400;
export const COMMIT_CHARS = 1_000_000;
/** Each read starts this far before the cursor (a commit seen late is still read); seen ones are skipped. */
export const OVERLAP_MS = 2 * 60_000;
export const PAGE = 500;

// ---- the record's document id ----

function b64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fnv(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** One record ↔ one document id (store + record id, readable back from the fields - never parsed from the id). */
export function recordDocId(k: string, r: string): string {
  const raw = `${k}\u001f${r}`;
  const id = b64url(raw);
  if (id.length <= 1000) return id;
  // a very long record id: a hash (three seeds + the length - a collision is practically impossible)
  return `h_${fnv(raw, 0x811c9dc5)}_${fnv(raw, 0x01000193)}_${fnv(raw, 0x9e3779b9)}_${raw.length.toString(36)}`;
}

// ---- record ↔ Firestore fields ----

type Value = { stringValue?: string; booleanValue?: boolean; timestampValue?: string; integerValue?: string };
export interface CloudDoc {
  name?: string;
  fields?: Record<string, Value>;
}

/** One change as a record document's fields (the server time `u` is set by the commit). */
export function opFields(op: SyncOp, memberId: string): Record<string, Value> {
  return {
    k: { stringValue: op.k },
    s: { stringValue: op.s },
    r: { stringValue: op.r },
    v: { stringValue: op.v ?? "" },
    d: { booleanValue: op.v === null },
    a: { stringValue: op.at },
    m: { stringValue: memberId },
  };
}

export type CloudOp = SyncOp & { by: string; u: string; id: string };

/** A record document → the change it carries (null = not a record). */
export function docOp(doc: CloudDoc): CloudOp | null {
  const f = doc.fields ?? {};
  const k = f.k?.stringValue;
  const r = f.r?.stringValue;
  const s = f.s?.stringValue as Shape | undefined;
  const u = f.u?.timestampValue;
  if (!k || r === undefined || !s || !u) return null;
  const deleted = f.d?.booleanValue === true;
  return {
    k,
    r,
    s,
    v: deleted ? null : (f.v?.stringValue ?? ""),
    at: f.a?.stringValue ?? u,
    by: f.m?.stringValue ?? "",
    u,
    id: (doc.name ?? "").split("/").pop() ?? "",
  };
}

// ---- what to send: commits ----

export interface CommitWrite {
  update: { name: string; fields: Record<string, Value> };
  updateTransforms: { fieldPath: string; setToServerValue: "REQUEST_TIME" }[];
}

export function docName(fb: Pick<Fb, "projectId">, path: string): string {
  return `projects/${fb.projectId}/databases/(default)/documents/${path}`;
}

/** The changes cut into commits (≤ COMMIT_WRITES writes, ≤ COMMIT_CHARS characters); a too-big record is refused. */
export function planCommits(
  fb: Pick<Fb, "projectId">,
  space: string,
  ops: SyncOp[],
  memberId: string,
): { commits: CommitWrite[][]; tooBig: SyncOp[] } {
  const commits: CommitWrite[][] = [];
  const tooBig: SyncOp[] = [];
  let cur: CommitWrite[] = [];
  let chars = 0;
  for (const op of ops) {
    const size = (op.v?.length ?? 0) + op.k.length + op.r.length;
    if (size > MAX_RECORD_CHARS) {
      tooBig.push(op);
      continue;
    }
    if (cur.length >= COMMIT_WRITES || (cur.length > 0 && chars + size > COMMIT_CHARS)) {
      commits.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push({
      update: { name: docName(fb, `starnet/${space}/${RECORDS}/${recordDocId(op.k, op.r)}`), fields: opFields(op, memberId) },
      updateTransforms: [{ fieldPath: "u", setToServerValue: "REQUEST_TIME" }],
    });
    chars += size;
  }
  if (cur.length) commits.push(cur);
  return { commits, tooBig };
}

// ---- what to read: everything changed since the cursor ----

export interface CloudCursor {
  /** The newest server time read (ISO). */
  u: string;
  /** Documents already applied at times inside the overlap window: id → u. */
  seen: Record<string, string>;
}

export const EMPTY_CURSOR: CloudCursor = { u: "", seen: {} };

/** The query from (cursor − overlap), oldest first, one page. `after` = the last [u, name] of the previous page. */
export function sinceQuery(cursor: CloudCursor, after: { u: string; name: string } | null, overlapMs = OVERLAP_MS) {
  const from = cursor.u ? new Date(Date.parse(cursor.u) - overlapMs).toISOString() : "1970-01-01T00:00:00Z";
  return {
    structuredQuery: {
      from: [{ collectionId: RECORDS }],
      where: { fieldFilter: { field: { fieldPath: "u" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: from } } },
      orderBy: [
        { field: { fieldPath: "u" }, direction: "ASCENDING" },
        { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
      ],
      ...(after ? { startAt: { values: [{ timestampValue: after.u }, { referenceValue: after.name }], before: false } } : {}),
      limit: PAGE,
    },
  };
}

/**
 * What a page brings: the changes not applied yet (mine skipped - I already have them), and the next cursor (the seen
 * list keeps only what is still inside the overlap window).
 */
export function takeNew(cursor: CloudCursor, docs: CloudDoc[], memberId: string, overlapMs = OVERLAP_MS): { ops: CloudOp[]; cursor: CloudCursor } {
  const seen = { ...cursor.seen };
  let u = cursor.u;
  const ops: CloudOp[] = [];
  for (const doc of docs) {
    const op = docOp(doc);
    if (!op) continue;
    if (seen[op.id] === op.u) continue;
    seen[op.id] = op.u;
    if (!u || op.u > u) u = op.u;
    if (op.by !== memberId) ops.push(op);
  }
  const floor = u ? new Date(Date.parse(u) - overlapMs).toISOString() : "";
  for (const [id, t] of Object.entries(seen)) if (t < floor) delete seen[id];
  return { ops, cursor: { u, seen } };
}

// ---- the rules (pasted once in Firebase → Firestore → Rules) ----

/**
 * 🔒 Records and members: only the team's phones (a member document under their own sign-in, created with the join
 * code). The join code itself is never readable. Everything else of the app (chat, flags, the old link, sessions,
 * reps' sides…) stays as it was: any signed-in phone of the app.
 */
export const CLOUD_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // kept from the rules that were already published on his project (not used by this app - maybe by another)
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
    match /starnet/{space} {
      function isMember() {
        return request.auth != null && exists(/databases/$(database)/documents/starnet/$(space)/members/$(request.auth.uid));
      }
      function isOwner() {
        return request.auth != null && get(/databases/$(database)/documents/starnet/$(space)).data.owner == request.auth.uid;
      }
      allow read: if isMember();
      allow create: if request.auth != null && request.resource.data.owner == request.auth.uid;
      allow update: if isOwner();
      match /private/{doc} {
        allow create, update: if isOwner();
      }
      match /members/{uid} {
        allow read: if isMember();
        allow create, update: if request.auth != null && request.auth.uid == uid
          && (isOwner() || request.resource.data.code == get(/databases/$(database)/documents/starnet/$(space)/private/join).data.code);
        allow delete: if isOwner();
      }
      match /records/{id} {
        allow read, write: if isMember();
      }
      match /{col}/{document=**} {
        allow read, write: if request.auth != null && !(col in ['records', 'members', 'private']);
      }
    }
  }
}`;

/** A random join code (16 letters / digits). */
export function newJoinCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(random(16), (b) => abc[b % abc.length]).join("");
}

/** The signed-in phone's uid, from its ID token. */
export function uidOf(token: string): string | null {
  try {
    const part = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { user_id?: string; sub?: string };
    return json.user_id ?? json.sub ?? null;
  } catch {
    return null;
  }
}

// ---- the HTTPS calls ----

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<{ status: number; body: string }> {
  try {
    const res = await fetchFn(url, init);
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0, body: "" };
  }
}

const base = (fb: Fb) => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(fb.projectId)}/databases/(default)/documents`;

export async function myUid(fb: Fb, fetchFn: FetchFn = timedFetch): Promise<Result<string>> {
  const token = await idToken(fb, fetchFn);
  if (!token.ok) return token;
  const uid = uidOf(token.value);
  return uid ? { ok: true, value: uid } : { ok: false, message: "تعذّر معرفة هوية هذا الهاتف في Firebase" };
}

/** Writes several documents at once, all or nothing. */
export async function commit(fb: Fb, writes: unknown[], fetchFn: FetchFn = timedFetch): Promise<Result<true>> {
  const token = await idToken(fb, fetchFn);
  if (!token.ok) return token;
  const r = await call(fetchFn, `${base(fb)}:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  return { ok: true, value: true };
}

/** One plain document write (create or replace) with typed fields; `mustNotExist` = create only. */
export async function putDoc(fb: Fb, path: string, fields: Record<string, Value>, fetchFn: FetchFn = timedFetch, mustNotExist = false): Promise<Result<true>> {
  return commit(fb, [{ update: { name: docName(fb, path), fields }, ...(mustNotExist ? { currentDocument: { exists: false } } : {}) }], fetchFn);
}

export async function getDoc(fb: Fb, path: string, fetchFn: FetchFn = timedFetch): Promise<Result<CloudDoc | null>> {
  const token = await idToken(fb, fetchFn);
  if (!token.ok) return token;
  const r = await call(fetchFn, documentUrl(fb, path), { headers: { Authorization: `Bearer ${token.value}` } });
  if (r.status === 404 && !/does not exist/i.test(r.body)) return { ok: true, value: null };
  if (r.status === 403) return { ok: false, message: "denied" };
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  return { ok: true, value: JSON.parse(r.body) as CloudDoc };
}

/** Every record changed since the cursor (page after page, up to `maxPages`). */
export async function readSince(
  fb: Fb,
  space: string,
  cursor: CloudCursor,
  memberId: string,
  fetchFn: FetchFn = timedFetch,
  maxPages = 40,
): Promise<Result<{ ops: CloudOp[]; cursor: CloudCursor; more: boolean }>> {
  const token = await idToken(fb, fetchFn);
  if (!token.ok) return token;
  let cur = cursor;
  const ops: CloudOp[] = [];
  let after: { u: string; name: string } | null = null;
  for (let page = 0; page < maxPages; page++) {
    const r = await call(fetchFn, `${base(fb)}/starnet/${encodeURIComponent(space)}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
      body: JSON.stringify(sinceQuery(cursor, after)),
    });
    if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
    const rows = (JSON.parse(r.body) as { document?: CloudDoc }[]).map((x) => x.document).filter((d): d is CloudDoc => !!d);
    const got = takeNew(cur, rows, memberId);
    ops.push(...got.ops);
    cur = got.cursor;
    if (rows.length < PAGE) return { ok: true, value: { ops, cursor: cur, more: false } };
    const last = rows[rows.length - 1]!;
    after = { u: last.fields?.u?.timestampValue ?? "", name: last.name ?? "" };
  }
  return { ok: true, value: { ops, cursor: cur, more: true } };
}

/** How many record documents the server holds (the check after the first upload). */
export async function countRecords(fb: Fb, space: string, fetchFn: FetchFn = timedFetch): Promise<Result<number>> {
  const token = await idToken(fb, fetchFn);
  if (!token.ok) return token;
  const r = await call(fetchFn, `${base(fb)}/starnet/${encodeURIComponent(space)}:runAggregationQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: RECORDS }], where: { fieldFilter: { field: { fieldPath: "d" }, op: "EQUAL", value: { booleanValue: false } } } },
        aggregations: [{ alias: "n", count: {} }],
      },
    }),
  });
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  const rows = JSON.parse(r.body) as { result?: { aggregateFields?: { n?: { integerValue?: string } } } }[];
  return { ok: true, value: Number(rows[0]?.result?.aggregateFields?.n?.integerValue ?? 0) };
}

/**
 * 🔍 «افحص الاتصال»: what Google answers about this project, in plain lines (the sign-in, then a read of the space) - the
 * status codes and Google's own short message, never the key or the token. Never throws.
 */
export async function diagnoseFirebase(fb: Fb, space: string, fetchFn: FetchFn = timedFetch, memberId?: string): Promise<string[]> {
  const lines: string[] = [`المشروع: ${fb.projectId}`];
  const short = (body: string) => {
    try {
      const e = (JSON.parse(body) as { error?: { status?: string; message?: string } }).error;
      return e ? `${e.status ?? ""} ${(e.message ?? "").replace(/AIza[0-9A-Za-z_-]+/g, "…").slice(0, 160)}`.trim() : "";
    } catch {
      return "";
    }
  };
  let status = 0;
  let body = "";
  try {
    const r = await fetchFn(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(fb.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    });
    status = r.status;
    body = await r.text();
  } catch {
    lines.push("الدخول المجهول: لا اتصال بالإنترنت");
    return lines;
  }
  lines.push(`الدخول المجهول (Authentication): ${status}${status === 200 ? " ✓" : ` - ${short(body)}`}`);
  const token = await idToken(fb, fetchFn);
  if (!token.ok) {
    lines.push(`رمز الدخول: ${token.message}`);
    return lines;
  }
  try {
    const r = await fetchFn(documentUrl(fb, `starnet/${space}/tests/diag`), { headers: { Authorization: `Bearer ${token.value}` } });
    const text = await r.text();
    lines.push(`قراءة Firestore: ${r.status}${r.status === 200 || r.status === 404 ? " ✓" : ` - ${short(text)}`}`);
  } catch {
    lines.push("قراءة Firestore: لا اتصال");
    return lines;
  }
  // 📤 what this phone's link sent to the server: its head says how many batches were written
  if (memberId) {
    const head = await readDocument(fb, `starnet/${space}/link/${memberId}`, fetchFn);
    if (!head.ok) lines.push(`ما أرسله هذا الهاتف: ${head.message}`);
    else if (!head.value) lines.push("ما أرسله هذا الهاتف: لا شيء بعد على الخادم");
    else lines.push(`ما أرسله هذا الهاتف: ${Number(head.value.seq ?? 0)} دفعة على الخادم${head.value.at ? ` (آخر إرسال ${head.value.at.slice(11, 19)})` : ""}`);
    const team = await readDocument(fb, `starnet/${space}/team/members`, fetchFn);
    lines.push(team.ok && team.value?.iv ? "قائمة الفريق على الخادم: ✓" : "قائمة الفريق على الخادم: لا شيء بعد");
  }
  return lines;
}

