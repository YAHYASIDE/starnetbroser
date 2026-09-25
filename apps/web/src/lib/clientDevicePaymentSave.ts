"use client";

import { applyLedgerPaymentsToCash, loadCashEntries, saveCashEntries } from "./cashStore";
import { buildClientDevicePayment } from "./clientDevicePayment";
import { loadCurrencyStore } from "./currencyStore";
import { getAccountEntries, LedgerByAccount, LedgerCurrency, PaymentMethod, saveLedgerStore, withAccountEntries } from "./ledgerStore";
import { getAccountAllocations, loadAllocationStore, saveAllocationStore, withAccountAllocations } from "./paymentAllocationStore";

export type SaveClientDevicePaymentResult = { ok: true; ledgerStore: LedgerByAccount } | { ok: false; message: string };

/** Saves a client's payment for one device (see clientDevicePayment.ts): the device's ledger, its
 * FIFO allocations, and - when the money came in as cash - the linked entry in الصندوق. */
export function saveClientDevicePayment(
  ledgerStore: LedgerByAccount,
  device: { id: string; name: string; email?: string },
  input: { amount: number; currencyCode: string; date: string; note?: string; paymentMethod?: PaymentMethod; cashMoved?: boolean },
): SaveClientDevicePaymentResult {
  const allocationStore = loadAllocationStore();
  const entries = getAccountEntries(ledgerStore, device.id);
  const result = buildClientDevicePayment(entries, getAccountAllocations(allocationStore, device.id), loadCurrencyStore(), {
    amount: input.amount,
    currency: input.currencyCode as LedgerCurrency,
    date: input.date,
    note: input.note,
    email: device.email,
    paymentMethod: input.paymentMethod ?? "cash",
  });
  if (!result.ok) return result;
  const nextEntries = [...entries, result.entry];
  const nextLedger = withAccountEntries(ledgerStore, device.id, nextEntries);
  saveLedgerStore(nextLedger);
  if (result.allocations.length > 0) {
    const current = getAccountAllocations(allocationStore, device.id);
    saveAllocationStore(withAccountAllocations(allocationStore, device.id, [...current, ...result.allocations]));
  }
  if (input.cashMoved) saveCashEntries(applyLedgerPaymentsToCash(loadCashEntries(), entries, nextEntries, device.name));
  return { ok: true, ledgerStore: nextLedger };
}
