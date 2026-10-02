"use client";

import { WrongPasswordError } from "./backupCrypto";
import { loadDemoAccounts } from "./demoAccountStore";
import { demoAccounts } from "./demoData";
import { importAccountSessions } from "./localBrowser";
import { applyRepChangeSet, describeRepChanges, readRepChangesFile, repChangesFileRep, totalApplied } from "./repChanges";
import { sendRepCopy } from "./repCopySend";
import { repDeviceCode } from "./repDeviceTransfer";
import { ACCOUNTS_CHANGED_EVENT } from "./repMenuRecords";
import { loadRepresentativeStore } from "./repStore";
import { readStores } from "./repWorkspace";
import { isDemoMode } from "./settingsStore";
import { sendRepText, sendTelegramText } from "./telegram";

export type ReceiveChangesResult = { ok: true; message: string } | { ok: false; message: string };

/** Files already applied (by id) - a file opened twice is applied once. Internal, not backed up. */
const APPLIED_KEY = "starnet.repChangesApplied";

function loadApplied(): string[] {
  try {
    const raw = window.localStorage.getItem(APPLIED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function markApplied(id: string): void {
  try {
    window.localStorage.setItem(APPLIED_KEY, JSON.stringify([...loadApplied(), id].slice(-200)));
  } catch {
    // worst case the same file could be applied again - it only rewrites the same records
  }
}

/**
 * 📥 A rep's «تسجيلاتي» file on the operator's phone (from the reps bot, or opened with STAR NET):
 * applied straight away inside the rep's scope (lib/repChanges.ts), the sessions of the devices he
 * added restored, the rep told what was recorded, and a fresh copy sent back to him - so his ⏳
 * marks clear. `fromRepId`: the bot chat it came from (the file must be his).
 */
export async function receiveRepChanges(text: string, fromRepId?: string): Promise<ReceiveChangesResult> {
  const repId = repChangesFileRep(text);
  if (!repId) return { ok: false, message: "هذا ليس ملف تسجيلات مندوب" };
  if (fromRepId && fromRepId !== repId) return { ok: false, message: "ملف تسجيلات لمندوب آخر - لم يُثبَّت" };
  const rep = loadRepresentativeStore()[repId];
  if (!rep) return { ok: false, message: "المندوب صاحب الملف غير موجود عندك" };
  const code = repDeviceCode(repId);
  if (!code) return { ok: false, message: `لا يوجد رمز تطبيق للمندوب ${rep.name}` };
  if (!isDemoMode()) return { ok: false, message: "تثبيت تسجيلات المندوب يعمل مع بيانات الهاتف فقط" };

  let payload;
  try {
    payload = await readRepChangesFile(text, code);
  } catch (err) {
    return { ok: false, message: err instanceof WrongPasswordError ? `رمز ${rep.name} لا يفتح الملف - أرسل له رمزه من جديد` : "تعذّر فتح ملف التسجيلات" };
  }
  if (loadApplied().includes(payload.id)) return { ok: false, message: `تسجيلات ${rep.name} هذه ثُبّتت من قبل` };

  const result = applyRepChangeSet(readStores(), payload.changes, repId);
  try {
    for (const [key, value] of Object.entries(result.stores)) window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return { ok: false, message: "ذاكرة الهاتف ممتلئة - لم تُثبَّت تسجيلات المندوب" };
  }
  markApplied(payload.id);

  const sessions: Record<string, Record<string, string>> = {};
  for (const id of result.newDeviceIds) {
    if (payload.sessions[id]) sessions[id] = payload.sessions[id]!;
    if (payload.sessions[`mail:${id}`]) sessions[`mail:${id}`] = payload.sessions[`mail:${id}`]!;
  }
  if (Object.keys(sessions).length > 0) await importAccountSessions(sessions);
  window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));

  const what = describeRepChanges(result.summary);
  const refused = result.summary.refused ? `\n⚠️ ${result.summary.refused} سجل خارج أجهزتك لم يُقبل.` : "";
  const applied = totalApplied(result.summary);
  // A fresh copy back to him: what he sent is now the operator's data, so his ⏳ marks clear.
  const copy = applied > 0 ? await sendRepCopy(rep, loadDemoAccounts(demoAccounts)) : null;
  await sendRepText(
    repId,
    `✅ ثبّت المسؤول تسجيلاتك: ${what}${refused}${copy?.ok ? "\n📋 وصلتك نسخة جديدة - افتحها لتختفي علامات ⏳." : ""}`,
  );
  await sendTelegramText(`📥 ثُبّتت تسجيلات المندوب ${rep.name}: ${what}${copy && !copy.ok ? `\n⚠️ لم تُرسل له نسخة جديدة: ${copy.message}` : ""}`);
  return { ok: true, message: `✓ ثُبّتت تسجيلات ${rep.name}: ${what}` };
}
