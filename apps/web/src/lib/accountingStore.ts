/**
 * Pure profit/loss and cash-flow calculations for the customer-ledger/accounting rework - reads
 * LedgerEntry records (ledgerStore.ts) but never mutates or persists anything itself. Every
 * function here is deterministic and side-effect free, so it is exhaustively unit-tested rather
 * than exercised through the UI.
 *
 * Three results are kept deliberately separate and never merged into one number (rule XIII):
 *  - accounting profit (computeShipmentProfit / totalProfitsUsd / totalLossesUsd / netResult):
 *    sale value in USD minus Starlink's settled cost in USD, regardless of whether the customer
 *    has actually paid yet.
 *  - cash actually collected, per currency (totalPaidByCustomer): what customers have actually
 *    paid, kept PER CURRENCY exactly as recorded (never converted/summed across currencies, per
 *    the ledger's own long-standing rule) - a customer's outstanding debt is never counted here.
 *  - cash actually collected, in USD (totalPaidByCustomerUsd / cashFlowUsd): the same payments,
 *    converted via each credit entry's own locked paymentRate (never today's rate), minus
 *    Starlink's settled cost in USD - rule XIII's own "التدفق النقدي الفعلي". When a non-USD
 *    payment is missing its paymentRate (see isIncompletePaymentRateEntry), it is excluded from
 *    both totals rather than guessed at - but that silent exclusion is always paired with
 *    hasIncompletePaymentRates so the UI never presents an undercounted cashFlowUsd as final.
 */

import {
  BalanceByCurrency,
  computeBalanceByCurrency,
  isIncompletePaymentRateEntry,
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
  /** profitUsd converted via the entry's own locked profitCurrencyRates (never today's registry
   * rate - see LedgerEntry.profitCurrencyRates). Present only when status is "computed" AND that
   * specific currency's rate was known at settlement time; absent (not zero) otherwise. */
  profitMru?: number;
  profitSifa?: number;
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

  const profitUsd = saleValueUsd - starlinkCostUsd;
  const rates = entry.profitCurrencyRates;
  return {
    status: "computed",
    saleValueUsd,
    starlinkCostUsd,
    profitUsd,
    profitMru: rates?.MRU !== undefined ? profitUsd * rates.MRU : undefined,
    profitSifa: rates?.SIFA !== undefined ? profitUsd * rates.SIFA : undefined,
  };
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
  /** USD-equivalent of totalPaidByCustomer - sums only credit entries with a resolvable USD value
   * (USD itself, or a locked paymentRate). A non-USD payment with no paymentRate (e.g. recorded
   * before this field existed) is simply excluded here, never guessed at with today's rate - its
   * full amount still shows in totalPaidByCustomer's own per-currency breakdown above. */
  totalPaidByCustomerUsd: number;
  /** Rule XIII's "التدفق النقدي الفعلي": totalPaidByCustomerUsd minus totalSettledStarlinkCostUsd.
   * Kept strictly separate from netResult (accounting profit) - customer debt is never counted
   * here, only what was actually collected. */
  cashFlowUsd: number;
  /** True when at least one of this device's credit entries is missing its paymentRate (see
   * isIncompletePaymentRateEntry) - i.e. a non-USD payment whose USD value is simply unknown.
   * totalPaidByCustomerUsd/cashFlowUsd are a known undercount in that case (that payment's USD
   * value is excluded, never guessed at), so the UI must show the incomplete-payments warning
   * instead of presenting cashFlowUsd as a final, complete result. */
  hasIncompletePaymentRates: boolean;
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
  let totalPaidByCustomerUsd = 0;
  let hasIncompletePaymentRates = false;
  for (const entry of entries) {
    if (entry.kind !== "credit") continue;
    totalPaidByCustomer[entry.currency] = (totalPaidByCustomer[entry.currency] ?? 0) + entry.amount;

    const paidUsd = entry.currency === "USD" ? entry.amount : entry.paymentRate?.usdValue;
    if (paidUsd !== undefined) totalPaidByCustomerUsd += paidUsd;
    if (isIncompletePaymentRateEntry(entry)) hasIncompletePaymentRates = true;
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
    totalPaidByCustomerUsd,
    cashFlowUsd: totalPaidByCustomerUsd - totalSettledStarlinkCostUsd,
    hasIncompletePaymentRates,
    totalRemainingDebt,
  };
}

