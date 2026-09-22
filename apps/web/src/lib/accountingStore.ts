/**
 * Pure profit/loss and cash-flow calculations for the customer-ledger/accounting rework - reads
 * LedgerEntry records (ledgerStore.ts) but never mutates or persists anything itself. Every
 * function here is deterministic and side-effect free, so it is exhaustively unit-tested rather
 * than exercised through the UI.
 *
 * Two results are kept deliberately separate and never merged into one number:
 *  - accounting profit (computeShipmentProfit / totalProfitsUsd / totalLossesUsd / netResult):
 *    sale value in USD minus Starlink's settled cost in USD, regardless of whether the customer
 *    has actually paid yet.
 *  - cash actually collected (totalPaidByCustomer): what customers have actually paid, kept PER
 *    CURRENCY exactly as recorded (never converted/summed across currencies, per the ledger's own
 *    long-standing rule) - a customer's outstanding debt is never counted here.
 */

import {
  BalanceByCurrency,
  computeBalanceByCurrency,
  isLegacyShipmentEntry,
  LEDGER_CURRENCIES,
  LedgerEntry,
  RateSnapshot,
} from "./ledgerStore";

/** Resolves an amount recorded in `currencyCode` to USD: exact for USD itself, otherwise only via
 * a locked rate snapshot - never guessed at with an assumed rate of 1. undefined means the data is
 * incomplete (a non-USD amount with no snapshot), never a silently wrong number. */
function resolveUsdValue(amount: number, currencyCode: string, rate?: RateSnapshot): number | undefined {
  if (currencyCode === "USD") return amount;
  return rate?.usdValue;
}

export type ShipmentProfitStatus = "legacy" | "pending" | "computed";

export interface ShipmentProfit {
  status: ShipmentProfitStatus;
  /** Only set when status is "computed". */
  saleValueUsd?: number;
  starlinkCostUsd?: number;
  /** saleValueUsd - starlinkCostUsd. Only set when status is "computed". */
  profitUsd?: number;
}

/**
 * Per rule IX: profit is only ever computed once Starlink's cost for a shipment has actually been
 * settled - never estimated beforehand. Three distinct outcomes:
 *  - "legacy": a debit entry with no starlinkCost info at all (see isLegacyShipmentEntry) -
 *    predates this feature, profit can never be computed for it.
 *  - "pending": marked D (or missing a resolvable USD value on either side) - awaiting settlement.
 *  - "computed": both sides resolved to USD - profitUsd is the real number.
 * Not a debit entry at all (a "credit"/payment) is always "legacy" here too, since it isn't a
 * shipment and has nothing to compute a profit for.
 */
export function computeShipmentProfit(entry: LedgerEntry): ShipmentProfit {
  if (entry.kind !== "debit" || isLegacyShipmentEntry(entry)) return { status: "legacy" };

  const cost = entry.starlinkCost!;
  if (cost.status !== "settled" || cost.currencyCode === undefined || cost.amount === undefined) {
    return { status: "pending" };
  }

  const saleValueUsd = entry.currency === "USD" ? entry.amount : entry.saleRate?.usdValue;
  const starlinkCostUsd = resolveUsdValue(cost.amount, cost.currencyCode, cost.rate);
  if (saleValueUsd === undefined || starlinkCostUsd === undefined) return { status: "pending" };

  return { status: "computed", saleValueUsd, starlinkCostUsd, profitUsd: saleValueUsd - starlinkCostUsd };
}

export interface DeviceNetResult {
  /** "no-data": no shipments at all. "incomplete": at least one unsettled D shipment exists - netUsd
   * (when present) covers only the settled subset, per rule XI ("النتيجة للعمليات المُسددة فقط").
   * "complete": every shipment is either settled or legacy-excluded, netUsd covers all of them. */
  status: "no-data" | "incomplete" | "complete";
  /** Sum of profitUsd across every "computed" shipment. Absent when there is nothing computed yet. */
  netUsd?: number;
}

