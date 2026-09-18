import { StarlinkAccountSummary } from "@starnet/shared";

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

