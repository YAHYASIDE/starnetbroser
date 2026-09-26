/**
 * Sales representatives (مندوبو مبيعات - عمولة): each one earns a commission percentage on every
 * sale invoice attributed to them (see invoiceStore.ts's Invoice.representativeId), and may also
 * be the one who physically collects cash from the customer and hands it to the operator later -
 * so besides the registry itself, this module tracks two independent running balances per rep:
 * cash they're currently holding (collected but not yet handed over) and commission the operator
 * still owes them (accrued but not yet paid out). Both are settled via RepSettlement records,
 * exactly like ledgerStore.ts's own debit/credit entries settle a device's balance - never by
 * mutating a running total directly, so every settlement stays a reviewable, deletable record.
 */

import { Invoice, invoiceTotal } from "./invoiceStore";
import { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { computeExpectedShipmentProfit, computeShipmentProfit, shipmentProfitDate, ShipmentProfit } from "./accountingStore";

export interface Representative {
  id: string;
  name: string;
  phone?: string;
  /** Percentage of each sale invoice's total (e.g. 5 for 5%) - the current/default rate offered
   * to new invoices; an already-created invoice keeps its own locked snapshot (see
   * Invoice.representativeCommissionPercent) so changing this later never rewrites past
   * commission. */
  commissionPercent: number;
  /** When true the rep also carries their percent of a device shipment's LOSS (a negative share
   * that reduces what we owe them). Off by default: the operator carries every loss alone. Locked
   * onto each shipment at creation (LedgerEntry.representativeSharesLosses), like the percent. */
  sharesLosses?: boolean;
  /** "تصفير الحساب" - a fresh start: only records after this point count toward his balances and
   * statement; older ones stay untouched, shown in the archive (see repAccount.ts). */
  resetFrom?: RepResetPoint;
  createdAt: string;
  updatedAt: string;
}

/** Records dated after `date`, or on `date` and created after `at` ("" = the whole day counts). */
export interface RepResetPoint {
  date: string;
  at: string;
}

/** representativeId -> Representative. */
export type RepresentativeStore = Record<string, Representative>;

const REPS_KEY = "starnet_representatives_v1";

export function loadRepresentativeStore(): RepresentativeStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REPS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as RepresentativeStore;
  } catch {
    return {};
  }
}

export function saveRepresentativeStore(store: RepresentativeStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REPS_KEY, JSON.stringify(store));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getRepresentative(store: RepresentativeStore, id: string | undefined): Representative | undefined {
  if (!id) return undefined;
  return store[id];
}

/** Every representative, sorted by name (Arabic-aware) for a stable, predictable picker list. */
export function listRepresentatives(store: RepresentativeStore): Representative[] {
  return Object.values(store).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export interface CreateRepresentativeInput {
  name: string;
  phone?: string;
  commissionPercent: number;
  sharesLosses?: boolean;
}

export function createRepresentative(
  store: RepresentativeStore,
  input: CreateRepresentativeInput,
): { store: RepresentativeStore; representative: Representative } {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rep-${Date.now()}-${Math.random()}`;
  const now = new Date().toISOString();
  const representative: Representative = {
    id,
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    commissionPercent: Math.max(0, input.commissionPercent),
    sharesLosses: input.sharesLosses || undefined,
    createdAt: now,
    updatedAt: now,
  };
  return { store: { ...store, [id]: representative }, representative };
}

export function updateRepresentative(
  store: RepresentativeStore,
  id: string,
  patch: CreateRepresentativeInput,
): RepresentativeStore {
  const existing = store[id];
  if (!existing) return store;
  const updated: Representative = {
    ...existing,
    name: patch.name.trim(),
    phone: patch.phone?.trim() || undefined,
    commissionPercent: Math.max(0, patch.commissionPercent),
    sharesLosses: patch.sharesLosses || undefined,
    updatedAt: new Date().toISOString(),
  };
  return { ...store, [id]: updated };
}

export function setRepresentativeReset(
  store: RepresentativeStore,
  id: string,
  resetFrom: RepResetPoint | undefined,
): RepresentativeStore {
  const existing = store[id];
  if (!existing) return store;
  return { ...store, [id]: { ...existing, resetFrom, updatedAt: new Date().toISOString() } };
}

export function deleteRepresentative(store: RepresentativeStore, id: string): RepresentativeStore {
  const next = { ...store };
  delete next[id];
  return next;
}

/** "cashHandover"/"commissionPayout" settle the two invoice-derived balances below.
 * "manualCredit"/"manualDebit" are free-standing adjustments with no invoice behind them at all
 * (a bonus, an advance/سلفة, a correction) - "credit" adds to what the operator owes the rep,
 * "debit" adds to what the rep owes the operator, exactly like the other two settlement kinds'
 * own direction. */
export type RepSettlementKind = "cashHandover" | "commissionPayout" | "manualCredit" | "manualDebit";

export interface RepSettlement {
  id: string;
  representativeId: string;
  kind: RepSettlementKind;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  /** Exchange rates (units per 1 USD) locked when it was recorded - used only to show it in
   * another currency (repAccount.ts's converter), never to change its own amount. */
  rates?: Record<string, number>;
  createdAt: string;
}

export type RepSettlementList = RepSettlement[];

const SETTLEMENTS_KEY = "starnet_rep_settlements_v1";

export function loadRepSettlements(): RepSettlementList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SETTLEMENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RepSettlementList) : [];
  } catch {
    return [];
  }
}

export function saveRepSettlements(settlements: RepSettlementList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(settlements));
}

export interface RecordRepSettlementInput {
  representativeId: string;
  kind: RepSettlementKind;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  rates?: Record<string, number>;
}

export type RecordRepSettlementResult =
  | { ok: true; settlements: RepSettlementList; settlement: RepSettlement }
  | { ok: false; message: string };

export function recordRepSettlement(
  settlements: RepSettlementList,
  input: RecordRepSettlementInput,
): RecordRepSettlementResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "المبلغ يجب أن يكون أكبر من صفر" };
  }
  const settlement: RepSettlement = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rep-settle-${Date.now()}-${Math.random()}`,
    representativeId: input.representativeId,
    kind: input.kind,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    note: input.note?.trim() || undefined,
    rates: input.rates,
    createdAt: new Date().toISOString(),
  };
  return { ok: true, settlements: [...settlements, settlement], settlement };
}

