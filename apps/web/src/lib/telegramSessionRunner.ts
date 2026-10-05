"use client";

/**
 * 📋 A Starlink session sent to a bot (telegramSession.ts joins Telegram's parts): from his own
 * bot it becomes a new device at once - its browser signed in, then «مزامنة» reads its email,
 * KIT and dates (a device already on the app shows «⚠️ مكرّر» with «دمج»); from a linked rep it
 * waits in «طلبات المناديب» for his approval. The session itself is never logged.
 */

import { HOME_ROUTE, REPS_ROUTE, tellOwner } from "./appEvents";
import { loadDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { demoAccounts } from "./demoData";
import { importAccountSessions, triggerImmediateSync } from "./localBrowser";
import { ACCOUNTS_CHANGED_EVENT } from "./repMenuRecords";
import { addRepRequest, loadRepRequests, resolveRepRequest, saveRepRequests } from "./repRequests";
import { isDemoMode } from "./settingsStore";
import { sendRepText, sendTelegramText } from "./telegram";
import { SessionCollector, sessionDevice } from "./telegramSession";

const collector = new SessionCollector();

export type SessionDeviceResult = { ok: true; id: string; name: string } | { ok: false; message: string };

/** A new device whose browser holds `cookiesByUrl`, then «مزامنة» on it. Nothing is added when
 * the session can't be put in its browser. */
export async function addSessionDevice(cookiesByUrl: Record<string, string>, extra: { repId?: string } = {}): Promise<SessionDeviceResult> {
  if (!isDemoMode()) return { ok: false, message: "إضافة جهاز من جلسة تعمل في وضع الهاتف فقط" };
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}`;
  const now = new Date();
  const imported = await importAccountSessions({ [id]: cookiesByUrl });
  if (!imported.ok || imported.importedCount === 0) return { ok: false, message: "تعذّر وضع الجلسة في متصفح جديد - افتح التطبيق وجرّب «📋 لصق جلسة»" };
  const device = sessionDevice(id, now, extra.repId ? { representativeId: extra.repId, addedByRepId: extra.repId, addedByRepAt: now.toISOString() } : {});
  saveDemoAccounts([device, ...loadDemoAccounts(demoAccounts)]);
  window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));
  void triggerImmediateSync(id);
  return { ok: true, id, name: device.name };
}

/** His own bot: true when the message was (part of) a session - then it's not a command. */
export async function handleOwnerSessionText(text: string): Promise<boolean> {
  const step = collector.add("owner", text, Date.now());
  if (step.status === "ignored") return false;
  if (step.status === "waiting") return true;
  if (step.status === "failed") {
    await sendTelegramText(`📋 ${step.message}`);
    return true;
  }
  const added = await addSessionDevice(step.cookiesByUrl);
  if (!added.ok) {
    await tellOwner(`📋 ${added.message}`, HOME_ROUTE);
    return true;
  }
  await tellOwner(
    `✅ أُضيف «${added.name}» من الجلسة (${step.count} كوكيز) - متصفحه مسجّل الدخول.\n🔄 تعمل المزامنة الآن لقراءة بريده وKIT وتاريخ تجديده؛ غيّر اسمه واربطه بزبونه من بطاقته.`,
    HOME_ROUTE,
  );
  return true;
}

/** A linked rep: the session waits for his approval in «طلبات المناديب». */
export async function handleRepSessionText(repId: string, repName: string, chatId: string, text: string): Promise<boolean> {
  const step = collector.add(`rep:${chatId}`, text, Date.now());
  if (step.status === "ignored") return false;
  if (step.status === "waiting") return true;
  if (step.status === "failed") {
    await sendRepText(repId, `📋 ${step.message}`, undefined, "reps", chatId);
    return true;
  }
  saveRepRequests(addRepRequest(loadRepRequests(), { repId, kind: "session", text: `📋 جلسة ستارلينك (${step.count} كوكيز)`, cookies: step.cookiesByUrl }));
  await sendRepText(repId, "📥 وصلت الجلسة - تنتظر موافقة المسؤول، وسيصلك إشعار عند إضافة الجهاز.", undefined, "reps", chatId);
  await tellOwner(`📋 ${repName} أرسل جلسة ستارلينك لجهاز جديد - وافق عليها من «طلبات المناديب».`, REPS_ROUTE);
  return true;
}

/** He approved a rep's session: the new device (the rep's), the request closed, the rep told. */
export async function approveRepSession(requestId: string): Promise<SessionDeviceResult> {
  const request = loadRepRequests().find((r) => r.id === requestId && r.status === "pending" && r.kind === "session");
  if (!request?.cookies) return { ok: false, message: "الطلب لم يعد موجوداً" };
  const added = await addSessionDevice(request.cookies, { repId: request.repId });
  if (!added.ok) return added;
  saveRepRequests(resolveRepRequest(loadRepRequests(), requestId, "approved"));
  await sendRepText(request.repId, "✅ أضاف المسؤول الجهاز من جلستك - تعمل المزامنة الآن.");
  return added;
}
