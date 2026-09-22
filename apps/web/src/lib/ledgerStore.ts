/**
 * A separate, purely local bookkeeping ledger: what a CUSTOMER owes the operator, or has paid in
 * credit toward - not to be confused with account.balanceDue, which is the Starlink SUBSCRIPTION's
 * own balance as synced from Starlink itself (see starlinkSync.ts). The two track debts to two
 * different parties (the operator vs. Starlink) and are deliberately never merged or conflated.
 */

export type LedgerEntryKind = "debit" | "credit";

/** Exactly the three currencies actually used for these transactions - never a free-text field. */
export type LedgerCurrency = "USD" | "MRU" | "SIFA";
export const LEDGER_CURRENCIES: LedgerCurrency[] = ["USD", "MRU", "SIFA"];
export const LEDGER_CURRENCY_LABELS: Record<LedgerCurrency, string> = {
  USD: "دولار",
  MRU: "أوقية",
  SIFA: "سيفا",
};

/** STAR NET's own payment-collection channels (same ones quoted to customers in
 * whatsapp.ts#buildBalanceReminderMessage) - recorded per "له" entry so it's clear which channel
 * a given payment actually came in on. Meaningless for a "عليه" entry (a charge, not a payment). */
export type PaymentMethod = "nita" | "bankily" | "sedad" | "orange";
export const PAYMENT_METHODS: PaymentMethod[] = ["nita", "bankily", "sedad", "orange"];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  nita: "نيتا",
  bankily: "بنكيلي",
  sedad: "سداد",
  orange: "أورانج موني",
};

export interface LedgerEntry {
  id: string;
  /** "debit" (عليه): the customer now owes more. "credit" (له): a payment that reduces what they
   * owe. */
  kind: LedgerEntryKind;
  /** Always positive - direction comes from `kind`, never a signed amount. */
  amount: number;
  currency: LedgerCurrency;
  note: string;
  /** The email a payment is tied to (e.g. the customer's e-wallet/bank login) - purely for the
   * operator's own traceability, never validated or used to contact anyone. */
  email: string;
  /** Only meaningful for a "credit" (له) entry - which of STAR NET's own payment channels the
   * money came in on. Left unset for a "debit" entry. */
  paymentMethod?: PaymentMethod;
  /** yyyy-mm-dd, user-editable (defaults to today, but a backdated entry is legitimate). */
  date: string;
  /** ISO timestamp - only used to order same-day entries relative to each other. */
  createdAt: string;
}

export type LedgerByAccount = Record<string, LedgerEntry[]>;

/** A balance is never a single number once entries can be in different currencies - USD/MRU/SIFA
 * amounts are never summed together, only within their own currency. Absent key = no entries in
 * that currency. */
export type BalanceByCurrency = Partial<Record<LedgerCurrency, number>>;

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

/** Per currency: positive = the customer owes this much (مدين) in that currency. Negative = the
 * customer has this much credit (دائن) in that currency. A currency with no entries is simply
 * absent from the result, not zero. */
export function computeBalanceByCurrency(entries: LedgerEntry[]): BalanceByCurrency {
  const balances: BalanceByCurrency = {};
  for (const entry of entries) {
    const delta = entry.kind === "debit" ? entry.amount : -entry.amount;
    balances[entry.currency] = (balances[entry.currency] ?? 0) + delta;
  }
  return balances;
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

export interface CreateLedgerEntryInput {
  kind: LedgerEntryKind;
  amount: number;
  currency: LedgerCurrency;
  note: string;
  email: string;
  /** Ignored (never stored) for a "debit" entry - a charge has no payment channel. */
  paymentMethod?: PaymentMethod;
  date: string;
}

export function createLedgerEntry(input: CreateLedgerEntryInput): LedgerEntry {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ledger-${Date.now()}-${Math.random()}`;
  return {
    id,
    kind: input.kind,
    amount: input.amount,
    currency: input.currency,
    note: input.note.trim(),
    email: input.email.trim(),
    paymentMethod: input.kind === "credit" ? input.paymentMethod : undefined,
    date: input.date,
    createdAt: new Date().toISOString(),
  };
}

/** Per currency, the sum of every account's positive balance (what customers owe) - accounts in
 * credit don't offset this total, since that would understate how much is actually outstanding. */
export function totalOwedAcrossAccounts(store: LedgerByAccount): BalanceByCurrency {
  const totals: BalanceByCurrency = {};
  for (const entries of Object.values(store)) {
    const balances = computeBalanceByCurrency(entries);
    for (const currency of LEDGER_CURRENCIES) {
      const balance = balances[currency];
      if (balance !== undefined && balance > 0) {
        totals[currency] = (totals[currency] ?? 0) + balance;
      }
    }
  }
  return totals;
}