export type UpdateRepSettlementInput = Omit<RecordRepSettlementInput, "representativeId">;

/** Edits a settlement in place (same id/creation time, same validation) - the caller re-posts its
 * linked cash entry. */
export function updateRepSettlement(
  settlements: RepSettlementList,
  id: string,
  input: UpdateRepSettlementInput,
): RecordRepSettlementResult {
  const existing = settlements.find((s) => s.id === id);
  if (!existing) return { ok: false, message: "العملية غير موجودة" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "المبلغ يجب أن يكون أكبر من صفر" };
  }
  const settlement: RepSettlement = {
    ...existing,
    kind: input.kind,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    note: input.note?.trim() || undefined,
    // Rates stay locked from creation; only a newly needed currency's rate is added.
    rates: input.rates || existing.rates ? { ...input.rates, ...existing.rates } : undefined,
  };
  return { ok: true, settlements: settlements.map((s) => (s.id === id ? settlement : s)), settlement };
}

export function deleteRepSettlement(settlements: RepSettlementList, id: string): RepSettlementList {
  return settlements.filter((s) => s.id !== id);
}

/** Cash the representative has personally collected from customers on sale invoices attributed to
 * them (their own paidAmount at the moment of sale), minus whatever they've already handed over
 * (a "cashHandover" settlement) - per currency, never mixed. A positive figure is money still in
 * the rep's pocket, owed back to the operator. */
export function computeRepCashHeldByCurrency(
  representativeId: string,
  invoices: Invoice[],
  settlements: RepSettlementList,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.kind !== "sale" || inv.returnOfInvoiceId || inv.representativeId !== representativeId) continue;
    if (inv.paidAmount <= 0) continue;
    result[inv.currencyCode] = (result[inv.currencyCode] ?? 0) + inv.paidAmount;
  }
  for (const s of settlements) {
    if (s.representativeId !== representativeId || s.kind !== "cashHandover") continue;
    result[s.currencyCode] = (result[s.currencyCode] ?? 0) - s.amount;
  }
  return result;
}

/** Commission accrued on every sale invoice attributed to this representative (using each
 * invoice's own LOCKED commissionPercent snapshot, never the representative's current rate),
 * minus whatever's already been paid out (a "commissionPayout" settlement) - per currency, never
 * mixed. A positive figure is what the operator still owes the representative. */
export function computeRepCommissionOwedByCurrency(
  representativeId: string,
  invoices: Invoice[],
  settlements: RepSettlementList,
  deviceCommissions: RepDeviceCommissionRow[] = [],
): Record<string, number> {
  const result: Record<string, number> = {};
  addDeviceShares(result, deviceCommissions);
  for (const inv of invoices) {
    if (inv.kind !== "sale" || inv.returnOfInvoiceId || inv.representativeId !== representativeId) continue;
    if (inv.representativeCommissionPercent === undefined) continue;
    const commission = (inv.representativeCommissionPercent / 100) * invoiceTotal(inv);
    if (commission <= 0) continue;
    result[inv.currencyCode] = (result[inv.currencyCode] ?? 0) + commission;
  }
  for (const s of settlements) {
    if (s.representativeId !== representativeId || s.kind !== "commissionPayout") continue;
    result[s.currencyCode] = (result[s.currencyCode] ?? 0) - s.amount;
  }
  return result;
}

