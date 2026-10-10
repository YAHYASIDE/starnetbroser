/**
 * ↩️ A D marked paid in the app while Starlink still asks for it (his Oct 10 2026 report: «زبون أو
 * اثنين كانت عليهم D… بعد أيام راحت عنهم D وصار دين فقط»). Pressing «🔄 تجديد» on a device with a D
 * used to mean «paid Starlink today», so a new month's renewal silently settled the old D; Starlink's
 * bill stayed due and the card showed «فرق غير مسجّل» (where «دين D عادي» would charge the customer a
 * second time). When a Starlink read taken AFTER the settlement still shows a gap equal to recently
 * settled D's, they are offered back («↩️ أرجع D»: pending again, nothing new on the customer). Pure.
 */

import { starlinkCostUsd } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";

/** Settlements older than this aren't questioned. */
const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;

export interface StillDueInput {
  /** What Starlink asks beyond everything recorded as unpaid (USD). */
  gapUsd: number;
  /** The bill's currency and today's rate - a D in that currency counts at today's rate. */
  billCurrency: string;
  billRateFromUsd?: number;
  /** When Starlink's balance was last read (ISO). */
  lastScanAt?: string | null;
  now?: Date;
}

/** The D's to give back (newest first), or [] when the gap isn't them. */
export function settledButStillDue(entries: LedgerEntry[], input: StillDueInput): LedgerEntry[] {
  const scan = input.lastScanAt ? Date.parse(input.lastScanAt) : NaN;
  if (!(input.gapUsd > 0) || !Number.isFinite(scan)) return [];
  const now = (input.now ?? new Date()).getTime();
  const bill = input.billCurrency.trim().toUpperCase();
  const candidates = entries
    .filter((e) => {
      const cost = e.starlinkCost;
      if (e.kind !== "debit" || cost?.status !== "settled" || cost.waived || e.previousDebtId || !cost.settledAt) return false;
      const at = Date.parse(cost.settledAt);
      return Number.isFinite(at) && at < scan && now - at <= LOOKBACK_MS && (cost.amount ?? 0) > 0;
    })
    .sort((a, b) => (a.starlinkCost!.settledAt! < b.starlinkCost!.settledAt! ? 1 : -1));
  const todayUsd = (e: LedgerEntry) => {
    const cost = e.starlinkCost!;
    const same = (cost.currencyCode ?? "").toUpperCase() === bill && bill !== "USD";
    if (same && input.billRateFromUsd && input.billRateFromUsd > 0) return (cost.amount ?? 0) / input.billRateFromUsd;
    return starlinkCostUsd(e) ?? 0;
  };
  const tolerance = Math.max(2, input.gapUsd * 0.05);
  let sum = 0;
  for (let i = 0; i < candidates.length; i++) {
    sum += todayUsd(candidates[i]!);
    if (Math.abs(sum - input.gapUsd) <= tolerance) return candidates.slice(0, i + 1);
    if (sum > input.gapUsd + tolerance) break;
  }
  return [];
}
