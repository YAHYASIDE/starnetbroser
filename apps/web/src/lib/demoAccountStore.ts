import { StarlinkAccountSummary } from "@starnet/shared";
import { mergeList, removedLinks } from "./storeMerge";

const STORAGE_KEY = "starnet_demo_accounts_v1";

/**
 * The public preview has no backend yet. This store makes account edits
 * useful on the current device without pretending they are cloud-synced.
 * Once the production API is deployed, HomeView switches to apiClient and
 * this demo-only storage is no longer used.
 */
export function loadDemoAccounts(fallback: StarlinkAccountSummary[]): StarlinkAccountSummary[] {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed as StarlinkAccountSummary[];
  } catch {
    return fallback;
  }
}

export function saveDemoAccounts(accounts: StarlinkAccountSummary[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}


/** Fired when a save takes a customer off a device without the operator doing it (🔔 + diagnosis). */
export const LINK_REMOVED_EVENT = "starnet:link-removed";

/**
 * 🔗 Saves what a screen changed in the devices - `base` is the list it started from, `next` the
 * list it wants - onto the latest stored list (lib/storeMerge.ts), so an older in-memory copy never
 * writes over a newer change (a customer link). Returns the stored result, for the screen's state.
 * `unlink` = the operator himself took the customer off (the edit dialog, a deleted customer).
 */
export function commitDemoAccounts(
  base: StarlinkAccountSummary[],
  next: StarlinkAccountSummary[],
  source: string,
  options: { unlink?: boolean } = {},
): StarlinkAccountSummary[] {
  if (typeof window === "undefined") return next;
  let fresh: StarlinkAccountSummary[] | null = null;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(parsed)) fresh = parsed as StarlinkAccountSummary[];
  } catch {
    fresh = null;
  }
  const merged = fresh ? mergeList(fresh, base, next) : next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  if (fresh && !options.unlink) {
    const lost = removedLinks(fresh, merged);
    if (lost.length) window.dispatchEvent(new CustomEvent(LINK_REMOVED_EVENT, { detail: { source, devices: lost } }));
  }
  return merged;
}
