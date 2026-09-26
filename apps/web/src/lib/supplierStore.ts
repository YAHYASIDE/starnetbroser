/**
 * The supplier registry: one record per real-world supplier a purchase invoice can be linked to -
 * the mirror image of clientStore.ts's Client, kept as its own separate store (never merged with
 * clients) since a supplier is who the operator buys FROM, never who they sell to. A full
 * supplier ledger (running balance, statements) is a later addition on top of this registry - this
 * module only manages the registry itself, exactly like clientStore.ts's own scope.
 */

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

/** supplierId -> Supplier. */
export type SupplierStore = Record<string, Supplier>;

const STORAGE_KEY = "starnet_suppliers_v1";

export function loadSupplierStore(): SupplierStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as SupplierStore;
  } catch {
    return {};
  }
}

export function saveSupplierStore(store: SupplierStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getSupplier(store: SupplierStore, supplierId: string | undefined): Supplier | undefined {
  if (!supplierId) return undefined;
  return store[supplierId];
}

/** Every supplier, sorted by name (Arabic-aware) for a stable, predictable picker list. */
export function listSuppliers(store: SupplierStore): Supplier[] {
  return Object.values(store).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Case-insensitive substring match on name or phone. Empty query returns every supplier
 * (sorted), so the picker can show a full list before the operator starts typing. */
export function searchSuppliers(store: SupplierStore, query: string): Supplier[] {
  const q = query.trim().toLowerCase();
  const all = listSuppliers(store);
  if (!q) return all;
  return all.filter(
    (supplier) => supplier.name.toLowerCase().includes(q) || (supplier.phone ?? "").toLowerCase().includes(q),
  );
}

export interface CreateSupplierInput {
  name: string;
  phone?: string;
}

export function createSupplier(
  store: SupplierStore,
  input: CreateSupplierInput,
): { store: SupplierStore; supplier: Supplier } {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `supplier-${Date.now()}-${Math.random()}`;
  const now = new Date().toISOString();
  const supplier: Supplier = {
    id,
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  return { store: { ...store, [id]: supplier }, supplier };
}

export function updateSupplier(store: SupplierStore, supplierId: string, patch: CreateSupplierInput): SupplierStore {
  const existing = store[supplierId];
  if (!existing) return store;
  const updated: Supplier = {
    ...existing,
    name: patch.name.trim(),
    phone: patch.phone?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  return { ...store, [supplierId]: updated };
}
