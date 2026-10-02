"use client";

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { exportAccountSessions, isRunningInAndroidApp } from "./localBrowser";
import { buildRepChangeSet, buildRepChangesFile, countRepChanges, newDeviceIds, repChangesFileName } from "./repChanges";
import { loadRepCopy } from "./repCopy";
import { loadRepMode } from "./repDeviceTransfer";
import { loadRepBase, readStores } from "./repWorkspace";

export type SendChangesResult = { ok: true; count: number } | { ok: false; message: string };

/**
 * 📤 «إرسال تسجيلاتي» on the rep's phone: everything he recorded since the last copy, with the
 * Starlink (and mailbox) sessions of the devices he added, encrypted with his code and handed to
 * the share sheet - he picks Telegram and the reps bot chat (or sends it to the operator directly).
 */
export async function shareRepChanges(): Promise<SendChangesResult> {
  if (!isRunningInAndroidApp()) return { ok: false, message: "الإرسال يعمل داخل تطبيق Android فقط" };
  const mode = loadRepMode();
  const copy = loadRepCopy();
  if (!mode || !copy) return { ok: false, message: "افتح نسخة أجهزتك من المسؤول أولاً" };
  const base = loadRepBase();
  const changes = buildRepChangeSet(readStores(), base);
  const count = countRepChanges(changes);
  if (count === 0) return { ok: false, message: "لا توجد تسجيلات جديدة" };
  const sessions = await exportAccountSessions(newDeviceIds(changes, base), true);
  const now = new Date();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rc-${now.getTime()}`;
  try {
    const text = await buildRepChangesFile({ id, repId: copy.repId, sentAt: now.toISOString(), baseSentAt: copy.sentAt, changes, sessions }, mode.code);
    const written = await Filesystem.writeFile({ path: repChangesFileName(copy.repId, now), data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: "تسجيلاتي لـ STAR NET", files: [written.uri], dialogTitle: "أرسله إلى بوت المندوبين في تيليغرام" });
    markRepChangesSent(now.toISOString(), count);
    return { ok: true, count };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/cancel/i.test(message)) return { ok: false, message: "لم يُرسل - اختر تيليغرام ثم محادثة البوت" };
    return { ok: false, message: "تعذّر تجهيز الملف" };
  }
}

// ---- when he last sent (a convenience on his phone, not business data) ----

const SENT_KEY = "starnet.repChangesSent";

export interface RepChangesSent {
  at: string;
  count: number;
}

export function loadRepChangesSent(): RepChangesSent | null {
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as RepChangesSent) : null;
    return parsed && typeof parsed.at === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function markRepChangesSent(at: string, count: number): void {
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify({ at, count }));
  } catch {
    // only the "sent" line is lost
  }
}