export interface DeviceAccountingSummary {
  shipmentCount: number;
  settledShipmentCount: number;
  /** Unsettled "D" shipments - see StarlinkCost. */
  pendingShipmentCount: number;
  /** Debit entries with no starlinkCost info at all (predate this feature). */
  legacyShipmentCount: number;
  /** Sum of every shipment's sale value converted to USD, regardless of Starlink-cost settlement -
   * "قيمة المبيعات" is a property of the sale itself, not of whether it has been costed yet. */
  totalSaleValueUsd: number;
  /** Sum of Starlink's cost in USD, only across settled shipments - nothing else has a cost yet. */
  totalSettledStarlinkCostUsd: number;
  /** Sum of positive profitUsd across "computed" shipments. */
  totalProfitsUsd: number;
  /** Sum of |negative profitUsd| across "computed" shipments, as a positive number. */
  totalLossesUsd: number;
  netResult: DeviceNetResult;
  /** What customers have actually paid (credit entries), summed per currency exactly as recorded -
   * never converted to USD or mixed across currencies. */
  totalPaidByCustomer: BalanceByCurrency;
  /** What customers still owe, per currency - only the positive (owed) balances, same convention
   * as ledgerStore.ts#totalOwedAcrossAccounts but scoped to one device's own entries. */
  totalRemainingDebt: BalanceByCurrency;
}

function computeNetResult(profits: ShipmentProfit[], pendingCount: number): DeviceNetResult {
  const computed = profits.filter((p) => p.status === "computed");
  if (computed.length === 0) {
    return { status: pendingCount > 0 ? "incomplete" : "no-data" };
  }
  const netUsd = computed.reduce((sum, p) => sum + p.profitUsd!, 0);
  return { status: pendingCount > 0 ? "incomplete" : "complete", netUsd };
}

/** The full accounting picture for one device's ledger entries (see LedgerByAccount - a device IS
 * an account in this store, keyed the same way). Never mutates its input. */
export function computeDeviceAccountingSummary(entries: LedgerEntry[]): DeviceAccountingSummary {
  const debitEntries = entries.filter((e) => e.kind === "debit");
  const profits = debitEntries.map(computeShipmentProfit);

  const legacyShipmentCount = profits.filter((p) => p.status === "legacy").length;
  const pendingShipmentCount = profits.filter((p) => p.status === "pending").length;
  const settledShipmentCount = profits.filter((p) => p.status === "computed").length;

  let totalSaleValueUsd = 0;
  for (const entry of debitEntries) {
    const saleValueUsd = entry.currency === "USD" ? entry.amount : entry.saleRate?.usdValue;
    if (saleValueUsd !== undefined) totalSaleValueUsd += saleValueUsd;
  }

  let totalSettledStarlinkCostUsd = 0;
  let totalProfitsUsd = 0;
  let totalLossesUsd = 0;
  for (const profit of profits) {
    if (profit.status !== "computed") continue;
    totalSettledStarlinkCostUsd += profit.starlinkCostUsd!;
    if (profit.profitUsd! >= 0) totalProfitsUsd += profit.profitUsd!;
    else totalLossesUsd += -profit.profitUsd!;
  }

  const balances = computeBalanceByCurrency(entries);
  const totalRemainingDebt: BalanceByCurrency = {};
  for (const currency of LEDGER_CURRENCIES) {
    const balance = balances[currency];
    if (balance !== undefined && balance > 0) totalRemainingDebt[currency] = balance;
  }

  const totalPaidByCustomer: BalanceByCurrency = {};
  for (const entry of entries) {
    if (entry.kind !== "credit") continue;
    totalPaidByCustomer[entry.currency] = (totalPaidByCustomer[entry.currency] ?? 0) + entry.amount;
  }

  return {
    shipmentCount: debitEntries.length,
    settledShipmentCount,
    pendingShipmentCount,
    legacyShipmentCount,
    totalSaleValueUsd,
    totalSettledStarlinkCostUsd,
    totalProfitsUsd,
    totalLossesUsd,
    netResult: computeNetResult(profits, pendingShipmentCount),
    totalPaidByCustomer,
    totalRemainingDebt,
  };
}
