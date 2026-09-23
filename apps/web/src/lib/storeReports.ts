/**
 * أرباح المتجر: sales, cost of goods sold, and net profit for the store's own retail business -
 * entirely separate from accountingStore.ts's Starlink shipment profit, a different business.
 * Deliberately approximate in the same spirit as storeStore.ts's computeInventoryValueByCurrency:
 * a weighted-average purchase cost per item (no FIFO/lot tracking), and never mixed across
 * currencies - a sale in a currency with no matching-currency cost data just contributes an
 * "unknown" cost rather than a wrong number from a guessed conversion.
 */

import { StoreTransactionList } from "./storeStore";
import { Invoice, InvoiceList, invoiceTotal } from "./invoiceStore";

/** Weighted-average cost per unit for one item, from every "buy" transaction ever recorded for
 * it - EXCLUDING a buy that was actually a sale-return (its unitPrice is the sale price the
 * customer was charged, not what the item cost us, which would corrupt the average). Undefined
 * when the item has no real purchase history yet. */
export function computeAveragePurchaseCost(
  transactions: StoreTransactionList,
  invoices: InvoiceList,
  itemId: string,
): number | undefined {
  const saleReturnInvoiceIds = new Set(
    invoices.filter((inv) => inv.kind === "sale" && inv.returnOfInvoiceId !== undefined).map((inv) => inv.id),
  );
  const realBuys = transactions.filter(
    (t) => t.itemId === itemId && t.kind === "buy" && !(t.invoiceId && saleReturnInvoiceIds.has(t.invoiceId)),
  );
  const totalQty = realBuys.reduce((sum, t) => sum + t.quantity, 0);
  if (totalQty === 0) return undefined;
  const totalValue = realBuys.reduce((sum, t) => sum + t.quantity * t.unitPrice, 0);
  return totalValue / totalQty;
}

export interface StoreSalesSummary {
  /** Net sales value per currency - a return in the same set subtracts its own total. */
  salesByCurrency: Record<string, number>;
  /** Estimated cost of the goods behind those sales, per currency - only ever added when the
   * item's average cost is known AND in the same currency as the sale, per the module's own
   * "never mix currencies" rule. */
  cogsByCurrency: Record<string, number>;
}

/** Builds a sales+COGS summary from a caller-supplied set of sale-kind invoices (both normal
 * sales and any returns among them, e.g. everything dated within one period) - the caller decides
 * the period/filter, this function only does the money math. */
export function computeStoreSalesSummary(
  transactions: StoreTransactionList,
  invoices: InvoiceList,
  periodSaleInvoices: Invoice[],
): StoreSalesSummary {
  const salesByCurrency: Record<string, number> = {};
  const cogsByCurrency: Record<string, number> = {};

  for (const inv of periodSaleInvoices) {
    if (inv.kind !== "sale") continue;
    const sign = inv.returnOfInvoiceId ? -1 : 1;
    salesByCurrency[inv.currencyCode] = (salesByCurrency[inv.currencyCode] ?? 0) + sign * invoiceTotal(inv);

    for (const line of inv.lines) {
      const avgCost = computeAveragePurchaseCost(transactions, invoices, line.itemId);
      if (avgCost === undefined) continue;
      cogsByCurrency[inv.currencyCode] = (cogsByCurrency[inv.currencyCode] ?? 0) + sign * line.quantity * avgCost;
    }
  }

  return { salesByCurrency, cogsByCurrency };
}

/** Total value of every sale invoice still (fully or partially) unpaid, grouped by currency - the
 * store's own total receivables. Mirrors computeSupplierStoreBalance's payables in spirit, but
 * across every client at once for a report tile rather than one person's own statement. */
export function computeTotalReceivablesByCurrency(invoices: InvoiceList): Record<string, number> {
  const result: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.kind !== "sale" || inv.returnOfInvoiceId) continue;
    const due = invoiceTotal(inv) - inv.paidAmount;
    if (due <= 0.0001) continue;
    result[inv.currencyCode] = (result[inv.currencyCode] ?? 0) + due;
  }
  return result;
}

/** The mirror of computeTotalReceivablesByCurrency for purchases - total still owed to every
 * supplier at once. */
export function computeTotalPayablesByCurrency(invoices: InvoiceList): Record<string, number> {
  const result: Record<string, number> = {};
  for (const inv of invoices) {
    if (inv.kind !== "purchase" || inv.returnOfInvoiceId) continue;
    const due = invoiceTotal(inv) - inv.paidAmount;
    if (due <= 0.0001) continue;
    result[inv.currencyCode] = (result[inv.currencyCode] ?? 0) + due;
  }
  return result;
}
