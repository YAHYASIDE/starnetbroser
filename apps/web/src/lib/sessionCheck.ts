/**
 * "فحص جلسات الدخول": which devices' isolated Starlink browsers are still signed in - most needed
 * right after restoring a backup onto a new phone, when every session came from the file.
 */

import type { SessionStatus } from "@starnet/local-browser-plugin";

export type { SessionStatus };

export interface SessionCheckResult {
  status: SessionStatus;
  /** ISO time of the check. */
  checkedAt: string;
}

export type SessionCheckResults = Record<string, SessionCheckResult>;

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  loggedIn: "متصل",
  loginRequired: "يحتاج تسجيل دخول",
  none: "لا توجد جلسة",
  unknown: "تعذر التأكد",
};

/** A device the operator has to sign in again (open it and log in). */
export function needsLogin(status: SessionStatus | undefined): boolean {
  return status === "loginRequired" || status === "none";
}

export function withSessionStatus(results: SessionCheckResults, accountId: string, status: SessionStatus, now: Date = new Date()): SessionCheckResults {
  return { ...results, [accountId]: { status, checkedAt: now.toISOString() } };
}

/** The devices whose card shows the "sign in" bubble, among the given (existing) ones. */
export function accountIdsNeedingLogin(results: SessionCheckResults, accountIds: string[]): string[] {
  return accountIds.filter((id) => needsLogin(results[id]?.status));
}

/** A "تحديث من Starlink" result carries data read off the account's own portal - proof that it is
 * signed in, so its bubble can go without another check. Returns the same object when nothing
 * changed. */
export function markSignedInFromSync(results: SessionCheckResults, accountIds: string[], now: Date = new Date()): SessionCheckResults {
  let next = results;
  for (const id of accountIds) {
    if (results[id]?.status === "loggedIn") continue;
    if (!results[id]) continue; // never checked - nothing to correct
    next = withSessionStatus(next, id, "loggedIn", now);
  }
  return next;
}

export interface SessionCheckSummary {
  checked: number;
  loggedIn: number;
  needLogin: number;
  unknown: number;
}

export function summarizeSessionChecks(accountIds: string[], results: SessionCheckResults): SessionCheckSummary {
  const summary: SessionCheckSummary = { checked: 0, loggedIn: 0, needLogin: 0, unknown: 0 };
  for (const id of accountIds) {
    const result = results[id];
    if (!result) continue;
    summary.checked++;
    if (result.status === "loggedIn") summary.loggedIn++;
    else if (needsLogin(result.status)) summary.needLogin++;
    else summary.unknown++;
  }
  return summary;
}

/** Devices that need signing in first, then unclear ones, then the rest - the list reads as a to-do. */
export function sortForSessionCheck<T extends { id: string; name: string }>(accounts: T[], results: SessionCheckResults): T[] {
  const rank = (id: string) => {
    const status = results[id]?.status;
    if (needsLogin(status)) return 0;
    if (status === "unknown") return 1;
    if (status === undefined) return 2;
    return 3;
  };
  return [...accounts].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "ar"));
}

/** The warning shown after an export, when some devices went into the file without a session. */
export function sessionExportWarning(accountCount: number, sessionCount: number, inAndroidApp: boolean): string | null {
  if (accountCount === 0) return null;
  if (!inAndroidApp) return "هذه النسخة بدون جلسات دخول - الجلسات تُحفظ فقط من داخل تطبيق Android.";
  if (sessionCount === 0) {
    return "تنبيه: لم تُحفظ أي جلسة دخول. افتح كل جهاز بزر \"فتح\" وسجّل الدخول، ثم صدّر النسخة من جديد.";
  }
  if (sessionCount < accountCount) {
    return `تنبيه: ${accountCount - sessionCount} جهاز بدون جلسة دخول في هذه النسخة (لم يُفتح أو لم يُسجَّل دخوله).`;
  }
  return null;
}

// ---- Last results (a per-phone convenience; not backed up - a restored phone must re-check) ----

const RESULTS_KEY = "starnet.sessionCheck";

export function loadSessionCheckResults(): SessionCheckResults {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(RESULTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SessionCheckResults) : {};
  } catch {
    return {};
  }
}

export function saveSessionCheckResults(results: SessionCheckResults): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch {
    // A convenience only - the check can simply be run again.
  }
}

export function clearSessionCheckResults(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESULTS_KEY);
  } catch {
    // Nothing to do.
  }
}
