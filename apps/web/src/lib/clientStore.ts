/**
 * The customer/client registry: one record per real-world customer, independent of and separate
 * from StarlinkAccountSummary (a "device"/card, see clientId on that type). A single client may
 * own several devices - this store never holds device data itself, only clientId -> Client, and
 * StarlinkAccountSummary.clientId is the only link between the two, set explicitly through the
 * client picker (never inferred from name/email similarity).
 */

export interface Client {
  id: string;
  name: string;
  /** Optional - used for search and for the WhatsApp features elsewhere in the app, but never
   * required to create a client record. */
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

/** clientId -> Client. */
export type ClientStore = Record<string, Client>;

const STORAGE_KEY = "starnet_clients_v1";

export function loadClientStore(): ClientStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ClientStore;
  } catch {
    return {};
  }
}

export function saveClientStore(store: ClientStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getClient(store: ClientStore, clientId: string | undefined): Client | undefined {
  if (!clientId) return undefined;
  return store[clientId];
}

/** Every client, sorted by name (Arabic-aware) for a stable, predictable picker list. */
export function listClients(store: ClientStore): Client[] {
  return Object.values(store).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Case-insensitive substring match on name or phone. Empty query returns every client
 * (sorted), so the picker can show a full list before the operator starts typing. */
export function searchClients(store: ClientStore, query: string): Client[] {
  const q = query.trim().toLowerCase();
  const all = listClients(store);
  if (!q) return all;
  return all.filter(
    (client) => client.name.toLowerCase().includes(q) || (client.phone ?? "").toLowerCase().includes(q),
  );
}

export interface CreateClientInput {
  name: string;
  phone?: string;
}

export function createClient(store: ClientStore, input: CreateClientInput): { store: ClientStore; client: Client } {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `client-${Date.now()}-${Math.random()}`;
  const now = new Date().toISOString();
  const client: Client = {
    id,
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  return { store: { ...store, [id]: client }, client };
}

export function updateClient(store: ClientStore, clientId: string, patch: CreateClientInput): ClientStore {
  const existing = store[clientId];
  if (!existing) return store;
  const updated: Client = {
    ...existing,
    name: patch.name.trim(),
    phone: patch.phone?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  return { ...store, [clientId]: updated };
}

/** How many devices/accounts currently point at this client - used to warn before a rename etc.
 * never used to infer a link, only to count an already-explicit one. */
export function countLinkedAccounts(accounts: { clientId?: string }[], clientId: string): number {
  return accounts.filter((account) => account.clientId === clientId).length;
}
