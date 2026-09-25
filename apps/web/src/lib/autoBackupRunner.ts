"use client";

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { collectAppData, createEncryptedBackupFile } from "./accountBackup";
import {
  AUTO_BACKUP_DIR,
  autoBackupFileName,
  filesToPrune,
  getAutoBackupLastRun,
  getAutoBackupPassword,
  isAutoBackupDue,
  recordAutoBackupRun,
} from "./autoBackup";
import { exportAccountSessions, isRunningInAndroidApp } from "./localBrowser";
import { recordBackupExported } from "./settingsStore";

export type AutoBackupOutcome =
  | { status: "skipped" }
  | { status: "saved"; file: string; inAppStorage: boolean }
  | { status: "failed"; message: string };

/** Recorded file paths carry which directory they're in: "data:" marks the app-private fallback. */
const DATA_MARK = "data:";

/** Writes today's encrypted backup to Documents/STARNET (Android only), pruning to the last 7.
 * `force` runs even if today's file already exists (the "نسخ الآن" button). */
export async function runAutoBackup(accounts: StarlinkAccountSummary[], force = false): Promise<AutoBackupOutcome> {
  const password = getAutoBackupPassword();
  const today = new Date().toISOString().slice(0, 10);
  if (!password || !isRunningInAndroidApp()) return { status: "skipped" };
  if (!force && !isAutoBackupDue(getAutoBackupLastRun().date, today)) return { status: "skipped" };
  try {
    const sessions = await exportAccountSessions(accounts.map((a) => a.id));
    const created = await createEncryptedBackupFile(accounts, sessions, password, collectAppData(window.localStorage));
    if (!created.ok) return { status: "failed", message: created.message };
    const file = `${AUTO_BACKUP_DIR}/${autoBackupFileName(today)}`;
    // Public Documents first (survives uninstalling the app); older Android versions that don't
    // allow it fall back to the app's own storage, from where "مشاركة آخر نسخة" can still copy it.
    let directory = Directory.Documents;
    try {
      await Filesystem.writeFile({ path: file, data: created.fileContents, directory, encoding: Encoding.UTF8, recursive: true });
    } catch {
      directory = Directory.Data;
      await Filesystem.writeFile({ path: file, data: created.fileContents, directory, encoding: Encoding.UTF8, recursive: true });
    }
    try {
      const listing = await Filesystem.readdir({ path: AUTO_BACKUP_DIR, directory });
      for (const name of filesToPrune(listing.files.map((f) => f.name))) {
        await Filesystem.deleteFile({ path: `${AUTO_BACKUP_DIR}/${name}`, directory });
      }
    } catch {
      // Pruning is best-effort - an extra old file is harmless.
    }
    const inAppStorage = directory === Directory.Data;
    recordAutoBackupRun(today, inAppStorage ? `${DATA_MARK}${file}` : file);
    recordBackupExported();
    return { status: "saved", file, inAppStorage };
  } catch (err) {
    return { status: "failed", message: err instanceof Error ? err.message : "تعذر حفظ النسخة التلقائية" };
  }
}

/** Opens the share sheet for the newest auto-backup file (to send it to Drive, WhatsApp, a PC…). */
export async function shareLatestAutoBackup(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { file } = getAutoBackupLastRun();
  if (!file) return { ok: false, message: "لا توجد نسخة تلقائية بعد" };
  try {
    const inAppStorage = file.startsWith(DATA_MARK);
    const { uri } = await Filesystem.getUri({
      path: inAppStorage ? file.slice(DATA_MARK.length) : file,
      directory: inAppStorage ? Directory.Data : Directory.Documents,
    });
    await Share.share({ title: "نسخة احتياطية STAR NET", files: [uri] });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر مشاركة النسخة" };
  }
}
