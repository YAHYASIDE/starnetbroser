"use client";

import { useMemo, useState } from "react";
import { EditLedgerEntryDialog } from "./EditLedgerEntryDialog";
import { loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { loadCurrencyStore, saveCurrencyStore, upsertCurrency, UpsertCurrencyInput } from "@/lib/currencyStore";
import { applyLedgerEntryEdit } from "@/lib/ledgerEntryEdit";
import { confirmClosedMonthChange, ledgerEditMonthDates } from "@/lib/monthClosing";
import { LedgerByAccount, LedgerEntry, saveLedgerStore } from "@/lib/ledgerStore";
import { allocatedFromPayment, allStoredAllocations, loadAllocationStore, paidTowardShipment } from "@/lib/paymentAllocationStore";

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
