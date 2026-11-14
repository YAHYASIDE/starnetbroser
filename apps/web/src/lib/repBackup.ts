/**
 * 💾 A rep's backup carries his rep mode (his Nov 14 2026 ask: «أضف لكل المندوبين إمكانية نسخ البيانات وكل شيء إلى
 * Google Drive والهاتف»). Rep mode lives in `starnet.repMode` / `starnet.repBase` - phone settings, never in a
 * backup - so a rep's backup restored on a new phone came back as the owner's app (every page open) on his data.
 * Every backup (file, daily, Drive) now adds them under REP_MODE_BACKUP_KEY; a restore puts them back, so the
 * phone opens as that rep again. Pure over a storage object - tested in repBackup.test.ts.
 */

import type { AppDataSnapshot } from "./accountBackup";

/** In the backup's data only - consumed right after a restore, never left in storage. */
export const REP_MODE_BACKUP_KEY = "starnet_rep_mode_backup_v1";
const MODE_KEY = "starnet.repMode";
const BASE_KEY = "starnet.repBase";

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface RepModeBackup {
  mode: string;
  base: string;
}

function parse(raw: string | null | undefined): RepModeBackup | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<RepModeBackup>;
    return typeof v?.mode === "string" && typeof v.base === "string" ? { mode: v.mode, base: v.base } : null;
  } catch {
    return null;
  }
}

/** The backup's data plus this phone's rep mode (unchanged on the owner's phone). */
export function withRepMode(data: AppDataSnapshot, storage: KeyValueStorage): AppDataSnapshot {
  const mode = storage.getItem(MODE_KEY);
  const base = storage.getItem(BASE_KEY);
  if (!mode || !base) return data;
  return { ...data, [REP_MODE_BACKUP_KEY]: JSON.stringify({ mode, base }) };
}

/** Whose rep phone a backup is from: his name («» when unnamed), null = the owner's backup. */
export function backupRepName(data: AppDataSnapshot): string | null {
  const saved = parse(data[REP_MODE_BACKUP_KEY]);
  if (!saved) return null;
  try {
    const name = (JSON.parse(saved.mode) as { name?: unknown })?.name;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

/** After restoreAppData: the restored rep mode back in its place, the carrier key removed. True = a rep's backup. */
export function applyRestoredRepMode(storage: KeyValueStorage): boolean {
  const saved = parse(storage.getItem(REP_MODE_BACKUP_KEY));
  storage.removeItem(REP_MODE_BACKUP_KEY);
  if (!saved) return false;
  storage.setItem(MODE_KEY, saved.mode);
  storage.setItem(BASE_KEY, saved.base);
  return true;
}
