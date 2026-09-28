"use client";

import { importAccountSessions } from "./localBrowser";
import { deviceDisplayName, readRepDeviceFile, repDeviceCode } from "./repDeviceTransfer";
import { loadRepRequests, resolveRepRequest, saveRepRequests } from "./repRequests";
import { sendRepText } from "./telegram";

export type AdoptResult = { ok: true; name: string } | { ok: false; message: string };

/**
 * The operator saved the device a rep sent from his app (📱): its Starlink session goes into the
 * new account's isolated browser, the request is closed (its encrypted file dropped) and the rep
 * is told he can delete his copy. Called right after the add-device dialog saves `accountId`.
 */
export async function adoptRepDevice(requestId: string, accountId: string): Promise<AdoptResult> {
  const request = loadRepRequests().find((r) => r.id === requestId && r.status === "pending");
  if (!request?.file) return { ok: false, message: "طلب الجهاز لم يعد موجوداً" };
  const code = repDeviceCode(request.repId);
  if (!code) return { ok: false, message: "لا يوجد رمز لهذا المندوب - أُضيف الجهاز بدون الجلسة" };
  let payload;
  try {
    payload = await readRepDeviceFile(request.file, code);
  } catch {
    return { ok: false, message: "رمز المندوب لا يفتح الملف - أُضيف الجهاز بدون الجلسة" };
  }
  const imported = await importAccountSessions({ [accountId]: payload.cookies });
  saveRepRequests(resolveRepRequest(loadRepRequests(), requestId, "approved"));
  const name = deviceDisplayName(payload.device);
  await sendRepText(request.repId, `✅ أضاف المسؤول جهاز ${name} (${payload.device.clientName}).\nاضغط «✅ وصل» في تطبيقك إن لم تفعل - لتُحذف الجلسة من هاتفك.`);
  if (!imported.ok || imported.importedCount === 0) return { ok: false, message: `أُضيف ${name} لكن تعذّر نقل الدخول - افتحه وسجّل الدخول` };
  return { ok: true, name };
}
