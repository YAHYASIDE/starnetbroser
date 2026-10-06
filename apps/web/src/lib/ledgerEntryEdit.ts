/**
 * Editing one past device operation (a shipment or a payment) from anywhere the operator reviews
 * it - the device statement, the client card, a representative's statement - with the same effect
 * as editing it in "إضافة دفعة": the entry changes in place and its linked cash entry follows.
 */

import { applyLedgerPaymentsToCash, CashEntryList } from "./cashStore";
import { getAccountEntries, LedgerByAccount, LedgerEntry, removeEntry, updateEntry, withAccountEntries } from "./ledgerStore";
import { AllocationsByAccount, removeAllocationsForEntryFromStore } from "./paymentAllocationStore";

export function applyLedgerEntryEdit(
  ledgerStore: LedgerByAccount,
  cash: CashEntryList,
  accountId: string,
  entryId: string,
  patch: Partial<LedgerEntry>,
  deviceName: string,
): { ledgerStore: LedgerByAccount; cash: CashEntryList } {
  const before = getAccountEntries(ledgerStore, accountId);
  const after = updateEntry(before, entryId, patch);
  return {
    ledgerStore: withAccountEntries(ledgerStore, accountId, after),
    cash: applyLedgerPaymentsToCash(cash, before, after, deviceName),
  };
}

/** 🗑 Deleting one past operation from a statement (his request «زر حذف العملية»): the same effect
 * as deleting it in «إضافة دفعة» - the entry, its linked cash entry, and every allocation that
 * used it go together. */
export function applyLedgerEntryDelete(
  ledgerStore: LedgerByAccount,
  cash: CashEntryList,
  allocations: AllocationsByAccount,
  accountId: string,
  entryId: string,
  deviceName: string,
): { ledgerStore: LedgerByAccount; cash: CashEntryList; allocations: AllocationsByAccount } {
  const before = getAccountEntries(ledgerStore, accountId);
  const after = removeEntry(before, entryId);
  return {
    ledgerStore: withAccountEntries(ledgerStore, accountId, after),
    cash: applyLedgerPaymentsToCash(cash, before, after, deviceName),
    allocations: removeAllocationsForEntryFromStore(allocations, entryId),
  };
}
