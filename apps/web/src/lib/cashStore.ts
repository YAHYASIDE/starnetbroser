/**
 * الصندوق - a simple cash register: every amount that actually moved in or out of the till, and
 * the running balance that log implies (never stored as a separate mutable counter, same
 * derive-don't-store philosophy as storeStore.ts's own stock). Two kinds of entry:
 *  - manual, entered directly here (rent, transport, any expense/income not tied to a specific
 *    store invoice)
 *  - auto-posted from an invoice's own paidAmount at creation time (invoiceId set) - store/page.tsx
 *    does this posting, this module only defines the shape and the pure balance math.
 */

import type { LedgerEntry } from "./ledgerStore";
import { partyAdjustmentCashKind, type PartyAdjustment } from "./partyBalanceStore";
import type { RepSettlement } from "./repStore";

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
  /** Set only when auto-posted from another record (a device payment, a client/supplier balance
   * entry, a representative settlement, a daily closing difference) - the record's own id, so
   * deleting that record removes this entry too. Such entries are never "standalone expenses"
   * (see listStandaloneCashEntries): their business effect is already accounted for elsewhere. */
  sourceId?: string;
  sourceKind?: CashSourceKind;
  createdAt: string;
}

export type CashSourceKind = "device-payment" | "party-balance" | "rep-settlement" | "closing";

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
  sourceId?: string;
  sourceKind?: CashSourceKind;
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
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
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
  return entries.filter((e) => e.invoiceId === undefined && e.sourceId === undefined);
}

/** Removes every cash entry auto-posted from `sourceId` (see CashEntry.sourceId). */
export function removeLinkedCashEntries(entries: CashEntryList, sourceId: string): CashEntryList {
  return entries.filter((e) => e.sourceId !== sourceId);
}

/** Keeps the till in step with one device's ledger after an edit: a newly added payment
 * ("credit") posts a cash "in", a deleted one removes its linked cash entry, and an edited one
 * updates it. Payments recorded before this feature existed have no linked entry and are never
 * posted retroactively - only changes between `prevEntries` and `nextEntries` are applied. */
export function applyLedgerPaymentsToCash(
  cash: CashEntryList,
  prevEntries: LedgerEntry[],
  nextEntries: LedgerEntry[],
  deviceName: string,
): CashEntryList {
  const prevById = new Map(prevEntries.map((e) => [e.id, e]));
  const nextIds = new Set(nextEntries.map((e) => e.id));
  let result = cash;
  for (const prev of prevEntries) {
    if (!nextIds.has(prev.id)) result = removeLinkedCashEntries(result, prev.id);
  }
  for (const entry of nextEntries) {
    if (entry.kind !== "credit") continue;
    const prev = prevById.get(entry.id);
    if (!prev) {
      const posted = recordCashEntry(result, {
        kind: "in",
        amount: entry.amount,
        currencyCode: entry.currency,
        date: entry.date,
        category: "دفعة جهاز",
        note: entry.note ? `${deviceName} - ${entry.note}` : deviceName,
        sourceId: entry.id,
        sourceKind: "device-payment",
      });
      if (posted.ok) result = posted.entries;
    } else if (prev.amount !== entry.amount || prev.currency !== entry.currency || prev.date !== entry.date) {
      result = result.map((c) =>
        c.sourceId === entry.id ? { ...c, amount: entry.amount, currencyCode: entry.currency, date: entry.date } : c,
      );
    }
  }
  return result;
}

/** Posts a client/supplier balance entry that moved real money (adjustment.cashMoved) into the
 * till, linked by sourceId so deleting the balance entry removes it too. A no-op otherwise. */
export function postPartyAdjustmentToCash(cash: CashEntryList, adjustment: PartyAdjustment, partyName: string): CashEntryList {
  if (!adjustment.cashMoved) return cash;
  const posted = recordCashEntry(cash, {
    kind: partyAdjustmentCashKind(adjustment.partyKind, adjustment.direction),
    amount: adjustment.amount,
    currencyCode: adjustment.currencyCode,
    date: adjustment.date,
    category: adjustment.partyKind === "client" ? "دفعة زبون" : "دفعة مورد",
    note: adjustment.note ? `${partyName} - ${adjustment.note}` : partyName,
    sourceId: adjustment.id,
    sourceKind: "party-balance",
  });
  return posted.ok ? posted.entries : cash;
}

/** A representative handing over collected cash ("cashHandover") puts it in the till; paying out
 * their commission ("commissionPayout") takes it out. Manual credit/debit adjustments are
 * bookkeeping corrections, not cash, so they never touch الصندوق. */
