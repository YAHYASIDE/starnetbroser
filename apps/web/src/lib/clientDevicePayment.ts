/**
 * "دفعة عن جهاز" from the client card: a payment the client made for one of their devices,
 * recorded exactly as the device's own ledger would record it - a "credit" entry with its payment
 * channel and locked exchange rate, allocated FIFO to that device's oldest unpaid shipments in the
 * same currency. Anything beyond what's owed stays unallocated (a credit the operator can place
 * later from the device's ledger).
 */

import { CurrencyStore, getCurrency } from "./currencyStore";
import { createLedgerEntry, LedgerCurrency, LedgerEntry, PaymentMethod } from "./ledgerStore";
import { createAllocation, PaymentAllocation, planFifoAllocation } from "./paymentAllocationStore";

export interface ClientDevicePaymentInput {
  amount: number;
  currency: LedgerCurrency;
  date: string;
  note?: string;
  email?: string;
  paymentMethod: PaymentMethod;
  /** 🔒 A fixed id (e.g. from the rep's request): recording it twice is impossible - see
   * saveClientDevicePayment. */
  entryId?: string;
}

export type ClientDevicePaymentResult =
  | { ok: true; entry: LedgerEntry; allocations: PaymentAllocation[]; unallocated: number }
  | { ok: false; message: string };

export function buildClientDevicePayment(
  deviceEntries: LedgerEntry[],
  deviceAllocations: PaymentAllocation[],
  currencyStore: CurrencyStore,
  input: ClientDevicePaymentInput,
): ClientDevicePaymentResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "أدخل مبلغًا صحيحًا أكبر من صفر" };
  let paymentRate: { rateFromUsd: number; usdValue: number } | undefined;
  if (input.currency !== "USD") {
    const rate = getCurrency(currencyStore, input.currency)?.rateFromUsd;
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      return { ok: false, message: `سعر صرف ${input.currency} غير مسجّل في العملات` };
    }
    paymentRate = { rateFromUsd: rate, usdValue: input.amount / rate };
  }
  const created = createLedgerEntry({
    kind: "credit",
    amount: input.amount,
    currency: input.currency,
    note: input.note ?? "",
    email: input.email ?? "",
    paymentMethod: input.paymentMethod,
    date: input.date,
    paymentRate,
  });
  const entry = input.entryId ? { ...created, id: input.entryId } : created;
  const { plan, unallocated } = planFifoAllocation(deviceEntries, deviceAllocations, input.amount, input.currency);
  const allocations = plan.map((item) => createAllocation(entry.id, item.shipmentEntryId, item.amount, input.currency));
  return { ok: true, entry, allocations, unallocated };
}
