/**
 * 🔗 «دمج»: the same Starlink device registered twice (same email or KIT - often once by the
 * operator and once by a rep). Everything recorded on the duplicate moves to the device kept -
 * its shipments and payments, their payment allocations, previous Starlink debts - and what the
 * kept one lacks (customer, rep, phone, KIT, passwords, monthly price…) is taken from the
 * duplicate; the duplicate then goes to the trash (restorable, emptied of records). Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { sameDeviceAs } from "./duplicates";
import type { LedgerByAccount } from "./ledgerStore";
import type { AllocationsByAccount } from "./paymentAllocationStore";
import type { PreviousDebtList } from "./previousDebt";

/** Fields the operator typed - taken from the duplicate only when the kept device has none. */
const FILL_FIELDS = [
  "clientId",
  "representativeId",
  "phone",
  "kitNumber",
  "serialNumber",
  "expectedEmail",
  "expectedEmailPassword",
  "extraEmails",
  "wifiPassword",
  "starlinkPassword",
  "renewalPlan",
  "paymentCardLast4",
] as const;

const empty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Each active device that has a twin among the active ones (same email or KIT) → its twin. */
export function deviceTwins(accounts: StarlinkAccountSummary[]): Map<string, StarlinkAccountSummary> {
  const active = accounts.filter((a) => !a.deletedAt && !a.archivedAt);
  const out = new Map<string, StarlinkAccountSummary>();
  for (const a of active) {
    const twin = sameDeviceAs(a, active);
    if (twin) out.set(a.id, twin.account);
  }
  return out;
}

export interface MergeResult {
  /** What changes on the kept device (only fields it lacked). */
  keepPatch: Partial<StarlinkAccountSummary>;
  ledger: LedgerByAccount;
  allocations: AllocationsByAccount;
  previousDebts: PreviousDebtList;
  /** How many operations moved. */
  movedEntries: number;
}

export function mergeDevices(input: {
  keep: StarlinkAccountSummary;
  drop: StarlinkAccountSummary;
  ledger: LedgerByAccount;
  allocations: AllocationsByAccount;
  previousDebts: PreviousDebtList;
}): MergeResult {
  const { keep, drop } = input;
  const keepPatch: Partial<StarlinkAccountSummary> = {};
  const kept = keep as unknown as Record<string, unknown>;
  const dropped = drop as unknown as Record<string, unknown>;
  for (const field of FILL_FIELDS) {
    if (empty(kept[field]) && !empty(dropped[field])) (keepPatch as Record<string, unknown>)[field] = dropped[field];
  }
  const moved = input.ledger[drop.id] ?? [];
  const ledger: LedgerByAccount = { ...input.ledger, [keep.id]: [...(input.ledger[keep.id] ?? []), ...moved] };
  delete ledger[drop.id];
  const allocations: AllocationsByAccount = { ...input.allocations, [keep.id]: [...(input.allocations[keep.id] ?? []), ...(input.allocations[drop.id] ?? [])] };
  delete allocations[drop.id];
  const previousDebts = input.previousDebts.map((d) => (d.accountId === drop.id ? { ...d, accountId: keep.id } : d));
  return { keepPatch, ledger, allocations, previousDebts, movedEntries: moved.length };
}
