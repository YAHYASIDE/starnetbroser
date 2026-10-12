/**
 * 🕘 «آخر جهاز» (his Oct 12 2026 ask «آخر جهاز دخلناه وحدثناه أو عدلنا عليه شيء، أضفنا له رصيدًا أو
 * أزلنا عنه رصيدًا»): when each device was last touched - its browser opened, its card edited
 * (the small log below), its Starlink read (lastSuccessfulScanAt) or a له/عليه written on it (its
 * newest ledger entry). The log is a convenience on this phone (`starnet.` key, not in the backup);
 * everything else is derived from the records. Pure except load/save.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerByAccount } from "./ledgerStore";

/** device id → ISO time it was opened / edited / its balance removed on this phone. */
export type RecentLog = Record<string, string>;

const KEY = "starnet.recentDevices";
const MAX_LOG = 100;
/** How many devices «آخر جهاز» lists. */
export const RECENT_LIMIT = 30;
export const RECENT_EVENT = "starnet-recent-devices";

export function touchDevice(log: RecentLog, id: string, at: Date = new Date()): RecentLog {
  const next: RecentLog = { ...log, [id]: at.toISOString() };
  const ids = Object.keys(next);
  if (ids.length <= MAX_LOG) return next;
  const keep = ids.sort((a, b) => (next[b]! < next[a]! ? -1 : 1)).slice(0, MAX_LOG);
  return Object.fromEntries(keep.map((k) => [k, next[k]!]));
}

/** The latest moment the device was touched, "" when never. */
export function lastTouched(account: Pick<StarlinkAccountSummary, "id" | "lastSuccessfulScanAt">, ledger: LedgerByAccount, log: RecentLog): string {
  let latest = log[account.id] ?? "";
  if (account.lastSuccessfulScanAt && account.lastSuccessfulScanAt > latest) latest = account.lastSuccessfulScanAt;
  for (const entry of ledger[account.id] ?? []) if (entry.createdAt > latest) latest = entry.createdAt;
  return latest;
}

/** The devices touched, most recent first (the first is «آخر جهاز»), at most `limit`. */
export function recentDevices<A extends Pick<StarlinkAccountSummary, "id" | "lastSuccessfulScanAt">>(
  accounts: A[],
  ledger: LedgerByAccount,
  log: RecentLog,
  limit = RECENT_LIMIT,
): A[] {
  return accounts
    .map((account) => ({ account, at: lastTouched(account, ledger, log) }))
    .filter((row) => row.at)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
    .map((row) => row.account);
}

/** How many devices were touched on `day` (yyyy-mm-dd, local; today by default) - the ring's number. */
export function touchedOn<A extends Pick<StarlinkAccountSummary, "id" | "lastSuccessfulScanAt">>(
  accounts: A[],
  ledger: LedgerByAccount,
  log: RecentLog,
  day: string = localDay(new Date().toISOString()),
): number {
  return accounts.filter((account) => {
    const at = lastTouched(account, ledger, log);
    return at !== "" && localDay(at) === day;
  }).length;
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadRecentLog(): RecentLog {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RecentLog) : {};
  } catch {
    return {};
  }
}

/** Records a touch (browser opened, card edited, balance removed) and tells the home page. */
export function markDeviceTouched(id: string, at: Date = new Date()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(touchDevice(loadRecentLog(), id, at)));
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch {
    // a convenience only
  }
}
