"use client";

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { exportAccountSessions, isRunningInAndroidApp } from "./localBrowser";
import { buildRepDeviceFile, repDeviceFileName, type RepModeDevice } from "./repDeviceTransfer";

export type ShareDeviceResult = { ok: true } | { ok: false; message: string };

/**
 * 📤 The rep's device, with the Starlink session of its isolated browser, encrypted with his code
 * and handed to the share sheet - he picks Telegram and the reps bot chat. Nothing is sent without
 * him choosing where; the file sits (encrypted) in the app's cache until he confirms it arrived.
 */
export async function shareRepDevice(device: RepModeDevice, code: string): Promise<ShareDeviceResult> {
  if (!isRunningInAndroidApp()) return { ok: false, message: "الإرسال يعمل داخل تطبيق Android فقط" };
  const sessions = await exportAccountSessions([device.id]);
  const cookies = sessions[device.id];
  if (!cookies || Object.keys(cookies).length === 0) return { ok: false, message: "سجّل الدخول إلى Starlink أولاً ثم أرسل" };
  const { id: _id, createdAt: _created, sentAt: _sent, ...details } = device;
  try {
    const text = await buildRepDeviceFile({ device: details, cookies, createdAt: new Date().toISOString() }, code);
    const written = await Filesystem.writeFile({ path: repDeviceFileName(device.id), data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: "جهاز لـ STAR NET", files: [written.uri], dialogTitle: "أرسله إلى بوت المندوبين في تيليغرام" });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // Closing the share sheet without choosing isn't an error worth showing.
    if (/cancel/i.test(message)) return { ok: false, message: "لم يُرسل - اختر تيليغرام ثم محادثة البوت" };
    return { ok: false, message: "تعذّر تجهيز الملف" };
  }
}

/** After it arrived: the cached file goes too. */
export async function forgetRepDeviceFile(device: RepModeDevice): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    await Filesystem.deleteFile({ path: repDeviceFileName(device.id), directory: Directory.Cache });
  } catch {
    // never written / already gone
  }
}
