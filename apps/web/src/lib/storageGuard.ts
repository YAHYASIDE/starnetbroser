/**
 * The phone's localStorage is the app's only database, and it's small (Android WebView allows
 * about 5 million characters per app). Every store's save*() calls setItem directly, which throws
 * once that space is used up - before this guard the error vanished and the operator kept
 * working on records that were never saved. installStorageGuard() makes every such failure
 * announce itself (STORAGE_FULL_EVENT → the red banner in StorageFullBanner.tsx) while still
 * throwing, so callers that roll back on failure (restoreAppData) keep working.
 */

export const STORAGE_FULL_EVENT = "starnet:storage-full";
/** Roughly what an Android WebView gives one app, in UTF-16 characters (keys + values). */
export const STORAGE_BUDGET_CHARS = 5_000_000;

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { name, code } = err as { name?: unknown; code?: unknown };
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

const GUARD_FLAG = "__starnetStorageGuard";

/** Wraps Storage.prototype.setItem once per page. Returns false if it was already installed or
 * there's no Storage (server render). */
export function installStorageGuard(target: { Storage?: typeof Storage; dispatchEvent?: (e: Event) => boolean } = globalThis): boolean {
  const StorageCtor = target.Storage;
  if (!StorageCtor || typeof StorageCtor.prototype.setItem !== "function") return false;
  const proto = StorageCtor.prototype as Storage & { [GUARD_FLAG]?: boolean };
  if (proto[GUARD_FLAG]) return false;
  const original = proto.setItem;
  proto.setItem = function guardedSetItem(this: Storage, key: string, value: string) {
    try {
      original.call(this, key, value);
    } catch (err) {
      if (isQuotaError(err) && typeof target.dispatchEvent === "function") {
        target.dispatchEvent(new CustomEvent(STORAGE_FULL_EVENT, { detail: { key } }));
      }
      throw err;
    }
  };
  Object.defineProperty(proto, GUARD_FLAG, { value: true });
  return true;
}

export interface StorageKeyUsage {
  key: string;
  chars: number;
}

export interface StorageUsage {
  usedChars: number;
  budgetChars: number;
  /** 0..1 (can exceed 1 on a phone that allows more than the budget). */
  ratio: number;
  level: "ok" | "warn" | "full";
  /** Every key, largest first. */
  keys: StorageKeyUsage[];
}

export function measureStorage(
  storage: Pick<Storage, "length" | "key" | "getItem">,
  budgetChars: number = STORAGE_BUDGET_CHARS,
): StorageUsage {
  const keys: StorageKeyUsage[] = [];
  let usedChars = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null) continue;
    const chars = key.length + (storage.getItem(key)?.length ?? 0);
    usedChars += chars;
    keys.push({ key, chars });
  }
  keys.sort((a, b) => b.chars - a.chars || a.key.localeCompare(b.key));
  const ratio = budgetChars > 0 ? usedChars / budgetChars : 0;
  return { usedChars, budgetChars, ratio, level: ratio >= 0.95 ? "full" : ratio >= 0.8 ? "warn" : "ok", keys };
}

const KEY_LABELS: Record<string, string> = {
  starnet_demo_accounts_v1: "الأجهزة",
  starnet_customer_ledger_v1: "عمليات الأجهزة",
  starnet_clients_v1: "الزبائن",
  starnet_suppliers_v1: "الموردون",
  starnet_representatives_v1: "المندوبون",
  starnet_rep_settlements_v1: "تسويات المندوبين",
  starnet_store_items_v1: "منتجات المتجر (مع الصور)",
  starnet_store_transactions_v1: "حركات المخزون",
  starnet_store_invoices_v1: "الفواتير",
  starnet_cash_entries_v1: "الصندوق",
  starnet_cash_closings_v1: "إقفالات الصندوق",
  starnet_currencies_v1: "العملات",
  starnet_payment_allocations_v1: "توزيع الدفعات",
  starnet_party_adjustments_v1: "أرصدة الأطراف",
  starnet_previous_debts_v1: "الديون السابقة",
  starnet_card_topups_v1: "شحن البطاقة",
  starnet_month_closings_v1: "إقفالات الأشهر",
  starnet_synced_fields_cache_v1: "بيانات Starlink المحفوظة",
  starnet_business_profile_v1: "بيانات النشاط",
  starnet_profit_reset_v1: "تصفير الأرباح",
};

export function storageKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? key;
}

/** "1.2 مليون" / "850 ألف" style size, in characters (what the budget counts). */
export function formatChars(chars: number): string {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)} مليون حرف`;
  if (chars >= 1_000) return `${Math.round(chars / 1_000)} ألف حرف`;
  return `${chars} حرف`;
}
