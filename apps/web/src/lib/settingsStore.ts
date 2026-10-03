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

const LAST_BACKUP_AT_KEY = "starnet.lastBackupAt";

/** ISO timestamp of the last time an export backup file was actually created (see
 * backupFile.ts's saveAndShareBackupFile) - null means never, which the reminders center
 * (reminders.ts) treats the same as "long overdue", never a guessed date. */
export function getLastBackupAt(): string | null {
  return safeGet(LAST_BACKUP_AT_KEY);
}

export function recordBackupExported(now: Date = new Date()) {
  safeSet(LAST_BACKUP_AT_KEY, now.toISOString());
}

/** "dark" (default - the app's satellite/Starlink look) unless the operator picks "light" or
 * "system" (follow the device) in الإعدادات. Always written to data-theme on <html>, which
 * globals.css keys off of. */
export type ThemePreference = "system" | "light" | "dark";
const THEME_KEY = "starnet.theme";

export function getThemePreference(): ThemePreference {
  const raw = safeGet(THEME_KEY);
  return raw === "light" || raw === "system" ? raw : "dark";
}

export function setThemePreference(theme: ThemePreference) {
  safeSet(THEME_KEY, theme === "dark" ? null : theme);
  applyThemePreference(theme);
}

/** Sets the data-theme attribute globals.css keys off of - called once on every page load (see
 * the inline script in layout.tsx, which does the same before first paint to avoid a flash of
 * the wrong theme) and again whenever the operator changes the setting. */
export function applyThemePreference(theme: ThemePreference = getThemePreference()) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

/** Off by default - an explicit opt-in from الإعدادات that shows short inline hints on the
 * screens most worth explaining, rather than a full walkthrough of the whole app. */
const HELP_MODE_KEY = "starnet.helpMode";

export function isHelpModeEnabled(): boolean {
  return safeGet(HELP_MODE_KEY) === "1";
}

export function setHelpModeEnabled(enabled: boolean) {
  safeSet(HELP_MODE_KEY, enabled ? "1" : null);
}

/** The currency a new store invoice's form starts on (InvoiceSection.tsx) - "MRU" (the app's own
 * long-standing hardcoded default) unless the operator picks a different one from الإعدادات. Never
 * validated against LEDGER_CURRENCIES here (that would couple this module to ledgerStore.ts for a
 * single string) - an unrecognized/stale value just falls back to "MRU" wherever it's read, same
 * as never having been set. */
const DEFAULT_INVOICE_CURRENCY_KEY = "starnet.defaultInvoiceCurrency";

export function getDefaultInvoiceCurrency(): string {
  return safeGet(DEFAULT_INVOICE_CURRENCY_KEY) ?? "MRU";
}

export function setDefaultInvoiceCurrency(currencyCode: string) {
  safeSet(DEFAULT_INVOICE_CURRENCY_KEY, currencyCode);
}

/** On by default (existing behavior, never a silent regression for someone who never opens
 * الإعدادات) - an explicit opt-out that hides just the numeric badge on the header's reminders
 * bell (HomeView.tsx), never the bell icon or the /reminders page itself, both of which stay
 * reachable either way. */
const REMINDERS_BADGE_KEY = "starnet.remindersBadgeHidden";

export function isRemindersBadgeEnabled(): boolean {
  return safeGet(REMINDERS_BADGE_KEY) !== "1";
}

export function setRemindersBadgeEnabled(enabled: boolean) {
  safeSet(REMINDERS_BADGE_KEY, enabled ? null : "1");
}
