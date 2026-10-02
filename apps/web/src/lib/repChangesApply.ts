"use client";

import { WrongPasswordError } from "./backupCrypto";
import { loadDemoAccounts } from "./demoAccountStore";
import { demoAccounts } from "./demoData";
import { importAccountSessions } from "./localBrowser";
import {
  applyRepChangeSet,
  changeSetOf,
  describeItems,
  isItemDecided,
  listRepChangeItems,
  PAIRING_REP,
  readRepChangesFile,
  repChangesFileRep,
  withDecision,
  type RepChangeItem,
  type RepChangesPayload,
  type RepDecisions,
} from "./repChanges";
export { REP_INBOX_EVENT, repInboxCount } from "./repInbox";
import { sendRepCopy } from "./repCopySend";
import { loadRepInbox, saveRepInbox, type RepInboxFile } from "./repInbox";
import { repDeviceCode, repPhoneKey, setRepPhoneKey } from "./repDeviceTransfer";
import { ACCOUNTS_CHANGED_EVENT } from "./repMenuRecords";
import { loadRepresentativeStore } from "./repStore";
import { readStores } from "./repWorkspace";
import { isDemoMode } from "./settingsStore";
import { sendRepText, sendTelegramText } from "./telegram";

export type ReceiveChangesResult = { ok: true; message: string } | { ok: false; message: string };

async function openFile(text: string, repId: string): Promise<RepChangesPayload> {
  const code = repDeviceCode(repId);
  if (!code) throw new Error("no code");
  return readRepChangesFile(text, code);
}

function waiting(payload: RepChangesPayload, decisions: RepDecisions): RepChangeItem[] {
  return listRepChangeItems(payload.changes, readStores()).filter((item) => !isItemDecided(item, decisions));
}

/**
 * 📥 A rep's «تسجيلاتي» file on the operator's phone (from the reps bot, or opened with STAR NET):
 * kept, still encrypted, for the operator to review item by item - nothing reaches his devices
 * before he approves it. `fromRepId`: the bot chat it came from (the file must be his).
 */
export async function receiveRepChanges(text: string, fromRepId?: string): Promise<ReceiveChangesResult> {
  const fileRep = repChangesFileRep(text);
  if (!fileRep) return { ok: false, message: "هذا ليس ملف تسجيلات مندوب" };
  // 🔗 «ربط هاتفي» before his first copy: who he is comes from his own bot chat only.
  if (fileRep === PAIRING_REP && !fromRepId) return { ok: false, message: "ربط هاتف المندوب يتم عبر بوت المندوبين فقط" };
  const repId = fileRep === PAIRING_REP ? fromRepId! : fileRep;
  if (fromRepId && fromRepId !== repId) return { ok: false, message: "ملف تسجيلات لمندوب آخر - لم يُقبل" };
  const rep = loadRepresentativeStore()[repId];
  if (!rep) return { ok: false, message: "المندوب صاحب الملف غير موجود عندك" };
  if (!repDeviceCode(repId)) return { ok: false, message: `لا يوجد رمز تطبيق للمندوب ${rep.name}` };
  if (!isDemoMode()) return { ok: false, message: "تسجيلات المندوب تعمل مع بيانات الهاتف فقط" };

  let payload: RepChangesPayload;
  try {
    payload = await openFile(text, repId);
  } catch (err) {
    return { ok: false, message: err instanceof WrongPasswordError ? `رمز ${rep.name} لا يفتح الملف - أرسل له رمزه من جديد` : "تعذّر فتح ملف التسجيلات" };
  }
  // 🔗 His copies are bound to the phone that first linked through his bot chat; a file from any
  // other phone (or an old app without the key, once bound) is refused.
  const bound = repPhoneKey(repId);
  if (bound && payload.phoneKey !== bound) {
    await sendTelegramText(`🔒 وصل ملف باسم المندوب ${rep.name} من هاتف غير هاتفه المربوط - رُفض. إن غيّر هاتفه فعلاً: «🔄 رمز جديد» ثم يربط هاتفه الجديد.`);
    return { ok: false, message: payload.phoneKey ? "هذا الملف من هاتف غير الهاتف المربوط - رُفض" : "حدّث تطبيقك ثم أعد الإرسال" };
  }
  if (!bound && payload.phoneKey && fromRepId) {
    setRepPhoneKey(repId, payload.phoneKey);
    await sendTelegramText(`🔗 رُبط هاتف المندوب ${rep.name} - نسخه تُفتح على هاتفه فقط من الآن.`);
    const copy = await sendRepCopy(rep, loadDemoAccounts(demoAccounts));
    await sendRepText(repId, `🔗 رُبط هاتفك ✓ - نسخ أجهزتك تُفتح على هذا الهاتف فقط.${copy.ok ? "\n📋 وصلتك نسختك - افتحها." : ""}`);
    if (fileRep === PAIRING_REP) return { ok: true, message: `🔗 رُبط هاتف ${rep.name}` };
  }
  if (fileRep === PAIRING_REP) return { ok: true, message: `هاتف ${rep.name} مربوط من قبل` };

  const inbox = loadRepInbox();
  const current = inbox.files.find((f) => f.repId === repId);
  if (current && current.sentAt >= payload.sentAt) return { ok: false, message: `هذه تسجيلات ${rep.name} وصلت من قبل` };
  const items = waiting(payload, inbox.decisions[repId] ?? {});
  if (items.length === 0) {
    await sendRepText(repId, "✓ وصلت تسجيلاتك - لا شيء جديد فيها (كل شيء ثُبّت أو رُفض من قبل).");
    return { ok: true, message: `لا جديد في تسجيلات ${rep.name}` };
  }
  const entry: RepInboxFile = { id: payload.id, repId, sentAt: payload.sentAt, receivedAt: new Date().toISOString(), file: text, pendingCount: items.length };
  if (!saveRepInbox({ ...inbox, files: [...inbox.files.filter((f) => f.repId !== repId), entry] })) {
    return { ok: false, message: "ذاكرة الهاتف ممتلئة - لم تُحفظ تسجيلات المندوب" };
  }
  const what = describeItems(items);
  await sendRepText(repId, `📥 وصلت تسجيلاتك (${items.length}): ${what}\n⏳ بانتظار موافقة المسؤول.`);
  await sendTelegramText(`📝 المندوب ${rep.name} أرسل ${items.length} تسجيلاً بانتظار موافقتك: ${what}\nراجعها في التطبيق (المندوبون ← تسجيلات المندوبين).`);
  return { ok: true, message: `📝 وصلت تسجيلات ${rep.name} (${items.length}) - بانتظار موافقتك` };
}

