/**
 * Tracks how much of a customer payment (a "credit"/"له" LedgerEntry) has been applied toward
 * which shipment (a "debit"/"عليه" LedgerEntry) - kept as fully independent, reviewable records
 * (per the spec's own "احفظ تخصيص الدفعة كسجل مستقل يمكن مراجعته"), never by mutating either
 * entry's own amount/currency. A payment can be split across several shipments, and a shipment
 * can receive partial allocations from several different payments over time - both many-to-many.
 * Allocation is always same-currency: never converts a payment into a shipment's currency without
 * an explicit rate and approval, so only same-currency shipments are ever eligible.
 */

import { LedgerCurrency, LedgerEntry } from "./ledgerStore";

export interface PaymentAllocation {
  id: string;
  paymentEntryId: string;
  shipmentEntryId: string;
  /** Always positive, in `currency` - never converted from what the payment was actually made in. */
  amount: number;
  currency: LedgerCurrency;
  createdAt: string;
}

export type AllocationsByAccount = Record<string, PaymentAllocation[]>;

const STORAGE_KEY = "starnet_payment_allocations_v1";

export function loadAllocationStore(): AllocationsByAccount {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as AllocationsByAccount;
  } catch {
    return {};
  }
}

export function saveAllocationStore(store: AllocationsByAccount): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getAccountAllocations(store: AllocationsByAccount, accountId: string): PaymentAllocation[] {
  return store[accountId] ?? [];
}

/** Every allocation in the store, from every device, flattened into one list - the correct input
 * whenever a shipment's payment status must reflect a payment regardless of which device's own
 * ledger that "له" entry happens to be filed under (a payment can be allocated to a shipment on a
 * DIFFERENT device than its own - see planFifoAllocation's device-scoping). Allocation records are
 * always stored under the paying entry's own device, never the shipment's - this is simply how
 * every read (payment status, paid/remaining totals, linked-payment lists) sees the whole picture. */
export function allStoredAllocations(store: AllocationsByAccount): PaymentAllocation[] {
  return Object.values(store).flat();
}

/** Removes every allocation touching this entry, wherever in the WHOLE store it's filed - unlike
 * removeAllocationsForEntry (which only edits one already-extracted array), this walks every
 * device's own list. Needed because a shipment deleted on device B may have been paid by an
 * allocation filed under device A's key (A being where the paying "له" entry lives, chosen
 * manually as a different device) - that record would otherwise dangle. */
export function removeAllocationsForEntryFromStore(store: AllocationsByAccount, entryId: string): AllocationsByAccount {
  const next: AllocationsByAccount = {};
  for (const [accountId, list] of Object.entries(store)) {
    next[accountId] = removeAllocationsForEntry(list, entryId);
  }
  return next;
}

export function withAccountAllocations(
  store: AllocationsByAccount,
  accountId: string,
  allocations: PaymentAllocation[],
): AllocationsByAccount {
  return { ...store, [accountId]: allocations };
}

export function createAllocation(
  paymentEntryId: string,
  shipmentEntryId: string,
  amount: number,
  currency: LedgerCurrency,
): PaymentAllocation {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `alloc-${Date.now()}-${Math.random()}`;
  return { id, paymentEntryId, shipmentEntryId, amount, currency, createdAt: new Date().toISOString() };
}

export function addAllocations(allocations: PaymentAllocation[], newOnes: PaymentAllocation[]): PaymentAllocation[] {
  return [...allocations, ...newOnes];
}

/** Removes every allocation touching this entry, on either side - called when deleting a payment
 * (its allocations are meaningless without it) or a shipment (nothing left to have been paying
 * toward). Never leaves a dangling reference to a deleted entry. */
export function removeAllocationsForEntry(allocations: PaymentAllocation[], entryId: string): PaymentAllocation[] {
  return allocations.filter((a) => a.paymentEntryId !== entryId && a.shipmentEntryId !== entryId);
}

/** Total already allocated toward one shipment, in the shipment's own currency (every allocation
 * targeting it is already guaranteed same-currency by construction). */
export function paidTowardShipment(allocations: PaymentAllocation[], shipmentEntryId: string): number {
  return allocations.filter((a) => a.shipmentEntryId === shipmentEntryId).reduce((sum, a) => sum + a.amount, 0);
}

/** Total already allocated FROM one payment, across however many shipments it's been split
 * toward - the flip side of paidTowardShipment. `payment.amount - allocatedFromPayment(...)` is
 * that payment's own unallocated remainder ("رصيد غير مخصص للزبون") - never silently dropped,
 * always explicitly shown so it can be allocated later via "تخصيص الدفعة". */
export function allocatedFromPayment(allocations: PaymentAllocation[], paymentEntryId: string): number {
  return allocations.filter((a) => a.paymentEntryId === paymentEntryId).reduce((sum, a) => sum + a.amount, 0);
}

export type ShipmentPaymentStatus = "unpaid" | "partial" | "paid";

/** Compares against the shipment's own `amount` - a shipment entry itself is never mutated when
 * paid, so this is always derived fresh from the allocation records. */
export function computeShipmentPaymentStatus(
  shipment: LedgerEntry,
  allocations: PaymentAllocation[],
): ShipmentPaymentStatus {
  const paid = paidTowardShipment(allocations, shipment.id);
  if (paid <= 0) return "unpaid";
  if (paid >= shipment.amount) return "paid";
  return "partial";
}

export interface AllocationPlanItem {
  shipmentEntryId: string;
  amount: number;
}

export interface FifoAllocationPlan {
  plan: AllocationPlanItem[];
  /** Amount left over once every eligible (same-currency, not-yet-fully-paid) shipment on this
   * device has been filled - a legitimate outcome (overpayment/credit balance), never silently
   * dropped. Callers must decide what to do with it, e.g. showing it plainly before confirming. */
  unallocated: number;
}

/**
 * FIFO (rule 3): fills the oldest not-yet-fully-paid shipment in `currency` first, splitting
 * `amount` across as many as needed. Read-only - never mutates or saves anything, just proposes a
 * plan a caller shows the operator before it's confirmed (and possibly edited) into real
 * PaymentAllocation records.
 */
export function planFifoAllocation(
  entries: LedgerEntry[],
  allocations: PaymentAllocation[],
  amount: number,
  currency: LedgerCurrency,
): FifoAllocationPlan {
  const eligible = entries
    .filter((entry) => entry.kind === "debit" && entry.currency === currency)
    .map((entry) => ({ entry, remaining: entry.amount - paidTowardShipment(allocations, entry.id) }))
    .filter((row) => row.remaining > 0)
    .sort((a, b) => {
      if (a.entry.date !== b.entry.date) return a.entry.date < b.entry.date ? -1 : 1;
      return a.entry.createdAt < b.entry.createdAt ? -1 : 1;
    });

  const plan: AllocationPlanItem[] = [];
  let left = amount;
  for (const row of eligible) {
    if (left <= 0) break;
    const take = Math.min(left, row.remaining);
    plan.push({ shipmentEntryId: row.entry.id, amount: take });
    left -= take;
  }

  return { plan, unallocated: Math.max(0, left) };
}
