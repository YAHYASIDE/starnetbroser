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

export interface Representative {
  id: string;
  name: string;
  phone?: string;
  /** Percentage of each sale invoice's total (e.g. 5 for 5%) - the current/default rate offered
   * to new invoices; an already-created invoice keeps its own locked snapshot (see
   * Invoice.representativeCommissionPercent) so changing this later never rewrites past
   * commission. */
  commissionPercent: number;
  createdAt: string;
  updatedAt: string;
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
    updatedAt: new Date().toISOString(),
  };
  return { ...store, [id]: updated };
}

export type RepSettlementKind = "cashHandover" | "commissionPayout";

export interface RepSettlement {
  id: string;
  representativeId: string;
  kind: RepSettlementKind;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
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
    createdAt: new Date().toISOString(),
  };
  return { ok: true, settlements: [...settlements, settlement], settlement };
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
): Record<string, number> {
  const result: Record<string, number> = {};
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
