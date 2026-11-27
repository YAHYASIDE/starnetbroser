"use client";

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { loadCurrencyStore } from "./currencyStore";
import { exportAccountSessions, isRunningInAndroidApp } from "./localBrowser";
import { buildRepCopy, buildRepCopyFile, copySnapshot, markRepCopySent, markRepCopySentDevices, repCopyFileName } from "./repCopy";
import { ensureRepDeviceCode, repPhoneKey } from "./repDeviceTransfer";
import { readStores, repStoreSlice } from "./repWorkspace";
import { rejectedVersions } from "./repChanges";
import { markSentRates, ratesFingerprint, type RepSendRow } from "./repCopyAuto";
import { repDecisions } from "./repInbox";
import type { Representative } from "./repStore";
import { loadRepChats, sendRepDocument } from "./telegram";
import { permissionsOf } from "./repPermissions";
import { ensureFlagChannel, markFlagLinkSent, ownerFirebase } from "./repFlags";
import { browserLinkStorage, loadLinkConfig } from "./deviceLink";
import { loadLiveSyncConfig, newSpaceId } from "./liveSyncConfig";
import { newLinkKey } from "./deviceSyncCrypto";
import { loadCallTurnText } from "./callIceLoad";

/** 🚩 The operator's Firebase for the warnings (the team link, else the older live link). */
export function flagFirebase() {
  return ownerFirebase({ link: () => loadLinkConfig(browserLinkStorage()), live: loadLiveSyncConfig });
}

/** 🚩 His warnings' channel, when the operator has a Firebase (repFlags.ts). */
function flagLinkFor(repId: string) {
  const firebase = flagFirebase();
  if (!firebase) return undefined;
  const channel = ensureFlagChannel(repId, () => ({ spaceId: newSpaceId(), key: newLinkKey() }));
  return { ...firebase, ...channel };
}

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
  const rates: Record<string, number> = {};
  for (const [code, currency] of Object.entries(loadCurrencyStore())) rates[code] = currency.rateFromUsd;
  const copy = buildRepCopy({
    repId: rep.id,
    repName: rep.name,
    commissionPercent: rep.commissionPercent,
    accounts,
    // 💼 Each one keeps his own debts (his Oct 13 2026 rule): no operation of mine travels.
    ledger: {},
    // 👥 Devices only - never the operator's customers (his Oct 2026 rule).
    clients: {},
    rates,
  });
  const sessions = await exportAccountSessions(copy.devices.map((d) => d.account.id), true);
  // His slice of every store, so his app is the full STAR NET on his devices only.
  const stores = repStoreSlice(readStores(), rep.id);
  // ❌ What the operator rejected leaves his phone (repChangesApply.ts).
  const rejected = rejectedVersions(repDecisions(rep.id));
  // ☁️ No live link any more: it only carried customers, which now stay on each phone.
  // 🔑 What his phone may open (chosen before sending - RepPermissionsSheet).
  const permissions = [...permissionsOf(rep)].sort();
  const flagLink = flagLinkFor(rep.id);
  const callTurn = loadCallTurnText();
  const text = await buildRepCopyFile({ ...copy, stores, rejected, sessions, permissions, ...(flagLink ? { flagLink } : {}), ...(callTurn ? { callTurn } : {}) }, ensureRepDeviceCode(rep.id), phoneKey);
  const fileName = repCopyFileName(rep.id);
  const caption = `📋 نسختك من الأجهزة (${copy.devices.length} جهاز)\nاضغط الملف ← «فتح بـ STAR NET»، أو اضغطه مطولاً ← مشاركة ← STAR NET.`;

  if (loadRepChats()[rep.id]) {
    const sent = await sendRepDocument(rep.id, fileName, text, caption);
    if (!sent.ok) return sent;
    if (flagLink) markFlagLinkSent(rep.id, flagLink.spaceId);
    markRepCopySent(rep.id, copy.sentAt);
    markRepCopySentDevices(rep.id, copySnapshot(accounts, rep.id));
    markSentRates(rep.id, ratesFingerprint(loadCurrencyStore()));
    return { ok: true, devices: copy.devices.length, via: "bot" };
  }
  try {
    const written = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: `نسخة ${rep.name}`, text: caption, files: [written.uri], dialogTitle: "أرسل النسخة للمندوب" });
    if (flagLink) markFlagLinkSent(rep.id, flagLink.spaceId);
    markRepCopySent(rep.id, copy.sentAt);
    markRepCopySentDevices(rep.id, copySnapshot(accounts, rep.id));
    markSentRates(rep.id, ratesFingerprint(loadCurrencyStore()));
    return { ok: true, devices: copy.devices.length, via: "share" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/cancel/i.test(message)) return { ok: false, message: "لم تُرسل النسخة" };
    return { ok: false, message: "تعذّر تجهيز النسخة" };
  }
}

/**
 * 💱📤 «أرسل العملات لكل المندوبين الآن» (his Nov 27 2026 «خذ نسخة الآن من YAHYA 1 وأرسل لكل المندوبين العملات صالحة»): every
 * rep's copy - with the main phone's rates as they are now - goes out through the reps bot, one after the other. Only to a rep
 * linked to the bot whose phone is linked (never the share sheet, nothing leaves otherwise); each result is returned.
 */
export async function sendRatesToAllReps(reps: Representative[], accounts: StarlinkAccountSummary[], progress: (text: string) => void = () => undefined): Promise<RepSendRow[]> {
  const chats = loadRepChats();
  const rows: RepSendRow[] = [];
  for (const [i, rep] of reps.entries()) {
    if (!chats[rep.id]) {
      rows.push({ repId: rep.id, name: rep.name, status: "skipped", note: "غير مربوط بالبوت" });
      continue;
    }
    if (!repPhoneKey(rep.id)) {
      rows.push({ repId: rep.id, name: rep.name, status: "skipped", note: "هاتفه غير مربوط (🔗 ربط هاتفي)" });
      continue;
    }
    progress(`📤 ${rep.name} (${i + 1}/${reps.length})…`);
    const sent = await sendRepCopy(rep, accounts);
    rows.push(sent.ok ? { repId: rep.id, name: rep.name, status: "sent", note: `${sent.devices} جهاز` } : { repId: rep.id, name: rep.name, status: "failed", note: sent.message });
  }
  return rows;
}

