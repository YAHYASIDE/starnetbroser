/**
 * The two small marks at the top of a device card:
 *  - D (red): some shipment's Starlink cost is still unpaid; ✓ (green) once the latest shipment's
 *    cost has been settled and nothing is left as D.
 *  - P (green): the customer has paid the latest shipment in full; an orange P when only part of
 *    it is paid; nothing when none of it is.
 */

import { computeBalanceByCurrency, LedgerEntry } from "./ledgerStore";
import { computeShipmentPaymentStatus, PaymentAllocation } from "./paymentAllocationStore";

export interface DeviceMarks {
  d: "pending" | "settled" | null;
  p: "paid" | "partial" | null;
}

function newestFirst(a: LedgerEntry, b: LedgerEntry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function computeDeviceMarks(entries: LedgerEntry[], allocations: PaymentAllocation[]): DeviceMarks {
  const shipments = entries.filter((e) => e.kind === "debit").sort(newestFirst);
  const latest = shipments[0];
  if (!latest) return { d: null, p: null };

  const anyPending = shipments.some((s) => s.starlinkCost?.status === "pending");
  const d = anyPending ? "pending" : latest.starlinkCost?.status === "settled" ? "settled" : null;

  // Nothing left owed in the latest shipment's currency means it's paid, even when older
  // payments were never allocated to specific shipments.
  const balance = computeBalanceByCurrency(entries)[latest.currency] ?? 0;
  let p: DeviceMarks["p"] = null;
  if (balance <= 0.0001) p = "paid";
  else {
    const status = computeShipmentPaymentStatus(latest, allocations);
    p = status === "paid" ? "paid" : status === "partial" ? "partial" : null;
  }
  return { d, p };
}
