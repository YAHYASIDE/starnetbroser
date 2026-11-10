/**
 * 🗑️ The impure side of deletedOps.ts: what is still deleted right now, and «↩️ استرجاع» (the record back into its
 * store - then it no longer shows as deleted, see stillDeleted).
 */

import { liveIdsOf, loadDeletedOps, restoreInList, restoreLedger, saveDeletedOps, stillDeleted, type DeletedOp } from "./deletedOps";
import { loadLedgerStore, saveLedgerStore } from "./ledgerStore";
import { loadPartyAdjustments, savePartyAdjustments } from "./partyBalanceStore";
import { loadRepSettlements, saveRepSettlements } from "./repStore";

/** Every deletion whose record is not back in its store. */
export function deletedNow(): DeletedOp[] {
  return stillDeleted(loadDeletedOps(), liveIdsOf(loadLedgerStore(), loadRepSettlements(), loadPartyAdjustments()));
}

/** ↩️ Puts the deleted record back as it was, and drops it from the log. */
export function restoreDeletedOp(id: string): boolean {
  const log = loadDeletedOps();
  const d = log.find((x) => x.id === id);
  if (!d) return false;
  if (d.store === "ledger") saveLedgerStore(restoreLedger(loadLedgerStore(), d));
  else if (d.store === "settlement") saveRepSettlements(restoreInList(loadRepSettlements(), d.record));
  else savePartyAdjustments(restoreInList(loadPartyAdjustments(), d.record));
  saveDeletedOps(log.filter((x) => x.id !== id));
  return true;
}
