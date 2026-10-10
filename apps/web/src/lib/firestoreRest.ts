/**
 * ☁️ A tiny Firebase client over plain HTTPS (no SDK): an anonymous sign-in (Firebase
 * Authentication → Anonymous) and reading / writing one text field of a Firestore document.
 * Every call resolves to a result with an Arabic message - a network or setup problem never
 * throws into the app. `fetchFn` is injectable for tests.
 */

import type { LiveSyncConfig } from "./liveSyncConfig";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface AuthToken {
  apiKey: string;
  idToken: string;
  refreshToken: string;
  /** ms epoch */
  expiresAt: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

const AUTH_KEY = "starnet.liveSyncAuth";

function loadToken(apiKey: string): AuthToken | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(AUTH_KEY) : null;
    const token = raw ? (JSON.parse(raw) as AuthToken) : null;
    return token && token.apiKey === apiKey && token.idToken && token.refreshToken ? token : null;
  } catch {
    return null;
  }
}

function saveToken(token: AuthToken | null): void {
  try {
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(AUTH_KEY, JSON.stringify(token));
    else window.localStorage.removeItem(AUTH_KEY);
  } catch {
    // re-signs in next time
  }
}

/** Firebase's error text → what he should do (the setup steps he was given). */
export function explainFirebaseError(status: number, body: string): string {
  const text = body.toUpperCase();
  if (text.includes("API_KEY_INVALID") || text.includes("API KEY NOT VALID")) return "apiKey غير صحيح - انسخه من جديد من إعدادات المشروع";
  if (text.includes("ADMIN_ONLY_OPERATION") || text.includes("OPERATION_NOT_ALLOWED")) return "فعّل الدخول المجهول: Authentication ← Sign-in method ← Anonymous ← Enable";
  if (text.includes("DATABASE") && text.includes("NOT EXIST")) return "أنشئ قاعدة Firestore: Build ← Firestore Database ← Create database";
  if (status === 403 || text.includes("PERMISSION_DENIED")) return "قواعد Firestore تمنع الكتابة - الصق القواعد وانشرها (Rules ← Publish)";
  if (status === 404 && text.includes("PROJECT")) return "projectId غير صحيح";
  if (status === 0) return "لا يوجد اتصال بالإنترنت";
  return `خطأ من Firebase (${status})`;
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<{ status: number; body: string }> {
  try {
    const res = await fetchFn(url, init);
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0, body: "" };
  }
}

/** A valid ID token: the saved one, refreshed when about to expire, or a new anonymous sign-in. */
export async function idToken(config: Pick<LiveSyncConfig, "apiKey">, fetchFn: FetchFn = fetch, now = Date.now()): Promise<Result<string>> {
  const saved = loadToken(config.apiKey);
  if (saved && saved.expiresAt - 60_000 > now) return { ok: true, value: saved.idToken };
  if (saved) {
    const r = await call(fetchFn, `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(saved.refreshToken)}`,
    });
    if (r.status === 200) {
      const data = JSON.parse(r.body) as { id_token: string; refresh_token: string; expires_in: string };
      saveToken({ apiKey: config.apiKey, idToken: data.id_token, refreshToken: data.refresh_token, expiresAt: now + Number(data.expires_in) * 1000 });
      return { ok: true, value: data.id_token };
    }
    saveToken(null);
  }
  const r = await call(fetchFn, `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  const data = JSON.parse(r.body) as { idToken: string; refreshToken: string; expiresIn: string };
  saveToken({ apiKey: config.apiKey, idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: now + Number(data.expiresIn) * 1000 });
  return { ok: true, value: data.idToken };
}

export function documentUrl(config: Pick<LiveSyncConfig, "projectId">, path: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** The document's text fields, or null when it doesn't exist yet. */
export async function readDocument(
  config: Pick<LiveSyncConfig, "apiKey" | "projectId">,
  path: string,
  fetchFn: FetchFn = fetch,
): Promise<Result<Record<string, string> | null>> {
  const token = await idToken(config, fetchFn);
  if (!token.ok) return token;
  const r = await call(fetchFn, documentUrl(config, path), { headers: { Authorization: `Bearer ${token.value}` } });
  // A document not written yet = null; a missing database is a setup step («does not exist»).
  if (r.status === 404 && !/does not exist/i.test(r.body)) return { ok: true, value: null };
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  const doc = JSON.parse(r.body) as { fields?: Record<string, { stringValue?: string }> };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) if (typeof v.stringValue === "string") out[k] = v.stringValue;
  return { ok: true, value: out };
}

/** Writes (creates or replaces) the document's text fields. */
export async function writeDocument(
  config: Pick<LiveSyncConfig, "apiKey" | "projectId">,
  path: string,
  fields: Record<string, string>,
  fetchFn: FetchFn = fetch,
): Promise<Result<true>> {
  const token = await idToken(config, fetchFn);
  if (!token.ok) return token;
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])) };
  const r = await call(fetchFn, documentUrl(config, path), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status !== 200) return { ok: false, message: explainFirebaseError(r.status, r.body) };
  return { ok: true, value: true };
}
