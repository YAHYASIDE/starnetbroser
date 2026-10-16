/**
 * 🕘 «آخر جهاز» (his Oct 12 2026 ask «آخر جهاز دخلناه وحدثناه أو عدلنا عليه شيء، أضفنا له رصيدًا أو
 * أزلنا عنه رصيدًا»): when HE last touched each device on this phone - its browser opened, its card
 * edited, its sync button pressed, a له/عليه added / edited / removed (the small log below).
 * Oct 16 2026, his report «تظهر أجهزة قديمة وأنا لم أفتحها - اجعل آخر جهاز دائمًا هو الأول»: a Starlink
 * read (the background / batch syncs) and ledger entries written by the app or a rep no longer count -
 * only the log, which only his own taps write. A convenience on this phone (`starnet.` key, not in the
 * backup). Pure except load/save.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerByAccount } from "./ledgerStore";

type Touchable = Pick<StarlinkAccountSummary, "id">;

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

/** The latest moment he touched the device, "" when never. `_ledger` is kept for the callers' shape. */
export function lastTouched(account: Touchable, _ledger: LedgerByAccount, log: RecentLog): string {
  return log[account.id] ?? "";
}

/** The devices whose operations differ between two ledgers (added, edited or removed). Pure. */
export function changedLedgerDevices(before: LedgerByAccount, after: LedgerByAccount): string[] {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids].filter((id) => JSON.stringify(before[id] ?? []) !== JSON.stringify(after[id] ?? []));
}

/** The devices touched, most recent first (the first is «آخر جهاز»), at most `limit`. */
export function recentDevices<A extends Touchable>(
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
export function touchedOn<A extends Touchable>(
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

/** Records a touch (browser opened, card edited, synced by hand, balance changed) and tells the home page. */
export function markDeviceTouched(id: string, at: Date = new Date()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(touchDevice(loadRecentLog(), id, at)));
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch {
    // a convenience only
  }
}

/** His own edit of operations (a payment, a D paid, an entry edited or deleted): every device it changed. */
export function markLedgerTouched(before: LedgerByAccount, after: LedgerByAccount, at: Date = new Date()): void {
  for (const id of changedLedgerDevices(before, after)) markDeviceTouched(id, at);
}
