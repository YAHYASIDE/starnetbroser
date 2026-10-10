/**
 * 🔄 What a run of «مزامنة الآن» did, device by device: each auto-sync's outcome (recorded by the
 * device's browser, AccountBrowserActivity → takeAutoSyncResults) is kept on the queue; a device
 * not signed in to Starlink is alerted on the bot at once, and the whole run is reported at the end.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { SyncQueue } from "./syncQueue";

export type SyncOutcome = "ok" | "nothing" | "saveFailed" | "signedOut" | "stuck" | "closed";

export interface OutcomeRecord {
  accountId: string;
  outcome: SyncOutcome;
}

const LABELS: Record<SyncOutcome | "unknown", string> = {
  ok: "✅ تمت",
  nothing: "⚠️ لم تُقرأ بيانات",
  saveFailed: "❌ تعذّر الحفظ",
  signedOut: "🔒 غير مسجّل في Starlink",
  stuck: "⏳ تعلّقت - تُخطّيت",
  closed: "✋ أُغلقت باليد",
  unknown: "❔ بلا نتيجة",
};

export function outcomeLabel(outcome: SyncOutcome | undefined): string {
  return LABELS[outcome ?? "unknown"];
}

/** Records the outcomes of the queue's own devices (the latest one wins); returns the new queue and
 * the devices just found not signed in (to alert at once). */
export function applyOutcomes(queue: SyncQueue, records: OutcomeRecord[]): { queue: SyncQueue; newlySignedOut: string[] } {
  const results = { ...(queue.results ?? {}) };
  const newlySignedOut: string[] = [];
  for (const record of records) {
    if (!queue.ids.includes(record.accountId)) continue;
    if (record.outcome === "signedOut" && results[record.accountId] !== "signedOut") newlySignedOut.push(record.accountId);
    results[record.accountId] = record.outcome;
  }
  return { queue: { ...queue, results }, newlySignedOut };
}

export function signedOutAlert(account: StarlinkAccountSummary | undefined): string {
  return `⚠️ الجهاز «${account?.name || "؟"}» غير مسجّل في Starlink - تخطّيته في المزامنة. افتحه وسجّل الدخول.`;
}

/** The end-of-run message: how many were done, then every device tried and how it ended. */
export function buildSyncReport(queue: SyncQueue, accounts: StarlinkAccountSummary[], stopped = false): string {
  const tried = queue.ids.slice(0, Math.min(queue.index, queue.ids.length));
  const results = queue.results ?? {};
  const done = tried.filter((id) => results[id] === "ok").length;
  const head = `${stopped ? "⏹ أُوقفت" : "🔄 انتهت"} المزامنة (${queue.label}): تمت ${done} من ${tried.length}`;
  const lines = tried.map((id) => {
    const name = accounts.find((a) => a.id === id)?.name || "جهاز محذوف";
    return `${outcomeLabel(results[id])} · ${name}`;
  });
  return [head, ...lines].join("\n");
}
