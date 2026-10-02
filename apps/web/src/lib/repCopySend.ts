"use client";

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { loadClientStore } from "./clientStore";
import { loadCurrencyStore } from "./currencyStore";
import { loadLedgerStore } from "./ledgerStore";
import { exportAccountSessions, isRunningInAndroidApp } from "./localBrowser";
import { buildRepCopy, buildRepCopyFile, markRepCopySent, repCopyFileName } from "./repCopy";
import { ensureRepDeviceCode, repPhoneKey } from "./repDeviceTransfer";
import { readStores, repStoreSlice } from "./repWorkspace";
import { rejectedVersions } from "./repChanges";
import { repDecisions } from "./repInbox";
import type { Representative } from "./repStore";
import { loadRepChats, sendRepDocument } from "./telegram";

export type SendCopyResult = { ok: true; devices: number; via: "bot" | "share" } | { ok: false; message: string };

/**
 * 📤 «إرسال نسخته»: the rep's devices (with every operation, the customer, the rates and each
 * device's Starlink + mailbox session) encrypted with his code, sent to his chat through the reps
 * bot - or, when he isn't linked to the bot, handed to the share sheet (WhatsApp…).
 */
export async function sendRepCopy(rep: Representative, accounts: StarlinkAccountSummary[]): Promise<SendCopyResult> {
  if (!isRunningInAndroidApp()) return { ok: false, message: "الإرسال يعمل داخل تطبيق Android فقط" };
  // 🔗 Only to his own phone: until it's linked, no copy leaves (a file + code alone open nowhere).
  const phoneKey = repPhoneKey(rep.id);
  if (!phoneKey) return { ok: false, message: `🔗 هاتف ${rep.name} غير مربوط بعد - يضغط في تطبيقه «🔗 ربط هاتفي» ويرسل الملف للبوت، ثم أرسل نسخته` };
  const clients = loadClientStore();
  const rates: Record<string, number> = {};
  for (const [code, currency] of Object.entries(loadCurrencyStore())) rates[code] = currency.rateFromUsd;
  const copy = buildRepCopy({
    repId: rep.id,
    repName: rep.name,
    commissionPercent: rep.commissionPercent,
    accounts,
    ledger: loadLedgerStore(),
    clients: Object.fromEntries(Object.values(clients).map((c) => [c.id, { name: c.name, ...(c.phone ? { phone: c.phone } : {}) }])),
    rates,
  });
  const sessions = await exportAccountSessions(copy.devices.map((d) => d.account.id), true);
  // His slice of every store, so his app is the full STAR NET on his devices only.
  const stores = repStoreSlice(readStores(), rep.id);
  // ❌ What the operator rejected leaves his phone (repChangesApply.ts).
  const rejected = rejectedVersions(repDecisions(rep.id));
  const text = await buildRepCopyFile({ ...copy, stores, rejected, sessions }, ensureRepDeviceCode(rep.id), phoneKey);
  const fileName = repCopyFileName(rep.id);
  const caption = `📋 نسختك من الأجهزة (${copy.devices.length} جهاز)\nاضغط الملف ← «فتح بـ STAR NET»، أو اضغطه مطولاً ← مشاركة ← STAR NET.`;

  if (loadRepChats()[rep.id]) {
    const sent = await sendRepDocument(rep.id, fileName, text, caption);
    if (!sent.ok) return sent;
    markRepCopySent(rep.id, copy.sentAt);
    return { ok: true, devices: copy.devices.length, via: "bot" };
  }
  try {
    const written = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: `نسخة ${rep.name}`, text: caption, files: [written.uri], dialogTitle: "أرسل النسخة للمندوب" });
    markRepCopySent(rep.id, copy.sentAt);
    return { ok: true, devices: copy.devices.length, via: "share" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/cancel/i.test(message)) return { ok: false, message: "لم تُرسل النسخة" };
    return { ok: false, message: "تعذّر تجهيز النسخة" };
  }
}