/** Free-standing manual adjustments only (see RepSettlementKind) - never touches the two
 * invoice-derived balances above. Per currency, positive = the operator still owes the rep this
 * extra amount (a bonus), negative = the rep still owes the operator (an unpaid advance/سلفة). */
export function computeRepManualBalanceByCurrency(
  representativeId: string,
  settlements: RepSettlementList,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of settlements) {
    if (s.representativeId !== representativeId) continue;
    if (s.kind === "manualCredit") result[s.currencyCode] = (result[s.currencyCode] ?? 0) + s.amount;
    else if (s.kind === "manualDebit") result[s.currencyCode] = (result[s.currencyCode] ?? 0) - s.amount;
  }
  return result;
}

/** Total commission ever accrued for this rep, per currency - deliberately gross (never nets out
 * a "commissionPayout" settlement), for a "ملخص ربحه" summary distinct from what's CURRENTLY
 * owed (computeRepCommissionOwedByCurrency). */
export function computeRepCommissionEarnedByCurrency(
  representativeId: string,
  invoices: Invoice[],
  deviceCommissions: RepDeviceCommissionRow[] = [],
): Record<string, number> {
  const result: Record<string, number> = {};
  addDeviceShares(result, deviceCommissions);
  for (const inv of invoices) {
    if (inv.kind !== "sale" || inv.returnOfInvoiceId || inv.representativeId !== representativeId) continue;
    if (inv.representativeCommissionPercent === undefined) continue;
    const commission = (inv.representativeCommissionPercent / 100) * invoiceTotal(inv);
    if (commission <= 0) continue;
    result[inv.currencyCode] = (result[inv.currencyCode] ?? 0) + commission;
  }
  return result;
}

/** How many devices/accounts currently point at this representative (via account.representativeId)
 * - mirrors clientStore.ts's countLinkedAccounts exactly, same reasoning (used only to warn/inform,
 * never to infer a link). */
export function countLinkedAccounts(accounts: { representativeId?: string }[], representativeId: string): number {
  return accounts.filter((account) => account.representativeId === representativeId).length;
}

/** When a client owns exactly one DISTINCT representative across all their linked devices (see
 * account.representativeId), returns that representativeId - used only to seed a new sale
 * invoice's own representative picker with a sensible, changeable default (InvoiceSection.tsx),
 * never written automatically to any record. A client with no linked devices, no device carrying a
 * representative, or devices split across more than one representative resolves to undefined so
 * nothing is guessed. */
export function repFromClientDevice(
  accounts: { clientId?: string; representativeId?: string }[],
  clientId: string | undefined,
): string | undefined {
  if (!clientId) return undefined;
  const repIds = new Set(
    accounts
      .filter((account) => account.clientId === clientId && account.representativeId)
      .map((account) => account.representativeId as string),
  );
  return repIds.size === 1 ? [...repIds][0] : undefined;
}

export interface RepInvoiceCommissionRow {
  invoice: Invoice;
  commissionAmount: number;
}

/** "ربحه من كل جهاز" - every sale invoice attributed to this rep with its own commission amount,
 * newest first, so the operator can see exactly which device/sale earned him how much (the UI
 * resolves each invoice's own item names from storeStore.ts - this module never depends on it). */
export function listRepInvoiceCommissions(representativeId: string, invoices: Invoice[]): RepInvoiceCommissionRow[] {
  return invoices
    .filter(
      (inv) =>
        inv.kind === "sale" &&
        !inv.returnOfInvoiceId &&
        inv.representativeId === representativeId &&
        inv.representativeCommissionPercent !== undefined,
    )
    .map((inv) => ({ invoice: inv, commissionAmount: (inv.representativeCommissionPercent! / 100) * invoiceTotal(inv) }))
    .sort((a, b) => (a.invoice.date < b.invoice.date ? 1 : a.invoice.date > b.invoice.date ? -1 : 0));
}

// ---- Device profit share (a representative linked to Starlink devices, see
// StarlinkAccountSummary.representativeId and LedgerEntry.representativeId) ----

