/**
 * A separate, purely local bookkeeping ledger: what a CUSTOMER owes the operator, or has paid in
 * credit toward - not to be confused with account.balanceDue, which is the Starlink SUBSCRIPTION's
 * own balance as synced from Starlink itself (see starlinkSync.ts). The two track debts to two
 * different parties (the operator vs. Starlink) and are deliberately never merged or conflated.
 */

export type LedgerEntryKind = "debit" | "credit";

export interface LedgerEntry {
  id: string;
  /** "debit": the customer now owes more (a charge). "credit": a payment or credit that reduces
   * what they owe. */
  kind: LedgerEntryKind;
  /** Always positive - direction comes from `kind`, never a signed amount. */
  amount: number;
  note: string;
  /** yyyy-mm-dd, user-editable (defaults to today, but a backdated entry is legitimate). */
  date: string;
  /** ISO timestamp - only used to order same-day entries relative to each other. */
  createdAt: string;
}

export type LedgerByAccount = Record<string, LedgerEntry[]>;

const STORAGE_KEY = "starnet_customer_ledger_v1";

export function loadLedgerStore(): LedgerByAccount {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as LedgerByAccount;
  } catch {
    return {};
  }
}

export function saveLedgerStore(store: LedgerByAccount): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getAccountEntries(store: LedgerByAccount, accountId: string): LedgerEntry[] {
  return store[accountId] ?? [];
}

export function withAccountEntries(store: LedgerByAccount, accountId: string, entries: LedgerEntry[]): LedgerByAccount {
  return { ...store, [accountId]: entries };
}

/** Positive = the customer owes this much (مدين). Negative = the customer has this much credit
 * with the operator (دائن). Zero = settled. */
export function computeBalance(entries: LedgerEntry[]): number {
  return entries.reduce((total, entry) => total + (entry.kind === "debit" ? entry.amount : -entry.amount), 0);
}

/** Newest first: by `date`, then by `createdAt` to order same-day entries deterministically. */
export function sortEntriesNewestFirst(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function addEntry(entries: LedgerEntry[], entry: LedgerEntry): LedgerEntry[] {
  return [...entries, entry];
}

export function removeEntry(entries: LedgerEntry[], entryId: string): LedgerEntry[] {
  return entries.filter((entry) => entry.id !== entryId);
}

export function createLedgerEntry(kind: LedgerEntryKind, amount: number, note: string, date: string): LedgerEntry {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ledger-${Date.now()}-${Math.random()}`;
  return { id, kind, amount, note: note.trim(), date, createdAt: new Date().toISOString() };
}

/** Sum of every account's positive balance (what customers owe) - accounts in credit don't offset
 * this total, since that would understate how much is actually outstanding across the business. */
export function totalOwedAcrossAccounts(store: LedgerByAccount): number {
  let total = 0;
  for (const entries of Object.values(store)) {
    const balance = computeBalance(entries);
    if (balance > 0) total += balance;
  }
  return total;
}
