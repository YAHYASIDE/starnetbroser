/**
 * 🗑️ Deleted operations stay visible (his Nov 10 2026 ask: «في كشف حساب أي زبون أو مندوب، عندما نحذف أي عملية أو
 * مبلغ تظهر في كشف حسابه»). His answers: the deletion shows in the statement **as the newest operation at the moment
 * it was deleted** (a later operation comes above it, like any other), in **every** statement (the app, the PDF, the
 * bot, the chat), with «↩️ استرجاع».
 *
 * Each store's save compares what was stored with what is being written and logs the records that disappeared
 * (`starnet_deleted_ops_v1`: business data - in the backup and the team link, never in a rep's copy). Records posted
 * with another one (an invoice's / a source's) and big clean-ups (more than BULK_LIMIT at once: «تصفير», a wipe) are
 * not logged. A logged record that is back in its store (restored, or re-added by the team link) no longer shows -
 * derived, never a flag to keep in step. The deletion never changes a balance: the balance already lost it.
 */

import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import type { RepSettlement } from "./repStore";
import type { PartyAdjustment } from "./partyBalanceStore";

export const DELETED_OPS_KEY = "starnet_deleted_ops_v1";
/** More records gone in one save than this = a clean-up, not «حذف عملية». */
export const BULK_LIMIT = 20;
/** Kept at most (newest first). */
export const MAX_DELETED = 1000;

export type DeletedOp =
  | { id: string; at: string; store: "ledger"; accountId: string; record: LedgerEntry }
  | { id: string; at: string; store: "settlement"; record: RepSettlement }
  | { id: string; at: string; store: "adjustment"; record: PartyAdjustment };

type Rec = { id?: unknown; invoiceId?: unknown; sourceId?: unknown };

/** Posted with another record (removed together with it) - its source's own deletion is what he did. */
function postedWithOther(r: Rec): boolean {
  return Boolean(r.invoiceId || r.sourceId);
}

function gone<T extends Rec>(before: T[], after: T[]): T[] {
  const kept = new Set(after.map((r) => String(r.id)));
  return before.filter((r) => r && typeof r === "object" && r.id !== undefined && !kept.has(String(r.id)) && !postedWithOther(r));
}

/** The ledger entries removed by a save. */
export function ledgerDeletions(before: unknown, after: LedgerByAccount, at: string): DeletedOp[] {
  if (!before || typeof before !== "object" || Array.isArray(before)) return [];
  // an entry moved to another device (a merge, a move) is not deleted: it is still somewhere in the ledger
  const everywhere = Object.values(after).flatMap((list) => (Array.isArray(list) ? list : []));
  const out: DeletedOp[] = [];
  for (const [accountId, list] of Object.entries(before as LedgerByAccount)) {
    if (!Array.isArray(list)) continue;
    for (const record of gone(list, everywhere)) out.push({ id: `del-${record.id}-${at}`, at, store: "ledger", accountId, record });
  }
  return out.length > BULK_LIMIT ? [] : out;
}

export function settlementDeletions(before: unknown, after: RepSettlement[], at: string): DeletedOp[] {
  if (!Array.isArray(before)) return [];
  const out: DeletedOp[] = gone(before as RepSettlement[], after).map((record) => ({ id: `del-${record.id}-${at}`, at, store: "settlement", record }));
  return out.length > BULK_LIMIT ? [] : out;
}

export function adjustmentDeletions(before: unknown, after: PartyAdjustment[], at: string): DeletedOp[] {
  if (!Array.isArray(before)) return [];
  const out: DeletedOp[] = gone(before as PartyAdjustment[], after).map((record) => ({ id: `del-${record.id}-${at}`, at, store: "adjustment", record }));
  return out.length > BULK_LIMIT ? [] : out;
}

/** New deletions first; the oldest beyond MAX_DELETED dropped. */
export function withDeletions(log: DeletedOp[], added: DeletedOp[]): DeletedOp[] {
  if (added.length === 0) return log;
  const known = new Set(log.map((d) => d.id));
  return [...added.filter((d) => !known.has(d.id)), ...log].slice(0, MAX_DELETED);
}

