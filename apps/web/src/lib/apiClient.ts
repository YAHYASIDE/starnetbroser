import { StarlinkAccountSummary } from "@starnet/shared";
import { getAccessToken, getApiBaseUrl, getRefreshToken, setTokens } from "./settingsStore";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: "network" | "auth" | "server",
  ) {
    super(message);
  }
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new ApiError("لم يتم إعداد عنوان الخادم بعد - افتح الإعدادات لإدخاله", "network");
  }
  try {
    return await fetch(`${base}${path}`, init);
  } catch {
    throw new ApiError("تعذّر الوصول إلى الخادم - تحقق من الاتصال ومن عنوان الخادم في الإعدادات", "network");
  }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  if (!token) {
    throw new ApiError("يجب تسجيل الدخول أولًا", "auth");
  }
  const res = await rawFetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      throw new ApiError("انتهت الجلسة - يرجى تسجيل الدخول مرة أخرى", "auth");
    }
    return authedFetchOnce(path, init, refreshed.accessToken);
  }
  return res;
}

async function authedFetchOnce(path: string, init: RequestInit, accessToken: string): Promise<Response> {
  const res = await rawFetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(`فشل الطلب (رمز ${res.status})`, res.status >= 500 ? "server" : "auth");
  }
  return res;
}

async function tryRefresh(): Promise<TokenPair | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const res = await rawFetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as TokenPair;
  setTokens(body.accessToken, body.refreshToken);
  return body;
}

async function expectOk(res: Response): Promise<unknown> {
  if (!res.ok) {
    if (res.status === 401) throw new ApiError("بيانات الدخول غير صحيحة", "auth");
    throw new ApiError(`فشل الطلب (رمز ${res.status})`, res.status >= 500 ? "server" : "auth");
  }
  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await rawFetch("/health");
    return res.ok;
  } catch {
    return false;
  }
}

export async function login(email: string, password: string): Promise<void> {
  const res = await rawFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await expectOk(res)) as TokenPair;
  setTokens(body.accessToken, body.refreshToken);
}

export async function register(email: string, password: string): Promise<void> {
  const res = await rawFetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await expectOk(res)) as TokenPair;
  setTokens(body.accessToken, body.refreshToken);
}

export async function listAccounts(query?: string): Promise<StarlinkAccountSummary[]> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  const res = await authedFetch(`/accounts${qs}`);
  return expectOk(res) as Promise<StarlinkAccountSummary[]>;
}

export interface OpenSessionResponse {
  status: string;
  vncTicket: string;
  expiresInSeconds: number;
}

export function openSession(accountId: string): Promise<OpenSessionResponse> {
  return authedFetch(`/accounts/${accountId}/session/open`, { method: "POST" }).then(
    (res) => expectOk(res) as Promise<OpenSessionResponse>,
  );
}

export function stopSession(accountId: string): Promise<void> {
  return authedFetch(`/accounts/${accountId}/session/stop`, { method: "POST" }).then(() => undefined);
}

/** wss://.../ws/vnc/<ticket> - derived from the configured API base URL. */
export function vncWebSocketUrl(ticket: string): string {
  const base = getApiBaseUrl();
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/vnc/${ticket}`;
}
