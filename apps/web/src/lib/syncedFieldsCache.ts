import type { SyncedStarlinkFields } from "@starnet/local-browser-plugin";

const STORAGE_KEY = "starnet_synced_fields_cache_v1";

type Cache = Record<string, SyncedStarlinkFields>;

/**
 * On-device cache of Stage-1 "تحديث من Starlink" fields, keyed by account id - for REAL (non-demo)
 * accounts specifically. Demo accounts already persist their whole record via demoAccountStore;
 * "loaded" (real-backend) accounts have no equivalent (services/api has no update-account endpoint
 * for this feature, and adding one is out of this feature's scope). This cache is what "actually
 * saved" means for that mode until a real backend write path exists: without it, a successful sync
 * would only ever live in React state and silently vanish the moment listAccounts() is re-fetched
 * (e.g. on the next app open), even though the user was told it succeeded.
 */
function readCache(): Cache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

/** Merges `fields` into whatever is already cached for this account - never overwrites a field
 * this call didn't itself provide, matching mergeSyncedFields' own "only write what was found"
 * contract. Throws if the underlying localStorage write fails (a full/blocked store) - callers
 * must treat that as a failed save, not a silent no-op. */
export function saveSyncedFieldsCache(accountId: string, fields: SyncedStarlinkFields): void {
  if (typeof window === "undefined") return;
  const cache = readCache();
  cache[accountId] = { ...cache[accountId], ...fields };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function getCachedSyncedFields(accountId: string): SyncedStarlinkFields | undefined {
  return readCache()[accountId];
}
