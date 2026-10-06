"use client";

import { useMemo, useState } from "react";
import { EditLedgerEntryDialog } from "./EditLedgerEntryDialog";
import { loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { loadCurrencyStore, saveCurrencyStore, upsertCurrency, UpsertCurrencyInput } from "@/lib/currencyStore";
import { applyLedgerEntryDelete, applyLedgerEntryEdit } from "@/lib/ledgerEntryEdit";
import { confirmClosedMonthChange, ledgerEditMonthDates, ledgerEntryMonthDates } from "@/lib/monthClosing";
import { LedgerByAccount, LedgerEntry, saveLedgerStore } from "@/lib/ledgerStore";
import { deleteProof } from "@/lib/paymentProofStore";
import {
  AllocationsByAccount,
  allocatedFromPayment,
  allStoredAllocations,
  loadAllocationStore,
  paidTowardShipment,
  saveAllocationStore,
} from "@/lib/paymentAllocationStore";

/** 🗑 «حذف العملية» from a statement: asks first (and for a closed month), then removes the entry,
 * its linked cash entry, its allocations and its proof photo. Null when he cancelled. */
export function confirmAndDeleteLedgerEntry(
  ledgerStore: LedgerByAccount,
  accountId: string,
  entry: LedgerEntry,
  deviceName: string,
): { ledgerStore: LedgerByAccount; allocations: AllocationsByAccount } | null {
  if (!confirmClosedMonthChange(ledgerEntryMonthDates(entry))) return null;
  const what = entry.kind === "credit" ? "هذه الدفعة" : "هذه الشحنة";
  if (!window.confirm(`حذف ${what} نهائيًا؟ تُحذف معها حركتها في الكاش وربطها بالدفعات. لا يمكن التراجع.`)) return null;
  const result = applyLedgerEntryDelete(ledgerStore, loadCashEntries(), loadAllocationStore(), accountId, entry.id, deviceName);
  saveLedgerStore(result.ledgerStore);
  saveCashEntries(result.cash);
  saveAllocationStore(result.allocations);
  void deleteProof(entry.id);
  return { ledgerStore: result.ledgerStore, allocations: result.allocations };
}

/** Edits a past device operation from any statement (device, client, representative) through the
 * same dialog as "إضافة دفعة", then saves the ledger and keeps the till in step. */
export function LedgerEntryEditor({
  accountId,
  entry,
  deviceName,
  ledgerStore,
  onSaved,
  onClose,
}: {
  accountId: string;
  entry: LedgerEntry;
  deviceName: string;
  ledgerStore: LedgerByAccount;
  onSaved: (next: LedgerByAccount) => void;
  onClose: () => void;
}) {
  const [currencyStore, setCurrencyStore] = useState(loadCurrencyStore);
  const allocations = useMemo(() => allStoredAllocations(loadAllocationStore()), []);
  const hasAllocations =
    entry.kind === "debit" ? paidTowardShipment(allocations, entry.id) > 0 : allocatedFromPayment(allocations, entry.id) > 0;

  function handleUpsertCurrency(input: UpsertCurrencyInput) {
    const next = upsertCurrency(currencyStore, input);
    setCurrencyStore(next);
    saveCurrencyStore(next);
    return next[input.code.trim().toUpperCase()]!;
  }

  return (
    <EditLedgerEntryDialog
      entry={entry}
      currencyStore={currencyStore}
      hasAllocations={hasAllocations}
      onUpsertCurrency={handleUpsertCurrency}
      onClose={onClose}
      onSave={(patch) => {
        if (!confirmClosedMonthChange(ledgerEditMonthDates(entry, patch))) return;
        const result = applyLedgerEntryEdit(ledgerStore, loadCashEntries(), accountId, entry.id, patch, deviceName);
        saveLedgerStore(result.ledgerStore);
        saveCashEntries(result.cash);
        onSaved(result.ledgerStore);
        onClose();
      }}
    />
  );
}
