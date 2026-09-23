/**
 * The store/inventory module: items (المواد) plus a running log of buy/sell transactions against
 * them. This is a REAL inventory - the remaining quantity for each item is always derived from
 * its own transaction history (sum of buys minus sum of sells), never stored as a separate
 * mutable counter, so it can never drift out of sync with the log that produced it. A "sell"
 * transaction may optionally link a Client (clientStore.ts) - the same explicit-link-only
 * philosophy as StarlinkAccountSummary.clientId, never inferred from a name.
 */

export interface StoreItem {
  id: string;
  name: string;
  /** Free-text unit label, e.g. "قطعة" or "علبة" - defaults to "قطعة" when not given. */
  unit: string;
  createdAt: string;
  updatedAt: string;
}

/** itemId -> StoreItem. */
export type StoreItemRegistry = Record<string, StoreItem>;

export type StoreTransactionKind = "buy" | "sell";

export interface StoreTransaction {
  id: string;
  itemId: string;
  kind: StoreTransactionKind;
  /** Always positive - direction comes from `kind`, never from the sign of this field. */
  quantity: number;
  unitPrice: number;
  /** currencyStore.ts registry code (e.g. "USD", "MRU"). */
  currencyCode: string;
  /** Only meaningful for a "sell" - which customer this sale is linked to, if any. Never set for
   * a "buy" (buying is from a supplier, not a customer). */
  clientId?: string;
  note?: string;
  /** yyyy-mm-dd, the operator-chosen transaction date (defaults to today in the UI). */
  date: string;
  createdAt: string;
}

export type StoreTransactionList = StoreTransaction[];

const ITEMS_KEY = "starnet_store_items_v1";
const TRANSACTIONS_KEY = "starnet_store_transactions_v1";
const DEFAULT_UNIT = "قطعة";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

export function loadStoreItems(): StoreItemRegistry {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ITEMS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as StoreItemRegistry;
  } catch {
    return {};
  }
}

export function saveStoreItems(items: StoreItemRegistry): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

export function loadStoreTransactions(): StoreTransactionList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRANSACTIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoreTransactionList) : [];
  } catch {
    return [];
  }
}

export function saveStoreTransactions(transactions: StoreTransactionList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getStoreItem(items: StoreItemRegistry, itemId: string | undefined): StoreItem | undefined {
  if (!itemId) return undefined;
  return items[itemId];
}

/** Every item, sorted by name (Arabic-aware) for a stable, predictable list. */
export function listStoreItems(items: StoreItemRegistry): StoreItem[] {
  return Object.values(items).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export interface CreateStoreItemInput {
  name: string;
  unit?: string;
}

export function createStoreItem(
  items: StoreItemRegistry,
  input: CreateStoreItemInput,
): { items: StoreItemRegistry; item: StoreItem } {
  const id = newId("store-item");
  const now = nowIso();
  const item: StoreItem = {
    id,
    name: input.name.trim(),
    unit: input.unit?.trim() || DEFAULT_UNIT,
    createdAt: now,
    updatedAt: now,
  };
  return { items: { ...items, [id]: item }, item };
}

export function deleteStoreItem(items: StoreItemRegistry, itemId: string): StoreItemRegistry {
  const { [itemId]: _removed, ...rest } = items;
  return rest;
}

/** Current remaining quantity for one item - sum of every "buy" minus sum of every "sell"
 * recorded against it. Never stored directly, always derived so it can't drift from the log. */
export function computeStock(transactions: StoreTransactionList, itemId: string): number {
  return transactions.reduce((total, t) => {
    if (t.itemId !== itemId) return total;
    return total + (t.kind === "buy" ? t.quantity : -t.quantity);
  }, 0);
}

/** computeStock for every known item at once, for a list view. */
export function computeStockByItem(
  items: StoreItemRegistry,
  transactions: StoreTransactionList,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of Object.values(items)) result[item.id] = computeStock(transactions, item.id);
  return result;
}

export interface CreateStoreTransactionInput {
  itemId: string;
  kind: StoreTransactionKind;
  quantity: number;
  unitPrice: number;
  currencyCode: string;
  clientId?: string;
  note?: string;
  date: string;
}

export type RecordStoreTransactionResult =
  | { ok: true; transactions: StoreTransactionList; transaction: StoreTransaction }
  | { ok: false; message: string };

/** The only way a transaction is ever added - validates quantity/price, and for a "sell" refuses
 * to let stock go negative (a real inventory can't sell what it doesn't have) rather than silently
 * allowing it. */
export function recordStoreTransaction(
  transactions: StoreTransactionList,
  input: CreateStoreTransactionInput,
): RecordStoreTransactionResult {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, message: "أدخل كمية صحيحة أكبر من صفر" };
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0) {
    return { ok: false, message: "أدخل سعرًا صحيحًا أكبر من صفر" };
  }
  if (input.kind === "sell") {
    const currentStock = computeStock(transactions, input.itemId);
    if (input.quantity > currentStock) {
      return { ok: false, message: `الكمية المطلوبة أكبر من المخزون المتاح (${currentStock})` };
    }
  }

  const transaction: StoreTransaction = {
    id: newId("store-txn"),
    itemId: input.itemId,
    kind: input.kind,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    currencyCode: input.currencyCode,
    clientId: input.kind === "sell" ? input.clientId : undefined,
    note: input.note?.trim() || undefined,
    date: input.date,
    createdAt: nowIso(),
  };
  return { ok: true, transactions: [...transactions, transaction], transaction };
}

export function deleteStoreTransaction(transactions: StoreTransactionList, transactionId: string): StoreTransactionList {
  return transactions.filter((t) => t.id !== transactionId);
}

/** Every transaction for one item, newest first - the item's own كشف حركة. */
export function listTransactionsForItem(transactions: StoreTransactionList, itemId: string): StoreTransactionList {
  return transactions.filter((t) => t.itemId === itemId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
}

/** Every SELL transaction linked to one client, newest first - "أرباحنا من كل زبون"'s store
 * counterpart: what this customer specifically bought from the store, clearly separate from any
 * other client's purchases. */
export function listTransactionsForClient(transactions: StoreTransactionList, clientId: string): StoreTransactionList {
  return transactions
    .filter((t) => t.kind === "sell" && t.clientId === clientId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
}
