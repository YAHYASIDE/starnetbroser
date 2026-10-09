/**
 * 🔄 What counts as a RENEWAL (his Oct 2026 rule: «التجديد يجب أن يُحسب فقط لجهاز كانت عليه فاتورة D
 * وأزلتها عنه وأضفت له D جديد»; his choice «D جديد بعد تسديد السابق»): a Starlink shipment (an «عليه»
 * with Starlink's cost) recorded while no earlier D on the same device was still unpaid - its previous
 * D was paid, or it is the device's first. A D added while an earlier one is still open is more on the
 * same month, not a second renewal.
 *
 * His own answer when saving (`LedgerEntry.renewal`, «🔄 هل هذا تجديد؟») always wins; the rule decides
 * the older records. Only COUNTS use this (reports, goals, leaderboards): every shipment keeps its
 * sale, cost and profit whatever it is called. Pure.
 */

import { isShipmentEntry, type LedgerByAccount, type LedgerEntry } from "./ledgerStore";

/** A sale of Starlink service: not a payment, not a travel-registration fee, not an earlier owner's
 * debt being paid. */
function isStarlinkSale(e: LedgerEntry): boolean {
  return isShipmentEntry(e) && !e.previousDebtId;
}

/** Recorded before `e` on the same device (by date, then by when it was saved). */
function before(o: LedgerEntry, e: LedgerEntry): boolean {
  if (o.date !== e.date) return o.date < e.date;
  return o.createdAt < e.createdAt;
}

/** Still owed to Starlink at the moment `e` was recorded. */
function openAt(o: LedgerEntry, e: LedgerEntry): boolean {
  const cost = o.starlinkCost;
  if (!cost) return false;
  if (cost.status === "pending") return true;
  if (cost.settledAt) return cost.settledAt > e.createdAt;
  // No settle time: paid on a later day than `e` = still open when `e` came (same day = paid first).
  return (cost.paidAt ?? "") > e.date;
}

/** The earlier D's of this device still unpaid when `e` was recorded. */
export function openDsBefore(e: LedgerEntry, deviceEntries: LedgerEntry[]): LedgerEntry[] {
  return deviceEntries.filter((o) => o.id !== e.id && isStarlinkSale(o) && before(o, e) && openAt(o, e));
}

/** The D's of this device unpaid right now - what the «هل هذا تجديد؟» question says. */
export function openDsNow(deviceEntries: LedgerEntry[]): LedgerEntry[] {
  return deviceEntries.filter((o) => isStarlinkSale(o) && o.starlinkCost?.status === "pending");
}

export function isRenewalEntry(e: LedgerEntry, deviceEntries: LedgerEntry[]): boolean {
  if (!isStarlinkSale(e)) return false;
  if (e.renewal !== undefined) return e.renewal;
  // An old record with no cost information (before costs were recorded): counted as before.
  if (!e.starlinkCost) return true;
  return openDsBefore(e, deviceEntries).length === 0;
}

/** Every renewal's id, all devices. */
export function renewalIds(ledger: LedgerByAccount): Set<string> {
  const ids = new Set<string>();
  for (const entries of Object.values(ledger)) for (const e of entries) if (isRenewalEntry(e, entries)) ids.add(e.id);
  return ids;
}
