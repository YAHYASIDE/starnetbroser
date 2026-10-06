/**
 * 🔄 «مزامنة الآن» over several devices, one after another, each in its own visible browser (the
 * same «مزامنة» that works by hand - AccountBrowserActivity's auto-sync). The operator's choices:
 * «اليوم» is today only, «3 أيام» today and the next two days (3, 4, 5), and so on; the devices
 * stopped for billing; the devices added today; every device. A faulty device (متعطل) and one whose
 * email isn't the account's main one (limited, no billing) are synced only from their own choice -
 * never by a day or «كل الأجهزة». The queue lives in `starnet.syncQueue` (phone state, not backed up)
 * so it carries on each time the app comes back from a browser.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { daysUntilRenewal } from "./telegramMessages";

export type SyncWindow =
  | { kind: "days"; days: number }
  | { kind: "suspended" }
  | { kind: "addedToday" }
  | { kind: "all" }
  | { kind: "faulty" }
  | { kind: "limited" };

export const SYNC_WINDOWS: { window: SyncWindow; label: string }[] = [
  { window: { kind: "days", days: 1 }, label: "اليوم" },
  { window: { kind: "days", days: 3 }, label: "3 أيام" },
  { window: { kind: "days", days: 7 }, label: "7 أيام" },
  { window: { kind: "days", days: 10 }, label: "10 أيام" },
  { window: { kind: "days", days: 20 }, label: "20 يوماً" },
  { window: { kind: "suspended" }, label: "الموقوفة بسبب الفوترة" },
  { window: { kind: "addedToday" }, label: "أضفناها اليوم" },
  { window: { kind: "all" }, label: "كل الأجهزة" },
  { window: { kind: "faulty" }, label: "المعطلة" },
  { window: { kind: "limited" }, label: "الإيميل غير الرئيسي" },
];

function isLive(account: StarlinkAccountSummary): boolean {
  return !account.archivedAt && !account.deletedAt;
}

/** Synced only from its own choice: faulty, or a limited (non-main) email. */
export function syncedOnlyByCommand(account: StarlinkAccountSummary): boolean {
  return Boolean(account.deviceFault) || account.limitedAccess === true;
}

function addedOn(account: StarlinkAccountSummary): string | undefined {
  const at = account.addedAt || account.addedByRepAt;
  if (!at) return undefined;
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? undefined : localToday(date);
}

/** The devices a choice covers, most urgent first (stopped, then by the days left). */
export function pickSyncAccounts(accounts: StarlinkAccountSummary[], window: SyncWindow, today: string): StarlinkAccountSummary[] {
  const rows = accounts.filter(isLive).map((account) => ({ account, days: daysUntilRenewal(account, today) }));
  const chosen = rows.filter(({ account, days }) => {
    switch (window.kind) {
      case "days":
        return !syncedOnlyByCommand(account) && days !== null && days >= 0 && days < window.days;
      case "suspended":
        return !syncedOnlyByCommand(account) && account.serviceStatus === "suspended";
      case "addedToday":
        return !account.deviceFault && addedOn(account) === today;
      case "all":
        return !syncedOnlyByCommand(account);
      case "faulty":
        return Boolean(account.deviceFault);
      case "limited":
        return account.limitedAccess === true && !account.deviceFault;
    }
  });
  const rank = (row: { account: StarlinkAccountSummary }) => (row.account.serviceStatus === "suspended" ? 0 : 1);
  return chosen
    .sort((a, b) => rank(a) - rank(b) || (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER))
    .map((row) => row.account);
}

export interface SyncQueue {
  /** The devices still to do and done, in order. */
  ids: string[];
  /** The next device to open. */
  index: number;
  /** What the operator chose, e.g. "7 أيام". */
  label: string;
  /** How each device's auto-sync ended (syncReport.ts). */
  results?: Record<string, "ok" | "nothing" | "saveFailed" | "signedOut" | "stuck" | "closed">;
  /** 🛂 «كشف توثيق»: each browser reads Home only and changes nothing (travelRegistration.ts). */
  travelCheck?: boolean;
}

export function startSyncQueue(accounts: StarlinkAccountSummary[], window: SyncWindow, today: string): SyncQueue | null {
  const ids = pickSyncAccounts(accounts, window, today).map((a) => a.id);
  if (ids.length === 0) return null;
  return { ids, index: 0, label: SYNC_WINDOWS.find((w) => JSON.stringify(w.window) === JSON.stringify(window))?.label ?? "" };
}

/** A run over chosen devices (e.g. the long-pressed day's), in the given order. */
export function syncQueueFor(ids: string[], label: string, travelCheck = false): SyncQueue | null {
  if (ids.length === 0) return null;
  return travelCheck ? { ids: [...ids], index: 0, label, travelCheck: true } : { ids: [...ids], index: 0, label };
}

/** The next device still on the phone (one deleted meanwhile is skipped), or null when finished. */
export function nextQueuedAccount(queue: SyncQueue, accounts: StarlinkAccountSummary[]): { account: StarlinkAccountSummary; index: number } | null {
  for (let i = queue.index; i < queue.ids.length; i++) {
    const account = accounts.find((a) => a.id === queue.ids[i] && isLive(a));
    if (account) return { account, index: i };
  }
  return null;
}

/** "3 / 10" - shown in the browser while that device syncs. */
export function queueProgressLabel(queue: SyncQueue, index: number): string {
  return `${index + 1} / ${queue.ids.length}`;
}

const STORAGE_KEY = "starnet.syncQueue";

export function loadSyncQueue(): SyncQueue | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncQueue;
    if (!Array.isArray(parsed.ids) || typeof parsed.index !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSyncQueue(queue: SyncQueue | null): void {
  try {
    if (queue) localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable - the run simply stops after this device
  }
}

/** Today on the phone as yyyy-mm-dd (local time, not UTC). */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
