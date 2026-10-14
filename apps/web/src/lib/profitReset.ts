/**
 * "بداية جديدة للأرباح" (الإعدادات): the operator starts counting profit from zero on a day.
 * Nothing is deleted - shipments, client balances and settlements stay exactly as they are - the
 * reports simply count only profit that became real (Starlink paid) after that point. The
 * representatives are never touched (Oct 12 2026); undoing an older one that did restart them still
 * restores each representative's previous reset.
 */

import { shipmentProfitMoment } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";
import { isAfterRepReset, makeRepResetPoint } from "./repAccount";
import { RepresentativeStore, RepResetPoint, setRepresentativeReset } from "./repStore";

export interface ProfitReset extends RepResetPoint {
  /** Each representative's reset before this one (null = none), restored on undo. */
  previousRepResets: Record<string, RepResetPoint | null>;
  createdAt: string;
}

const KEY = "starnet_profit_reset_v1";

export function loadProfitReset(): ProfitReset | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfitReset;
    return parsed && typeof parsed.date === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProfitReset(reset: ProfitReset | null): void {
  if (typeof window === "undefined") return;
  if (reset) window.localStorage.setItem(KEY, JSON.stringify(reset));
  else window.localStorage.removeItem(KEY);
}

/** Drops shipments whose profit became real (Starlink paid) before the fresh start. A still-open
 * D stays - its profit will land after it. */
export function entriesAfterProfitReset(entries: LedgerEntry[], reset: RepResetPoint | null): LedgerEntry[] {
  if (!reset) return entries;
  return entries.filter(
    (e) => e.kind !== "debit" || e.starlinkCost?.status !== "settled" || isAfterRepReset(reset, shipmentProfitMoment(e)),
  );
}

/** Starts profit from zero today - the reports only. The representatives are never touched (his
 * Oct 12 2026 rule «لا يمس من المندوب ابدا ولا علاقة له بالأجهزة»): their accounts, devices and open
 * D's stay exactly as they are; a rep's own «تصفير» is on the representatives page. */
export function startProfitFresh(repStore: RepresentativeStore, now: Date = new Date()): { reset: ProfitReset; repStore: RepresentativeStore } {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const point = makeRepResetPoint(today, now);
  return { reset: { ...point, previousRepResets: {}, createdAt: now.toISOString() }, repStore };
}

/** Brings the old profit back: representatives get their previous reset (or none) again. */
export function undoProfitFresh(reset: ProfitReset, repStore: RepresentativeStore): RepresentativeStore {
  let next = repStore;
  for (const [repId, previous] of Object.entries(reset.previousRepResets)) {
    if (next[repId]) next = setRepresentativeReset(next, repId, previous ?? undefined);
  }
  return next;
}