export function postRepSettlementToCash(cash: CashEntryList, settlement: RepSettlement, repName: string): CashEntryList {
  if (settlement.kind !== "cashHandover" && settlement.kind !== "commissionPayout") return cash;
  const isHandover = settlement.kind === "cashHandover";
  const posted = recordCashEntry(cash, {
    kind: isHandover ? "in" : "out",
    amount: settlement.amount,
    currencyCode: settlement.currencyCode,
    date: settlement.date,
    category: isHandover ? "تسليم مندوب" : "عمولة مندوب",
    note: settlement.note ? `${repName} - ${settlement.note}` : repName,
    sourceId: settlement.id,
    sourceKind: "rep-settlement",
  });
  return posted.ok ? posted.entries : cash;
}

// ---- Daily closing (إغلاق الصندوق اليومي) ----

/** One currency's line on a daily closing: what the log says should be in the till by the end of
 * the day vs what was actually counted. A non-zero difference is also posted to the log itself
 * (sourceKind "closing") so the running balance matches the real till from then on. */
export interface CashClosingLine {
  currencyCode: string;
  expected: number;
  counted: number;
  difference: number;
}

export interface CashClosing {
  id: string;
  /** yyyy-mm-dd - the day being closed. */
  date: string;
  lines: CashClosingLine[];
  note?: string;
  createdAt: string;
}

export type CashClosingList = CashClosing[];

const CLOSINGS_KEY = "starnet_cash_closings_v1";

export function loadCashClosings(): CashClosingList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CLOSINGS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CashClosingList) : [];
  } catch {
    return [];
  }
}

export function saveCashClosings(closings: CashClosingList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLOSINGS_KEY, JSON.stringify(closings));
}

export interface CashDaySummary {
  /** Balance carried in from every earlier day. */
  opening: number;
  in: number;
  out: number;
  /** opening + in - out: what should be in the till at the end of `date`. */
  expected: number;
}

/** Per currency, the till's movement on `date` and the balance it should end the day with. Any
 * later-dated entry is ignored, so an older day can still be closed correctly. */
export function computeCashDaySummary(entries: CashEntryList, date: string): Record<string, CashDaySummary> {
  const result: Record<string, CashDaySummary> = {};
  for (const entry of entries) {
    if (entry.date > date) continue;
    const s = (result[entry.currencyCode] ??= { opening: 0, in: 0, out: 0, expected: 0 });
    const delta = entry.kind === "in" ? entry.amount : -entry.amount;
    if (entry.date < date) s.opening += delta;
    else if (entry.kind === "in") s.in += entry.amount;
    else s.out += entry.amount;
    s.expected += delta;
  }
  return result;
}

export type RecordCashClosingResult =
  | { ok: true; cash: CashEntryList; closings: CashClosingList; closing: CashClosing }
  | { ok: false; message: string };

/** Records a day's closing from the actually-counted amounts (per currency). Each non-zero
 * difference becomes a linked cash entry - a surplus "in", a shortage "out". */
export function recordCashClosing(
  cash: CashEntryList,
  closings: CashClosingList,
  date: string,
  counted: Record<string, number>,
  note?: string,
): RecordCashClosingResult {
  const codes = Object.keys(counted);
  if (codes.length === 0) return { ok: false, message: "أدخل المبلغ الفعلي في الصندوق" };
  for (const code of codes) {
    const value = counted[code]!;
    if (!Number.isFinite(value) || value < 0) return { ok: false, message: "أدخل مبلغًا صحيحًا (صفر أو أكثر)" };
  }
  const summary = computeCashDaySummary(cash, date);
  const closing: CashClosing = {
    id: newId(),
    date,
    lines: codes.map((currencyCode) => {
      const expected = summary[currencyCode]?.expected ?? 0;
      const countedValue = counted[currencyCode]!;
      return { currencyCode, expected, counted: countedValue, difference: countedValue - expected };
    }),
    note: note?.trim() || undefined,
    createdAt: nowIso(),
  };
  let nextCash = cash;
  for (const line of closing.lines) {
    if (Math.abs(line.difference) < 0.005) continue;
    const posted = recordCashEntry(nextCash, {
      kind: line.difference > 0 ? "in" : "out",
      amount: Math.abs(line.difference),
      currencyCode: line.currencyCode,
      date,
      category: line.difference > 0 ? "زيادة في الصندوق" : "عجز في الصندوق",
      note: `إغلاق يوم ${date}`,
      sourceId: closing.id,
      sourceKind: "closing",
    });
    if (posted.ok) nextCash = posted.entries;
  }
  return { ok: true, cash: nextCash, closings: [...closings, closing], closing };
}

/** Undoes a closing: removes it and the difference entries it posted. */
export function deleteCashClosing(
  cash: CashEntryList,
  closings: CashClosingList,
  closingId: string,
): { cash: CashEntryList; closings: CashClosingList } {
  return { cash: removeLinkedCashEntries(cash, closingId), closings: closings.filter((c) => c.id !== closingId) };
}