/** The ids each store holds now - a deletion whose record is back there is not shown. */
export interface LiveIds {
  ledger: ReadonlySet<string>;
  settlement: ReadonlySet<string>;
  adjustment: ReadonlySet<string>;
}

export function liveIdsOf(ledger: LedgerByAccount, settlements: RepSettlement[], adjustments: PartyAdjustment[]): LiveIds {
  return {
    ledger: new Set(Object.values(ledger).flatMap((list) => (Array.isArray(list) ? list.map((e) => e.id) : []))),
    settlement: new Set(settlements.map((s) => s.id)),
    adjustment: new Set(adjustments.map((a) => a.id)),
  };
}

/** Still deleted (its record not back in its store). */
export function stillDeleted(log: DeletedOp[], live: LiveIds): DeletedOp[] {
  return log.filter((d) => !live[d.store].has(d.record.id));
}

/** yyyy-mm-dd of the deletion, on this phone's clock. */
export function deletedDay(d: Pick<DeletedOp, "at">): string {
  const t = new Date(d.at);
  if (Number.isNaN(t.getTime())) return d.at.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** The deleted record's amount and currency. */
export function deletedAmount(d: DeletedOp): { amount: number; currency: string } {
  if (d.store === "ledger") return { amount: d.record.amount, currency: d.record.currency };
  return { amount: d.record.amount, currency: d.record.currencyCode };
}

/** «05/11» */
function shortDay(date: string): string {
  const [, m, day] = date.split("-");
  return m && day ? `${day}/${m}` : date;
}

/** What was deleted, in his words: «🗑️ حُذفت: 💵 دفعة - جهاز X (05/11)». `deviceName` for a ledger record. */
export function deletedText(d: DeletedOp, deviceName?: (accountId: string) => string | undefined, settlementWords?: (s: RepSettlement) => string): string {
  let what: string;
  if (d.store === "ledger") {
    const device = deviceName?.(d.accountId);
    what = `${d.record.kind === "debit" ? "📡 شحن" : "💵 دفعة"}${device ? ` - ${device}` : ""}`;
  } else if (d.store === "adjustment") {
    what = d.record.direction === "owesUs" ? "➕ رصيد عليه" : "➖ رصيد له";
  } else {
    what = settlementWords?.(d.record) ?? "عملية";
  }
  const note = d.record.note?.trim();
  return `🗑️ حُذفت: ${what} (${shortDay(d.record.date)})${note ? ` · ${note}` : ""}`;
}

/** ↩️ The record back into its store's value (unchanged when it is already there). Pure: returns the new values. */
export function restoreLedger(ledger: LedgerByAccount, d: Extract<DeletedOp, { store: "ledger" }>): LedgerByAccount {
  const list = ledger[d.accountId] ?? [];
  if (list.some((e) => e.id === d.record.id)) return ledger;
  return { ...ledger, [d.accountId]: [...list, d.record] };
}

export function restoreInList<T extends { id: string }>(list: T[], record: T): T[] {
  return list.some((r) => r.id === record.id) ? list : [...list, record];
}

// ---- the stored log ----

export function cleanDeletedOps(raw: unknown): DeletedOp[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is DeletedOp =>
      !!d &&
      typeof d === "object" &&
      typeof (d as DeletedOp).id === "string" &&
      typeof (d as DeletedOp).at === "string" &&
      ["ledger", "settlement", "adjustment"].includes((d as DeletedOp).store) &&
      !!(d as DeletedOp).record &&
      typeof (d as DeletedOp).record.id === "string" &&
      ((d as DeletedOp).store !== "ledger" || typeof (d as { accountId?: unknown }).accountId === "string"),
  );
}

export function loadDeletedOps(): DeletedOp[] {
  if (typeof window === "undefined") return [];
  try {
    return cleanDeletedOps(JSON.parse(window.localStorage.getItem(DELETED_OPS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveDeletedOps(log: DeletedOp[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DELETED_OPS_KEY, JSON.stringify(log));
  } catch {
    // full storage: the deletion itself still happened
  }
}

/** Called by the stores' saves: logs what this save removes. Never throws. */
export function noteDeletions(added: DeletedOp[]): void {
  if (added.length === 0) return;
  try {
    saveDeletedOps(withDeletions(loadDeletedOps(), added));
  } catch {
    // a log line never breaks a save
  }
}