export interface RepDeviceCommissionRow {
  accountId: string;
  entry: LedgerEntry;
  profit: ShipmentProfit;
  /** The entry's own locked percent - never the representative's current rate. */
  percent: number;
  /** Only set once the shipment's profit is computable (Starlink cost settled). A loss earns the
   * rep nothing (0) - the operator carries it - unless the shipment was locked with
   * representativeSharesLosses, in which case the rep's share is their percent of the loss
   * (negative). */
  repShareUsd?: number;
  ourShareUsd?: number;
  /** Only while the shipment is still D: the rep's share of its EXPECTED profit (see
   * accountingStore.ts's computeExpectedShipmentProfit) - shown, never counted as owed. */
  expectedRepShareUsd?: number;
}

/** The rep's share of a still-D shipment's expected profit, same percent/loss rules. */
function expectedDeviceShare(entry: LedgerEntry, percent: number, sharesLosses = false): number | undefined {
  const expected = computeExpectedShipmentProfit(entry);
  if (expected.status !== "expected" || expected.profitUsd === undefined) return undefined;
  return expected.profitUsd > 0 || sharesLosses ? (expected.profitUsd * percent) / 100 : 0;
}

function deviceShare(profit: ShipmentProfit, percent: number, sharesLosses = false): { repShareUsd?: number; ourShareUsd?: number } {
  if (profit.status !== "computed" || profit.profitUsd === undefined) return {};
  const repShareUsd = profit.profitUsd > 0 || sharesLosses ? (profit.profitUsd * percent) / 100 : 0;
  return { repShareUsd, ourShareUsd: profit.profitUsd - repShareUsd };
}

/** Every shipment (debit entry) on any device that was linked to this representative when it was
 * recorded, with the rep's locked share of its profit - newest first. */
export function listRepDeviceCommissions(representativeId: string, ledgerStore: LedgerByAccount): RepDeviceCommissionRow[] {
  const rows: RepDeviceCommissionRow[] = [];
  for (const [accountId, entries] of Object.entries(ledgerStore)) {
    for (const entry of entries) {
      if (entry.kind !== "debit" || entry.representativeId !== representativeId) continue;
      if (entry.representativeCommissionPercent === undefined) continue;
      const profit = computeShipmentProfit(entry);
      const percent = entry.representativeCommissionPercent;
      rows.push({
        accountId,
        entry,
        profit,
        percent,
        ...deviceShare(profit, percent, entry.representativeSharesLosses),
        expectedRepShareUsd: expectedDeviceShare(entry, percent, entry.representativeSharesLosses),
      });
    }
  }
  return rows.sort((a, b) =>
    a.entry.date !== b.entry.date ? (a.entry.date < b.entry.date ? 1 : -1) : a.entry.createdAt < b.entry.createdAt ? 1 : -1,
  );
}

/** Device profit shares are always in USD (profit itself is computed in USD). A shared loss is a
 * negative share and reduces the figure. */
function addDeviceShares(result: Record<string, number>, rows: RepDeviceCommissionRow[]) {
  for (const row of rows) {
    if (row.repShareUsd === undefined || row.repShareUsd === 0) continue;
    result.USD = (result.USD ?? 0) + row.repShareUsd;
  }
}

export interface RepDeviceTotals {
  /** Profit across every computed shipment on the rep's devices. */
  profitUsd: number;
  repShareUsd: number;
  ourShareUsd: number;
  /** Shipments still waiting for Starlink's cost ("D") - no share yet. */
  pendingCount: number;
  /** The rep's expected share across those D shipments (informational, not owed yet). */
  expectedRepShareUsd: number;
}

export function totalRepDeviceCommissions(rows: RepDeviceCommissionRow[]): RepDeviceTotals {
  const totals: RepDeviceTotals = { profitUsd: 0, repShareUsd: 0, ourShareUsd: 0, pendingCount: 0, expectedRepShareUsd: 0 };
  for (const row of rows) {
    if (row.repShareUsd === undefined || row.ourShareUsd === undefined) {
      if (row.profit.status === "pending") totals.pendingCount += 1;
      totals.expectedRepShareUsd += row.expectedRepShareUsd ?? 0;
      continue;
    }
    totals.profitUsd += row.profit.profitUsd ?? 0;
    totals.repShareUsd += row.repShareUsd;
    totals.ourShareUsd += row.ourShareUsd;
  }
  return totals;
}

/** Sum of every representative's share across the given ledger entries (e.g. one report period),
 * for the reports page's "حصة المندوبين" - entries without a rep snapshot contribute nothing. */
/** One settled shipment's rep share, USD (its own locked percent and loss rule), or undefined when
 * it has no rep or its profit isn't computed yet. */
