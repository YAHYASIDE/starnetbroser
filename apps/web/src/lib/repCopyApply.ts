"use client";

import { WrongPasswordError } from "./backupCrypto";
import { deleteIsolatedAccountSession, importAccountSessions } from "./localBrowser";
import { isOlderCopy, isRepCopyFile, loadRepCopy, OtherPhoneError, readRepCopyFile, removedDeviceIds, saveRepCopy, withoutSessions } from "./repCopy";
import { ensureRepPhoneKey } from "./repDeviceTransfer";
import { applyRepWorkspace } from "./repWorkspace";
import { saveLiveSyncConfig } from "./liveSyncConfig";

/** Fired after a copy was applied - the rep's app reloads its data. */
export const REP_WORKSPACE_EVENT = "starnet:rep-workspace";

export type ApplyCopyResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * 📥 A copy file from the operator, opened on the rep's phone: decrypted with his code, devices no
 * longer his removed with their Starlink sessions, the new sessions restored, and the full app's
 * stores updated - the rep's own pending changes kept (lib/repWorkspace.ts).
 */
export async function applyRepCopyText(text: string, code: string): Promise<ApplyCopyResult> {
  if (!isRepCopyFile(text)) return { ok: false, message: "هذا الملف ليس نسخة أجهزتك من المسؤول" };
  try {
    const payload = await readRepCopyFile(text, code, ensureRepPhoneKey());
    const current = loadRepCopy();
    if (isOlderCopy(current, payload)) return { ok: false, message: "هذه نسخة أقدم من التي عندك - لم تتغيّر" };
    const next = withoutSessions(payload);
    const removed = removedDeviceIds(current, next);
    for (const id of removed) await deleteIsolatedAccountSession(id);
    await importAccountSessions(payload.sessions);
    const { stores, rejected, liveSync, ...summary } = next;
    // ☁️ The operator switched the live link on: this phone joins his Firebase space.
    if (liveSync) saveLiveSyncConfig({ ...liveSync, enabled: true });
    if (stores && !applyRepWorkspace(stores, rejected ?? {})) return { ok: false, message: "ذاكرة الهاتف ممتلئة - تعذّر حفظ النسخة" };
    if (!saveRepCopy(summary)) return { ok: false, message: "ذاكرة الهاتف ممتلئة - تعذّر حفظ النسخة" };
    if (typeof window !== "undefined") window.dispatchEvent(new Event(REP_WORKSPACE_EVENT));
    return { ok: true, message: `✓ وصلت نسخة جديدة: ${next.devices.length} جهاز${removed.length ? ` · حُذف ${removed.length}` : ""}` };
  } catch (err) {
    if (err instanceof OtherPhoneError) return { ok: false, message: "🔒 هذه النسخة مربوطة بهاتف آخر - لا تُفتح هنا. إن غيّرت هاتفك اطلب من المسؤول «🔄 رمز جديد»." };
    return { ok: false, message: err instanceof WrongPasswordError ? "هذه النسخة لمندوب آخر (رمزك لا يفتحها)" : "تعذّر فتح النسخة" };
  }
}
