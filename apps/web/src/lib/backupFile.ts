"use client";

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isRunningInAndroidApp } from "./localBrowser";

export type SaveResult = { ok: true } | { ok: false; message: string };

function backupFileName(): string {
  return `starnet-backup-${Date.now()}.starnetbackup`;
}

/**
 * Hands the (already encrypted) backup file to the user via the platform's native share sheet, so
 * they choose where it ends up (Drive, Files, another device, ...) - this module never decides
 * that itself. Falls back to a plain browser download on web (GitHub Pages preview), where there
 * is no native Filesystem/Share plugin to use.
 */
export async function saveAndShareBackupFile(fileContents: string): Promise<SaveResult> {
  const fileName = backupFileName();

  if (!isRunningInAndroidApp()) {
    try {
      const blob = new Blob([fileContents], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch {
      return { ok: false, message: "تعذر إنشاء الملف" };
    }
  }

  try {
    const written = await Filesystem.writeFile({
      path: fileName,
      data: fileContents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: "نسخة احتياطية STAR NET", files: [written.uri] });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر حفظ الملف" };
  }
}
