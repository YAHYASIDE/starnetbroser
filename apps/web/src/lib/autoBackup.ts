/**
 * النسخ الاحتياطي التلقائي اليومي: once a day (the first time the Android app opens that day) a
 * full encrypted backup - the same file as the manual export (accountBackup.ts) - is written to
 * the phone's Documents/STARNET folder, keeping the last 7. Files there survive uninstalling the
 * app; the operator can still copy them anywhere from "مشاركة آخر نسخة".
 *
 * The backup password is set once in الإعدادات and kept on this phone only (a `starnet.` settings
 * key - never inside a backup itself), so each day's file can be encrypted without asking again.
 */

export const AUTO_BACKUP_DIR = "STARNET";
export const AUTO_BACKUP_KEEP = 7;
const PREFIX = "starnet-auto-";
const SUFFIX = ".starnetbackup";

const PASSWORD_KEY = "starnet.autoBackupPassword";
const LAST_RUN_KEY = "starnet.autoBackupLastDate";
const LAST_FILE_KEY = "starnet.autoBackupLastFile";

export function autoBackupFileName(date: string): string {
  return `${PREFIX}${date}${SUFFIX}`;
}

/** The auto-backup files beyond the newest `keep`, oldest first - what to delete. Other files in
 * the folder (e.g. a manual copy) are never touched. */
export function filesToPrune(names: string[], keep = AUTO_BACKUP_KEEP): string[] {
  const ours = names.filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX)).sort();
  return ours.slice(0, Math.max(0, ours.length - keep));
}

export function isAutoBackupDue(lastRunDate: string | null, today: string): boolean {
  return lastRunDate !== today;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable - auto backup simply stays off.
  }
}

export function getAutoBackupPassword(): string | null {
  return safeGet(PASSWORD_KEY);
}

export function setAutoBackupPassword(password: string | null) {
  safeSet(PASSWORD_KEY, password);
  if (password === null) safeSet(LAST_RUN_KEY, null);
}

export function getAutoBackupLastRun(): { date: string | null; file: string | null } {
  return { date: safeGet(LAST_RUN_KEY), file: safeGet(LAST_FILE_KEY) };
}

export function recordAutoBackupRun(date: string, file: string) {
  safeSet(LAST_RUN_KEY, date);
  safeSet(LAST_FILE_KEY, file);
}
