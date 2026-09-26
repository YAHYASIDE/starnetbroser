/**
 * "متعطل/محترق": a broken device leaves the renewal reminders and shows in its own list. When the
 * operator chooses not to pay Starlink for it, each open D on it is dropped: its cost is recorded
 * as settled at 0 on the day the fault is recorded (profit rates locked that day), so the whole
 * sale becomes profit on that day - the rep's share included - while the customer's own debt is
 * untouched. Repairing the device restores those D's exactly as they were, to be paid normally.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";

export function isFaulty(account: StarlinkAccountSummary): boolean {
  return Boolean(account.deviceFault);
}

/** Shipments still owing Starlink a real amount. */
export function openDebtEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((e) => e.kind === "debit" && e.starlinkCost?.status === "pending" && (e.starlinkCost.amount ?? 0) > 0);
}

export function isWaivedCost(entry: LedgerEntry): boolean {
  return Boolean(entry.starlinkCost?.waived);
}

/** Drops every open D on the device: cost settled at 0 on `date`, the original kept for a repair. */
export function waiveOpenDebts(
  entries: LedgerEntry[],
  date: string,
  profitRates: { MRU?: number; SIFA?: number },
  now: Date = new Date(),
): { entries: LedgerEntry[]; count: number } {
  let count = 0;
  const next = entries.map((entry) => {
    if (!openDebtEntries([entry]).length) return entry;
    const cost = entry.starlinkCost!;
    count += 1;
    return {
      ...entry,
      starlinkCost: {
        ...cost,
        status: "settled" as const,
        // 0 is 0 in any currency - recorded in USD so no old rate snapshot (still carrying the
        // original USD value) is ever read.
        currencyCode: "USD",
        amount: 0,
        rate: undefined,
        paidAt: date,
        paidVia: undefined,
        settledAt: now.toISOString(),
        waived: { currencyCode: cost.currencyCode, amount: cost.amount, rate: cost.rate, at: date },
      },
      profitCurrencyRates: profitRates,
    };
  });
  return { entries: next, count };
}

/** The device was repaired: every dropped D is owed to Starlink again, as it was. */
export function restoreWaivedDebts(entries: LedgerEntry[]): { entries: LedgerEntry[]; count: number } {
  let count = 0;
  const next = entries.map((entry) => {
    const cost = entry.starlinkCost;
    if (entry.kind !== "debit" || !cost?.waived) return entry;
    count += 1;
    const { waived, paidAt: _paidAt, paidVia: _paidVia, settledAt: _settledAt, ...rest } = cost;
    return {
      ...entry,
      starlinkCost: { ...rest, status: "pending" as const, currencyCode: waived.currencyCode, amount: waived.amount, rate: waived.rate },
      profitCurrencyRates: undefined,
    };
  });
  return { entries: next, count };
}
