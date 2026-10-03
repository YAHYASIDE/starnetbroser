import { CashEntryList, applyLedgerPaymentsToCash } from "./cashStore";
import { LedgerByAccount, getAccountEntries } from "./ledgerStore";
import { AllocationsByAccount, removeAllocationsForEntryFromStore } from "./paymentAllocationStore";
import { PreviousDebtList } from "./previousDebt";

/**
 * Deleting a device permanently (from سلة المحذوفات) removes only the card by default - its
 * operations stay and keep counting in profits/D/reports as "جهاز محذوف". When the operator
 * chooses to delete them too, everything that was derived from them has to go with them: the
 * cash-register entries they posted, every payment allocation touching them (on any device), and
 * the device's recorded previous debts.
 */

export interface DeviceRecordsSummary {
  entryCount: number;
  previousDebtCount: number;
}

export function deviceRecordsSummary(accountId: string, ledger: LedgerByAccount, previousDebts: PreviousDebtList): DeviceRecordsSummary {
  return {
    entryCount: getAccountEntries(ledger, accountId).length,
    previousDebtCount: previousDebts.filter((d) => d.accountId === accountId).length,
  };
}

export function hasDeviceRecords(summary: DeviceRecordsSummary): boolean {
  return summary.entryCount > 0 || summary.previousDebtCount > 0;
}

export interface DeviceStores {
  ledger: LedgerByAccount;
  allocations: AllocationsByAccount;
  cash: CashEntryList;
  previousDebts: PreviousDebtList;
}

export function removeDeviceRecords(stores: DeviceStores, accountId: string, deviceName: string): DeviceStores {
  const entries = getAccountEntries(stores.ledger, accountId);
  const ledger = { ...stores.ledger };
  delete ledger[accountId];

  let allocations = stores.allocations;
  for (const entry of entries) allocations = removeAllocationsForEntryFromStore(allocations, entry.id);
  if (accountId in allocations) {
    allocations = { ...allocations };
    delete allocations[accountId];
  }

  return {
    ledger,
    allocations,
    cash: applyLedgerPaymentsToCash(stores.cash, entries, [], deviceName),
    previousDebts: stores.previousDebts.filter((d) => d.accountId !== accountId),
  };
}

/** The confirm text for the permanent-delete question, or null when there's nothing to ask. */
export function deviceRecordsQuestion(deviceName: string, summary: DeviceRecordsSummary): string | null {
  if (!hasDeviceRecords(summary)) return null;
  const parts: string[] = [];
  if (summary.entryCount > 0) parts.push(`${summary.entryCount} عملية`);
  if (summary.previousDebtCount > 0) parts.push(`${summary.previousDebtCount} دين سابق`);
  return (
    `للجهاز "${deviceName}" ${parts.join(" و ")}.\n` +
    "هل تريد حذفها أيضًا؟ ستُحذف من الأرباح والديون والصندوق والتقارير نهائيًا.\n\n" +
    "موافق = احذفها مع الجهاز\n" +
    "إلغاء = احتفظ بها (تبقى في التقارير باسم «جهاز محذوف»)"
  );
}