/**
 * Sum of Starlink's own cost in USD for "D" (pending, unsettled) shipments that already have a
 * recorded amount/currency - money the operator knows is owed to Starlink but hasn't paid yet. A
 * true "D" with nothing recorded at all (no amount/currency chosen yet) contributes nothing here,
 * same reasoning as computeShipmentProfit's own "pending" status - never guessed at.
 */
export function computePendingStarlinkCostUsd(entries: LedgerEntry[]): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.kind !== "debit" || isLegacyShipmentEntry(entry)) continue;
    const cost = entry.starlinkCost!;
    if (cost.status !== "pending" || cost.currencyCode === undefined || cost.amount === undefined) continue;
    const usd = resolveUsdValue(cost.amount, cost.currencyCode, cost.rate);
    if (usd !== undefined) total += usd;
  }
  return total;
}

export interface ClientDeviceSummary {
  accountId: string;
  accountName: string;
  /** This device's own debit-minus-credit balance, per currency - identical convention to
   * computeBalanceByCurrency (positive = owed, negative = in credit). */
  balances: BalanceByCurrency;
  accounting: DeviceAccountingSummary;
}

export interface ClientAccountingSummary {
  /** One entry per device linked to this client - never merged with each other (rule XII: "لا
   * تخلط بين أجهزة العميل المختلفة"). */
  devices: ClientDeviceSummary[];
  /** Sum of every device's positive (owed) balance, per currency. */
  totalDebt: BalanceByCurrency;
  /** Sum of every device's totalPaidByCustomer, per currency - never converted/mixed. */
  totalPaid: BalanceByCurrency;
  /** Sum of every device's totalPaidByCustomerUsd. */
  totalPaidUsd: number;
  /** Sum of every device's cashFlowUsd - rule XIII's cash-actually-collected, kept separate from
   * netResult (accounting profit) at the client level too. */
  cashFlowUsd: number;
  /** True when any linked device has hasIncompletePaymentRates - see that field. totalPaidUsd/
   * cashFlowUsd are a known undercount across the whole client in that case. */
  hasIncompletePaymentRates: boolean;
  /** Sum of netUsd across every device that has one - "incomplete" if any device's own result is
   * incomplete, "no-data" only when no device has any shipments at all. */
  netResult: DeviceNetResult;
}

/**
 * The client-level rollup (rule XII) - "لكن اعرض مجموعها في ملخص العميل": every number here is a
 * straightforward per-currency/per-device sum of numbers already computed independently by
 * computeDeviceAccountingSummary, never a recomputation that could let one device's data leak
 * into another's.
 */
export function computeClientAccountingSummary(
  devices: { accountId: string; accountName: string; entries: LedgerEntry[] }[],
): ClientAccountingSummary {
  const deviceSummaries: ClientDeviceSummary[] = devices.map((device) => ({
    accountId: device.accountId,
    accountName: device.accountName,
    balances: computeBalanceByCurrency(device.entries),
    accounting: computeDeviceAccountingSummary(device.entries),
  }));

  const totalDebt: BalanceByCurrency = {};
  const totalPaid: BalanceByCurrency = {};
  let totalPaidUsd = 0;
  let cashFlowUsd = 0;
  let hasIncompletePaymentRates = false;
  let anyIncomplete = false;
  let anyComputed = false;
  let netUsdSum = 0;

  for (const device of deviceSummaries) {
    for (const currency of LEDGER_CURRENCIES) {
      const balance = device.balances[currency];
      if (balance !== undefined && balance > 0) totalDebt[currency] = (totalDebt[currency] ?? 0) + balance;

      const paid = device.accounting.totalPaidByCustomer[currency];
      if (paid !== undefined) totalPaid[currency] = (totalPaid[currency] ?? 0) + paid;
    }

    totalPaidUsd += device.accounting.totalPaidByCustomerUsd;
    cashFlowUsd += device.accounting.cashFlowUsd;
    if (device.accounting.hasIncompletePaymentRates) hasIncompletePaymentRates = true;

    if (device.accounting.netResult.status === "incomplete") anyIncomplete = true;
    if (device.accounting.netResult.netUsd !== undefined) {
      anyComputed = true;
      netUsdSum += device.accounting.netResult.netUsd;
    }
  }

  const netResult: DeviceNetResult = !anyComputed
    ? { status: anyIncomplete ? "incomplete" : "no-data" }
    : { status: anyIncomplete ? "incomplete" : "complete", netUsd: netUsdSum };

  return { devices: deviceSummaries, totalDebt, totalPaid, totalPaidUsd, cashFlowUsd, hasIncompletePaymentRates, netResult };
}