export function shipmentRepShareUsd(entry: LedgerEntry): number | undefined {
  if (entry.kind !== "debit" || !entry.representativeId || entry.representativeCommissionPercent === undefined) return undefined;
  return deviceShare(computeShipmentProfit(entry), entry.representativeCommissionPercent, entry.representativeSharesLosses).repShareUsd;
}

export function computeRepSharesUsd(entries: LedgerEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.kind !== "debit" || !entry.representativeId || entry.representativeCommissionPercent === undefined) continue;
    const share = deviceShare(
      computeShipmentProfit(entry),
      entry.representativeCommissionPercent,
      entry.representativeSharesLosses,
    ).repShareUsd;
    if (share) total += share;
  }
  return total;
}

export type RepStatementRow =
  | { type: "device"; id: string; date: string; createdAt: string; row: RepDeviceCommissionRow }
  | { type: "invoice"; id: string; date: string; createdAt: string; row: RepInvoiceCommissionRow }
  | { type: "settlement"; id: string; date: string; createdAt: string; settlement: RepSettlement };

export interface RepStatementDay {
  date: string;
  rows: RepStatementRow[];
  /** Device profit shares settled on this day, in USD. */
  deviceProfitUsd: number;
  repShareUsd: number;
  ourShareUsd: number;
}

/** كشف حساب المندوب اليومي: every device shipment on his devices, every store invoice commission,
 * and every settlement, grouped by day (newest day first, newest row first within a day) with
 * that day's own device-profit split. */
export function buildRepDailyStatement(
  representativeId: string,
  deviceCommissions: RepDeviceCommissionRow[],
  invoices: Invoice[],
  settlements: RepSettlementList,
): RepStatementDay[] {
  const rows: RepStatementRow[] = [
    // A shipment's share lands on the day Starlink was paid (its profit became real), not the
    // day it was sold; a still-D shipment sits on its own date as "expected".
    ...deviceCommissions.map((row) => ({
      type: "device" as const,
      id: row.entry.id,
      date: shipmentProfitDate(row.entry),
      createdAt: row.entry.createdAt,
      row,
    })),
    ...listRepInvoiceCommissions(representativeId, invoices).map((row) => ({
      type: "invoice" as const,
      id: row.invoice.id,
      date: row.invoice.date,
      createdAt: row.invoice.createdAt,
      row,
    })),
    ...settlements
      .filter((s) => s.representativeId === representativeId)
      .map((settlement) => ({
        type: "settlement" as const,
        id: settlement.id,
        date: settlement.date,
        createdAt: settlement.createdAt,
        settlement,
      })),
  ];
  const byDate = new Map<string, RepStatementDay>();
  for (const row of rows) {
    const day = byDate.get(row.date) ?? { date: row.date, rows: [], deviceProfitUsd: 0, repShareUsd: 0, ourShareUsd: 0 };
    day.rows.push(row);
    if (row.type === "device" && row.row.repShareUsd !== undefined && row.row.ourShareUsd !== undefined) {
      day.deviceProfitUsd += row.row.profit.profitUsd ?? 0;
      day.repShareUsd += row.row.repShareUsd;
      day.ourShareUsd += row.row.ourShareUsd;
    }
    byDate.set(row.date, day);
  }
  const days = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const day of days) day.rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return days;
}

/** Every rep's share of the EXPECTED profit of still-D shipments among `entries` (reports). */
export function computeExpectedRepSharesUsd(entries: LedgerEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.kind !== "debit" || !entry.representativeId || entry.representativeCommissionPercent === undefined) continue;
    total += expectedDeviceShare(entry, entry.representativeCommissionPercent, entry.representativeSharesLosses) ?? 0;
  }
  return total;
}

/** Same as computeRepSharesUsd / computeExpectedRepSharesUsd, but in MRU: each confirmed share at
 * its shipment's locked MRU rate (else today's), expected shares at today's rate. */
export function computeRepSharesMru(entries: LedgerEntry[], currentMruRate: number): { confirmed: number; expected: number } {
  let confirmed = 0;
  let expected = 0;
  for (const entry of entries) {
    if (entry.kind !== "debit" || !entry.representativeId || entry.representativeCommissionPercent === undefined) continue;
    const share = deviceShare(computeShipmentProfit(entry), entry.representativeCommissionPercent, entry.representativeSharesLosses).repShareUsd;
    if (share) confirmed += share * (entry.profitCurrencyRates?.MRU ?? currentMruRate);
    expected += (expectedDeviceShare(entry, entry.representativeCommissionPercent, entry.representativeSharesLosses) ?? 0) * currentMruRate;
  }
  return { confirmed, expected };
}
