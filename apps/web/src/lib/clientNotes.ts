/**
 * 📝 ملاحظات الزبون - a dated log per customer ("calls in the evening", "wants a Mini", "paid
 * via Bankily through his brother"). Records only, never touches balances. Pure + a small
 * `starnet_` store (backed up with everything else).
 */

export interface ClientNote {
  id: string;
  text: string;
  createdAt: string;
  /** Pinned notes stay on top. */
  pinned?: boolean;
}

export type ClientNotesStore = Record<string, ClientNote[]>;

const KEY = "starnet_client_notes_v1";
const MAX_TEXT = 500;

export function loadClientNotes(): ClientNotesStore {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ClientNotesStore) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveClientNotes(store: ClientNotesStore): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage full
  }
}

export function addClientNote(store: ClientNotesStore, clientId: string, text: string, now = new Date()): ClientNotesStore {
  const clean = text.trim().slice(0, MAX_TEXT);
  if (!clean) return store;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `cn-${now.getTime()}`;
  return { ...store, [clientId]: [...(store[clientId] ?? []), { id, text: clean, createdAt: now.toISOString() }] };
}

export function deleteClientNote(store: ClientNotesStore, clientId: string, noteId: string): ClientNotesStore {
  const next = (store[clientId] ?? []).filter((n) => n.id !== noteId);
  const out = { ...store };
  if (next.length) out[clientId] = next;
  else delete out[clientId];
  return out;
}

export function togglePinClientNote(store: ClientNotesStore, clientId: string, noteId: string): ClientNotesStore {
  return { ...store, [clientId]: (store[clientId] ?? []).map((n) => (n.id === noteId ? { ...n, pinned: !n.pinned } : n)) };
}

/** Pinned first, then newest first. */
export function sortedClientNotes(notes: ClientNote[] | undefined): ClientNote[] {
  return [...(notes ?? [])].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt.localeCompare(a.createdAt));
}