// ---- reviewing ----

export interface RepInboxView {
  file: RepInboxFile;
  repName: string;
  items: RepChangeItem[];
  /** Why it couldn't be opened (the rep's code changed…). */
  error?: string;
}

/** Every waiting file, opened, with the items still to decide. */
export async function openRepInbox(): Promise<RepInboxView[]> {
  const inbox = loadRepInbox();
  const reps = loadRepresentativeStore();
  const views: RepInboxView[] = [];
  for (const file of inbox.files) {
    const repName = reps[file.repId]?.name ?? "مندوب";
    try {
      const payload = await openFile(file.file, file.repId);
      views.push({ file, repName, items: waiting(payload, inbox.decisions[file.repId] ?? {}) });
    } catch {
      views.push({ file, repName, items: [], error: "رمز المندوب لا يفتح الملف - أرسل له رمزه من جديد ليعيد الإرسال" });
    }
  }
  return views;
}

/**
 * ✅ / ❌ on some of a rep's items: the approved ones are applied inside his scope (new devices get
 * their Starlink sessions and «📱 أضافه المندوب»), every decision is remembered for that exact
 * version, the rep is told, and he gets a fresh copy - his ⏳ marks clear, rejected ones leave.
 */
export async function decideRepItems(repId: string, approveKeys: string[], rejectKeys: string[]): Promise<{ ok: boolean; message: string }> {
  const inbox = loadRepInbox();
  const file = inbox.files.find((f) => f.repId === repId);
  const rep = loadRepresentativeStore()[repId];
  if (!file || !rep) return { ok: false, message: "التسجيلات لم تعد موجودة" };
  let payload: RepChangesPayload;
  try {
    payload = await openFile(file.file, repId);
  } catch {
    return { ok: false, message: "رمز المندوب لا يفتح الملف" };
  }
  const decisions = inbox.decisions[repId] ?? {};
  const items = waiting(payload, decisions);
  const approved = items.filter((i) => approveKeys.includes(i.key));
  const rejected = items.filter((i) => rejectKeys.includes(i.key) && !approveKeys.includes(i.key));
  if (approved.length === 0 && rejected.length === 0) return { ok: false, message: "اختر تسجيلاً أولاً" };

  if (approved.length > 0) {
    const result = applyRepChangeSet(readStores(), changeSetOf(payload.changes, approved), repId);
    try {
      for (const [key, value] of Object.entries(result.stores)) window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return { ok: false, message: "ذاكرة الهاتف ممتلئة - لم يُثبَّت شيء" };
    }
    const sessions: Record<string, Record<string, string>> = {};
    for (const id of result.newDeviceIds) {
      if (payload.sessions[id]) sessions[id] = payload.sessions[id]!;
      if (payload.sessions[`mail:${id}`]) sessions[`mail:${id}`] = payload.sessions[`mail:${id}`]!;
    }
    if (Object.keys(sessions).length > 0) await importAccountSessions(sessions);
  }

  let nextDecisions = withDecision(decisions, approved, "approved");
  nextDecisions = withDecision(nextDecisions, rejected, "rejected");
  const left = items.length - approved.length - rejected.length;
  const files = left > 0 ? inbox.files.map((f) => (f.repId === repId ? { ...f, pendingCount: left } : f)) : inbox.files.filter((f) => f.repId !== repId);
  saveRepInbox({ files, decisions: { ...inbox.decisions, [repId]: nextDecisions } });
  window.dispatchEvent(new Event(ACCOUNTS_CHANGED_EVENT));

  // A fresh copy: what he sent is now the operator's (approved) or leaves his phone (rejected).
  const copy = await sendRepCopy(rep, loadDemoAccounts(demoAccounts));
  const lines = [
    approved.length ? `✅ ثبّت المسؤول: ${describeItems(approved)}` : "",
    rejected.length ? `❌ رفض: ${rejected.map((i) => i.title).join("، ")}` : "",
    left ? `⏳ ما زال ${left} بانتظار المسؤول` : "",
    copy.ok ? "📋 وصلتك نسخة جديدة - افتحها." : "",
  ].filter(Boolean);
  await sendRepText(repId, lines.join("\n"));
  const parts = [approved.length ? `✓ ثُبّت ${approved.length}` : "", rejected.length ? `رُفض ${rejected.length}` : "", left ? `بقي ${left}` : ""].filter(Boolean);
  return { ok: true, message: `${parts.join(" · ")}${copy.ok ? "" : ` - لم تُرسل له نسخة جديدة: ${copy.message}`}` };
}
