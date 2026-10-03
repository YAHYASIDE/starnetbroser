"use client";

import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isRunningInAndroidApp } from "./localBrowser";
import { buildXlsx, type XlsxSheet } from "./xlsxWriter";

export type XlsxResult = { ok: true } | { ok: false; message: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Writes the workbook and hands it to the share sheet on Android (WhatsApp, Drive, Excel...),
 * or downloads it in a browser. */
export async function exportXlsx(sheets: XlsxSheet[], fileName: string, title: string): Promise<XlsxResult> {
  try {
    const bytes = buildXlsx(sheets);
    if (!isRunningInAndroidApp()) {
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    }
    const written = await Filesystem.writeFile({ path: fileName, data: toBase64(bytes), directory: Directory.Cache });
    await Share.share({ title, files: [written.uri] });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "تعذر إنشاء ملف Excel" };
  }
}
