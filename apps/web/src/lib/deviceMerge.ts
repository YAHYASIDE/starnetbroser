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
    // A pair he marked «ليس مكرّرًا» is never a twin again (either card's list counts).
    const others = active.filter((o) => !isMarkedNotDuplicate(a, o));
    const twin = sameDeviceAs(a, others);
    if (twin) out.set(a.id, twin.account);
  }
  return out;
}

/** 🔗 He said these two are different devices (`notDuplicateOf` on either one). */
export function isMarkedNotDuplicate(a: StarlinkAccountSummary, b: StarlinkAccountSummary): boolean {
  return Boolean(a.notDuplicateOf?.includes(b.id) || b.notDuplicateOf?.includes(a.id));
}

/** «✕» on «⚠️ مكرّر»: the patch for each of the two devices (each remembers the other). */
export function notDuplicatePatches(a: StarlinkAccountSummary, b: StarlinkAccountSummary): { id: string; patch: Pick<StarlinkAccountSummary, "notDuplicateOf"> }[] {
  const add = (self: StarlinkAccountSummary, other: string) => ({ id: self.id, patch: { notDuplicateOf: [...new Set([...(self.notDuplicateOf ?? []), other])] } });
  return [add(a, b.id), add(b, a.id)];
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

/**
 * 🔗 «ربط» a rep's new device that the operator already has (his Oct 26 2026 ask «اجعل الربط يضيف الجديد بدل
 * القديم»): the rep's device (with its fresh session) stays, the old one's records and what the new one
 * lacks move onto it (`mergeDevices`), it is the rep's, and the old one goes to the trash.
 */
export function replaceWithNew(input: {
  accounts: StarlinkAccountSummary[];
  newId: string;
  oldId: string;
  repId: string;
  ledger: LedgerByAccount;
  allocations: AllocationsByAccount;
  previousDebts: PreviousDebtList;
  at: string;
}): (MergeResult & { accounts: StarlinkAccountSummary[] }) | null {
  const keep = input.accounts.find((a) => a.id === input.newId);
  const drop = input.accounts.find((a) => a.id === input.oldId);
  if (!keep || !drop || keep.id === drop.id) return null;
  const merged = mergeDevices({ keep, drop, ledger: input.ledger, allocations: input.allocations, previousDebts: input.previousDebts });
  const accounts = input.accounts.map((a) =>
    a.id === keep.id ? { ...a, ...merged.keepPatch, representativeId: input.repId } : a.id === drop.id ? { ...a, deletedAt: input.at } : a,
  );
  return { ...merged, accounts };
}
