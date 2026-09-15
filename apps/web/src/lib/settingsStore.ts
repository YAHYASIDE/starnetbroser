/**
 * Where the app's backend address and session tokens live - localStorage
 * only, never baked into the build. No server address or password is
 * hardcoded anywhere in this codebase; an empty API base URL means
 * "demo mode" (the safe, no-backend preview), and setting one here is
 * what switches the app over to real data.
 */
const API_BASE_URL_KEY = "starnet.apiBaseUrl";
const ACCESS_TOKEN_KEY = "starnet.accessToken";
const REFRESH_TOKEN_KEY = "starnet.refreshToken";

function safeGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private-browsing / storage-blocked - the app still works, it just
    // won't remember settings across reloads.
  }
}

export function getApiBaseUrl(): string {
  return (safeGet(API_BASE_URL_KEY) ?? "").trim().replace(/\/+$/, "");
}

export function setApiBaseUrl(url: string) {
  safeSet(API_BASE_URL_KEY, url.trim().replace(/\/+$/, "") || null);
}

export function isDemoMode(): boolean {
  return getApiBaseUrl() === "";
}

export function getAccessToken(): string | null {
  return safeGet(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return safeGet(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string | null, refreshToken: string | null) {
  safeSet(ACCESS_TOKEN_KEY, accessToken);
  safeSet(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  setTokens(null, null);
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null;
}
