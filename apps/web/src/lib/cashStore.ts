/**
 * الصندوق - a simple cash register: every amount that actually moved in or out of the till, and
 * the running balance that log implies (never stored as a separate mutable counter, same
 * derive-don't-store philosophy as storeStore.ts's own stock). Two kinds of entry:
 *  - manual, entered directly here (rent, transport, any expense/income not tied to a specific
 *    store invoice)
 *  - auto-posted from an invoice's own paidAmount at creation time (invoiceId set) - store/page.tsx
 *    does this posting, this module only defines the shape and the pure balance math.
 */

export type CashEntryKind = "in" | "out";

export interface CashEntry {
  id: string;
  kind: CashEntryKind;
  amount: number;
  /** currencyStore.ts registry code. */
  currencyCode: string;
  /** yyyy-mm-dd. */
  date: string;
  category?: string;
  note?: string;
  /** Set only when this entry was auto-posted from an invoice's paidAmount - lets it be told
   * apart from a standalone expense/income when computing profit (an invoice-linked "out" entry
   * is money paid to a supplier, already reflected in cost of goods, never double-counted as a
   * separate business expense). */
  invoiceId?: string;
  createdAt: string;
}

export type CashEntryList = CashEntry[];

const CASH_KEY = "starnet_cash_entries_v1";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cash-${Date.now()}-${Math.random()}`;
}

export function loadCashEntries(): CashEntryList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CASH_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CashEntryList) : [];
  } catch {
    return [];
  }
}

export function saveCashEntries(entries: CashEntryList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CASH_KEY, JSON.stringify(entries));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export interface CreateCashEntryInput {
  kind: CashEntryKind;
  amount: number;
  currencyCode: string;
  date: string;
  category?: string;
  note?: string;
  invoiceId?: string;
}

export type RecordCashEntryResult = { ok: true; entries: CashEntryList; entry: CashEntry } | { ok: false; message: string };

export function recordCashEntry(entries: CashEntryList, input: CreateCashEntryInput): RecordCashEntryResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "أدخل مبلغًا صحيحًا أكبر من صفر" };
  }
  const entry: CashEntry = {
    id: newId(),
    kind: input.kind,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    category: input.category?.trim() || undefined,
    note: input.note?.trim() || undefined,
    invoiceId: input.invoiceId,
    createdAt: nowIso(),
  };
  return { ok: true, entries: [...entries, entry], entry };
}

export function deleteCashEntry(entries: CashEntryList, entryId: string): CashEntryList {
  return entries.filter((e) => e.id !== entryId);
}

/** Running balance per currency - every "in" minus every "out", never a separately stored
 * counter. */
export function computeCashBalanceByCurrency(entries: CashEntryList): Record<string, number> {
  const balance: Record<string, number> = {};
  for (const entry of entries) {
    const delta = entry.kind === "in" ? entry.amount : -entry.amount;
    balance[entry.currencyCode] = (balance[entry.currencyCode] ?? 0) + delta;
  }
  return balance;
}

/** Every entry, newest first. */
export function listCashEntries(entries: CashEntryList): CashEntryList {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
}

/** Only the standalone entries (no invoiceId) - the actual "مصاريف" figure for a profit report,
 * since an invoice-linked entry is already reflected in cost of goods / receivables and would be
 * double-counted if subtracted again as a separate expense. */
export function listStandaloneCashEntries(entries: CashEntryList): CashEntryList {
  return entries.filter((e) => e.invoiceId === undefined);
}
