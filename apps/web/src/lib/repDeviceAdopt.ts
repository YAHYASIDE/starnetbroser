"use client";

import { loadDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { demoAccounts } from "./demoData";
import { importAccountSessions } from "./localBrowser";
import { ACCOUNTS_CHANGED_EVENT } from "./repMenuRecords";
import { isDemoMode } from "./settingsStore";
import { deviceDisplayName, readRepDeviceFile, repDeviceCode } from "./repDeviceTransfer";
import { loadRepRequests, resolveRepRequest, saveRepRequests } from "./repRequests";
import { sendRepText } from "./telegram";

export type AdoptResult = { ok: true; name: string } | { ok: false; message: string };

/**
 * The codes a rep typed for his device («كود البريد», «كود الواي فاي») - read from the encrypted
 * file only when the operator opens the add dialog for it, never kept anywhere in plain text.
 */
export async function repDeviceSecrets(requestId: string): Promise<{ emailPassword?: string; wifiPassword?: string }> {
  const request = loadRepRequests().find((r) => r.id === requestId && r.status === "pending");
  const code = request ? repDeviceCode(request.repId) : undefined;
  if (!request?.file || !code) return {};
  try {
    const { device } = await readRepDeviceFile(request.file, code);
    return { ...(device.emailPassword ? { emailPassword: device.emailPassword } : {}), ...(device.wifiPassword ? { wifiPassword: device.wifiPassword } : {}) };
  } catch {
    return {};
  }
}

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
  const imported = await importAccountSessions({
    [accountId]: payload.cookies,
    // Restore the device's Outlook mailbox too when the rep sent it (its own profile on the app).
    ...(payload.mailCookies && Object.keys(payload.mailCookies).length > 0 ? { [`mail:${accountId}`]: payload.mailCookies } : {}),
  });
  saveRepRequests(resolveRepRequest(loadRepRequests(), requestId, "approved"));
  // 📱 «أضافه المندوب» on its card for good.
  if (isDemoMode()) {
    const at = new Date().toISOString();
    saveDemoAccounts(loadDemoAccounts(demoAccounts).map((a) => (a.id === accountId ? { ...a, addedByRepId: request.repId, addedByRepAt: at } : a)));
    window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
  }
  const name = deviceDisplayName(payload.device);
  await sendRepText(request.repId, `✅ أضاف المسؤول جهاز ${name} (${payload.device.clientName}).\nاضغط «✅ وصل» في تطبيقك إن لم تفعل - لتُحذف الجلسة من هاتفك.`);
  if (!imported.ok || imported.importedCount === 0) return { ok: false, message: `أُضيف ${name} لكن تعذّر نقل الدخول - افتحه وسجّل الدخول` };
  return { ok: true, name };
}
