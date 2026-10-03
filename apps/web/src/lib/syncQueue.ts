/**
 * 🔄 «مزامنة الآن» over several devices, one after another, each in its own visible browser (the
 * same «مزامنة» that works by hand - AccountBrowserActivity's auto-sync). The operator picks a
 * window: devices ending today / within 3, 7, 10, 20 days - each with the stopped devices and
 * those that ran out in the last month - or every device. The queue lives in `starnet.syncQueue`
 * (phone state, not backed up) so it carries on each time the app comes back from a browser.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { daysUntilRenewal } from "./telegramMessages";

export type SyncWindow = 0 | 3 | 7 | 10 | 20 | "all";

export const SYNC_WINDOWS: { window: SyncWindow; label: string }[] = [
  { window: 0, label: "اليوم" },
  { window: 3, label: "3 أيام" },
  { window: 7, label: "7 أيام" },
  { window: 10, label: "10 أيام" },
  { window: 20, label: "20 يوماً" },
  { window: "all", label: "كل الأجهزة" },
];

/** A device that ran out longer ago than this is no longer followed by the day windows. */
export const EXPIRED_LOOKBACK_DAYS = 30;

function isLive(account: StarlinkAccountSummary): boolean {
  return !account.archivedAt && !account.deletedAt;
}

/** The devices a window covers, most urgent first: stopped, then by the days left. */
export function pickSyncAccounts(accounts: StarlinkAccountSummary[], window: SyncWindow, today: string): StarlinkAccountSummary[] {
  const rows = accounts.filter(isLive).map((account) => ({ account, days: daysUntilRenewal(account, today) }));
  const chosen =
    window === "all"
      ? rows
      : rows.filter(({ account, days }) => {
          if (account.deviceFault) return false; // متعطل: not renewed, never followed
          if (account.serviceStatus === "suspended") return true;
          return days !== null && days <= window && days >= -EXPIRED_LOOKBACK_DAYS;
        });
  const rank = (row: { account: StarlinkAccountSummary; days: number | null }) => (row.account.serviceStatus === "suspended" ? 0 : 1);
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
}

export function startSyncQueue(accounts: StarlinkAccountSummary[], window: SyncWindow, today: string): SyncQueue | null {
  const ids = pickSyncAccounts(accounts, window, today).map((a) => a.id);
  if (ids.length === 0) return null;
  return { ids, index: 0, label: SYNC_WINDOWS.find((w) => w.window === window)?.label ?? "" };
}

/** A run over chosen devices (e.g. the long-pressed day's), in the given order. */
export function syncQueueFor(ids: string[], label: string): SyncQueue | null {
  return ids.length === 0 ? null : { ids: [...ids], index: 0, label };
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
