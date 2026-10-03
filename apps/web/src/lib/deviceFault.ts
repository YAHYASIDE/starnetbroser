/**
 * "متعطل/محترق": a broken device leaves the renewal reminders and shows in its own list. When the
 * operator chooses not to pay Starlink for it, each open D on it is dropped: its cost is recorded
 * as settled at 0 on the day the fault is recorded (profit rates locked that day), so the whole
 * sale becomes profit on that day - the rep's share included - while the customer's own debt is
 * untouched. Repairing the device restores those D's exactly as they were, to be paid normally.
 */

import type { DeviceFaultReason, StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";

/** The «المعطلة» groups, in the order they're shown. */
export const FAULT_CATEGORIES: { reason: DeviceFaultReason; label: string; icon: string }[] = [
  { reason: "canceled", label: "ملغي اشتراك", icon: "🚫" },
  { reason: "burned", label: "محروق", icon: "🔥" },
  { reason: "moved", label: "منقول", icon: "🔀" },
  { reason: "secondary", label: "إيميل غير رئيسي", icon: "👤" },
  { reason: "other", label: "عطل آخر", icon: "🔧" },
];

export function faultLabel(reason: DeviceFaultReason): string {
  const category = FAULT_CATEGORIES.find((c) => c.reason === reason);
  return category ? `${category.icon} ${category.label}` : "🔧 عطل";
}

type FaultInput = Pick<StarlinkAccountSummary, "deviceFault" | "noSubscription" | "serviceStatus" | "limitedAccess">;

/** Where the device belongs in «المعطلة», or null. A reason the operator chose always wins;
 * otherwise Starlink tells: no subscription on the email / a canceled service -> ملغي اشتراك,
 * an email without the full menu (no subscriptions / settings / billing) -> إيميل غير رئيسي. */
export function faultCategory(account: FaultInput): DeviceFaultReason | null {
  if (account.deviceFault) return account.deviceFault.reason;
  if (account.noSubscription === true || account.serviceStatus === "canceled") return "canceled";
  if (account.limitedAccess === true) return "secondary";
  return null;
}

/** Found by the app itself (not marked by hand). */
export function isAutoFault(account: FaultInput): boolean {
  return !account.deviceFault && faultCategory(account) !== null;
}

export function isFaulty(account: FaultInput): boolean {
  return faultCategory(account) !== null;
}

/** 🛠️ Being fixed with Starlink support (its own list beside «المعطلة»). */
export function isUnderRepair(account: Pick<StarlinkAccountSummary, "underRepair">): boolean {
  return Boolean(account.underRepair);
}

/** How many devices in each group (every group present, 0 when empty). */
export function countFaultCategories(accounts: FaultInput[]): Record<DeviceFaultReason, number> {
  const counts: Record<DeviceFaultReason, number> = { canceled: 0, burned: 0, moved: 0, secondary: 0, other: 0 };
  for (const account of accounts) {
    const category = faultCategory(account);
    if (category) counts[category] += 1;
  }
  return counts;
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
