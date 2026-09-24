import { describe, expect, it } from "vitest";
import {
  computeAveragePurchaseCost,
  computeClientSalesTotals,
  computeItemSalesTotals,
  computeStoreSalesSummary,
  computeTotalPayablesByCurrency,
  computeTotalReceivablesByCurrency,
  largestCurrencyValue,
} from "./storeReports";
import { Invoice, InvoiceList } from "./invoiceStore";
import { StoreTransactionList } from "./storeStore";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    kind: "sale",
    date: "2026-09-20",
    currencyCode: "MRU",
    lines: [{ itemId: "a", quantity: 2, unitPrice: 100, transactionId: "t1" }],
    discount: 0,
    paidAmount: 0,
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeAveragePurchaseCost", () => {
  it("is undefined when the item has no buy history", () => {
    expect(computeAveragePurchaseCost([], [], "a")).toBeUndefined();
  });

  it("computes a weighted average across multiple buys", () => {
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 100, currencyCode: "MRU", date: "2026-09-01", createdAt: "t1" },
      { id: "2", itemId: "a", kind: "buy", quantity: 10, unitPrice: 200, currencyCode: "MRU", date: "2026-09-05", createdAt: "t2" },
    ];
    // (10*100 + 10*200) / 20 = 150
    expect(computeAveragePurchaseCost(transactions, [], "a")).toBe(150);
  });

  it("excludes a sale-return's 'buy' transaction from the average (its price is a sale price, not a cost)", () => {
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 100, currencyCode: "MRU", date: "2026-09-01", createdAt: "t1" },
      // this "buy" came from a sale return at the (much higher) sale price - must be excluded
      { id: "2", itemId: "a", kind: "buy", quantity: 5, unitPrice: 500, currencyCode: "MRU", date: "2026-09-10", createdAt: "t2", invoiceId: "ret1" },
    ];
    const invoices: InvoiceList = [invoice({ id: "ret1", returnOfInvoiceId: "orig" })];
    expect(computeAveragePurchaseCost(transactions, invoices, "a")).toBe(100);
  });

  it("includes a real buy transaction even if it happens to carry an invoiceId (a purchase invoice line)", () => {
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 100, currencyCode: "MRU", date: "2026-09-01", createdAt: "t1", invoiceId: "purch1" },
    ];
    const invoices: InvoiceList = [invoice({ id: "purch1", kind: "purchase" })];
    expect(computeAveragePurchaseCost(transactions, invoices, "a")).toBe(100);
  });

  it("ignores sell transactions entirely", () => {
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 100, currencyCode: "MRU", date: "2026-09-01", createdAt: "t1" },
      { id: "2", itemId: "a", kind: "sell", quantity: 3, unitPrice: 999, currencyCode: "MRU", date: "2026-09-05", createdAt: "t2" },
    ];
    expect(computeAveragePurchaseCost(transactions, [], "a")).toBe(100);
  });
});

describe("computeStoreSalesSummary", () => {
  const transactions: StoreTransactionList = [
    { id: "1", itemId: "a", kind: "buy", quantity: 100, unitPrice: 60, currencyCode: "MRU", date: "2026-09-01", createdAt: "t1" },
  ];

  it("sums sale totals and estimated COGS for the given invoices", () => {
    const sale = invoice({ lines: [{ itemId: "a", quantity: 5, unitPrice: 100, transactionId: "t9" }] });
    const summary = computeStoreSalesSummary(transactions, [sale], [sale]);
    expect(summary.salesByCurrency).toEqual({ MRU: 500 });
    expect(summary.cogsByCurrency).toEqual({ MRU: 300 }); // 5 * 60
  });

  it("subtracts a return's sale value and cost from the totals", () => {
    const sale = invoice({ id: "s1", lines: [{ itemId: "a", quantity: 5, unitPrice: 100, transactionId: "t9" }] });
    const ret = invoice({ id: "r1", returnOfInvoiceId: "s1", lines: [{ itemId: "a", quantity: 2, unitPrice: 100, transactionId: "t10" }] });
    const summary = computeStoreSalesSummary(transactions, [sale, ret], [sale, ret]);
    expect(summary.salesByCurrency).toEqual({ MRU: 300 }); // 500 - 200
    expect(summary.cogsByCurrency).toEqual({ MRU: 180 }); // 300 - 120
  });

  it("skips COGS for an item with no purchase history, without dropping the sale itself", () => {
    const sale = invoice({ lines: [{ itemId: "unknown-item", quantity: 5, unitPrice: 100, transactionId: "t9" }] });
    const summary = computeStoreSalesSummary(transactions, [sale], [sale]);
    expect(summary.salesByCurrency).toEqual({ MRU: 500 });
    expect(summary.cogsByCurrency).toEqual({});
  });

  it("ignores a purchase invoice even if accidentally passed in", () => {
    const purchase = invoice({ kind: "purchase" });
    const summary = computeStoreSalesSummary(transactions, [purchase], [purchase]);
    expect(summary.salesByCurrency).toEqual({});
  });

  it("sums each line's shippingCharge/shippingCost separately - already folded into sales, but broken out for a shipping-only profit figure", () => {
    const sale = invoice({
      lines: [{ itemId: "a", quantity: 5, unitPrice: 100, shippingCost: 40, shippingCharge: 60, transactionId: "t9" }],
    });
    const summary = computeStoreSalesSummary(transactions, [sale], [sale]);
    expect(summary.salesByCurrency).toEqual({ MRU: 560 }); // 500 (item) + 60 (shipping charge)
    expect(summary.shippingChargeByCurrency).toEqual({ MRU: 60 });
    expect(summary.shippingCostByCurrency).toEqual({ MRU: 40 });
  });

  it("subtracts a return's shipping figures too", () => {
    const sale = invoice({
      id: "s1",
      lines: [{ itemId: "a", quantity: 5, unitPrice: 100, shippingCost: 40, shippingCharge: 60, transactionId: "t9" }],
    });
    const ret = invoice({
      id: "r1",
      returnOfInvoiceId: "s1",
      lines: [{ itemId: "a", quantity: 2, unitPrice: 100, shippingCost: 40, shippingCharge: 60, transactionId: "t10" }],
    });
    const summary = computeStoreSalesSummary(transactions, [sale, ret], [sale, ret]);
    expect(summary.shippingChargeByCurrency).toEqual({ MRU: 0 });
    expect(summary.shippingCostByCurrency).toEqual({ MRU: 0 });
  });

  it("leaves shipping totals empty when no line ever had shipping", () => {
    const sale = invoice({ lines: [{ itemId: "a", quantity: 5, unitPrice: 100, transactionId: "t9" }] });
    const summary = computeStoreSalesSummary(transactions, [sale], [sale]);
    expect(summary.shippingChargeByCurrency).toEqual({});
    expect(summary.shippingCostByCurrency).toEqual({});
  });
});

describe("computeTotalReceivablesByCurrency / computeTotalPayablesByCurrency", () => {
  it("sums unpaid balances of sale invoices only, grouped by currency", () => {
    const invoices: InvoiceList = [
      invoice({ id: "1", currencyCode: "MRU", paidAmount: 0 }), // due 200
      invoice({ id: "2", currencyCode: "USD", lines: [{ itemId: "a", quantity: 1, unitPrice: 50, transactionId: "t1" }], paidAmount: 20 }), // due 30
      invoice({ id: "3", currencyCode: "MRU", paidAmount: 200 }), // fully paid, excluded
      invoice({ id: "4", kind: "purchase" }), // not a sale, excluded
    ];
    expect(computeTotalReceivablesByCurrency(invoices)).toEqual({ MRU: 200, USD: 30 });
  });

  it("sums unpaid balances of purchase invoices only, grouped by currency", () => {
    const invoices: InvoiceList = [
      invoice({ id: "1", kind: "purchase", currencyCode: "MRU", paidAmount: 50 }), // due 150
      invoice({ id: "2", kind: "sale", currencyCode: "MRU" }), // not a purchase, excluded
    ];
    expect(computeTotalPayablesByCurrency(invoices)).toEqual({ MRU: 150 });
  });

  it("excludes a return invoice from either total", () => {
    const invoices: InvoiceList = [invoice({ id: "1", returnOfInvoiceId: "orig", paidAmount: 0 })];
    expect(computeTotalReceivablesByCurrency(invoices)).toEqual({});
  });
});

describe("computeClientSalesTotals", () => {
  it("sums each client's own sale total, grouped by currency", () => {
    const invoices = [
      invoice({ id: "1", clientId: "c1", currencyCode: "MRU" }), // total 200
      invoice({ id: "2", clientId: "c1", currencyCode: "MRU", lines: [{ itemId: "a", quantity: 1, unitPrice: 50, transactionId: "t9" }] }), // total 50
      invoice({ id: "3", clientId: "c2", currencyCode: "MRU" }), // total 200, different client
    ];
    const totals = computeClientSalesTotals(invoices);
    const c1 = totals.find((t) => t.clientId === "c1");
    const c2 = totals.find((t) => t.clientId === "c2");
    expect(c1?.totalByCurrency).toEqual({ MRU: 250 });
    expect(c2?.totalByCurrency).toEqual({ MRU: 200 });
  });

  it("buckets an invoice with no linked client under clientId undefined, never dropping it", () => {
    const totals = computeClientSalesTotals([invoice({ id: "1", clientId: undefined })]);
    expect(totals).toHaveLength(1);
    expect(totals[0]!.clientId).toBeUndefined();
    expect(totals[0]!.totalByCurrency).toEqual({ MRU: 200 });
  });

  it("subtracts a return's value from its client's total", () => {
    const invoices = [
      invoice({ id: "orig", clientId: "c1", currencyCode: "MRU" }), // total 200
      invoice({ id: "ret", clientId: "c1", currencyCode: "MRU", returnOfInvoiceId: "orig", lines: [{ itemId: "a", quantity: 1, unitPrice: 100, transactionId: "t9" }] }), // return total 100
    ];
    const totals = computeClientSalesTotals(invoices);
    expect(totals.find((t) => t.clientId === "c1")?.totalByCurrency).toEqual({ MRU: 100 });
  });

  it("ignores a purchase invoice", () => {
    const totals = computeClientSalesTotals([invoice({ id: "1", kind: "purchase", clientId: undefined, supplierId: "s1" })]);
    expect(totals).toHaveLength(0);
  });
});

describe("computeItemSalesTotals", () => {
  it("sums each item's quantity and sale value across invoices", () => {
    const invoices = [
      invoice({ id: "1", lines: [{ itemId: "a", quantity: 2, unitPrice: 100, transactionId: "t1" }] }),
      invoice({ id: "2", lines: [{ itemId: "a", quantity: 3, unitPrice: 100, transactionId: "t2" }] }),
      invoice({ id: "3", lines: [{ itemId: "b", quantity: 1, unitPrice: 500, transactionId: "t3" }] }),
    ];
    const totals = computeItemSalesTotals(invoices);
    const a = totals.find((t) => t.itemId === "a");
    const b = totals.find((t) => t.itemId === "b");
    expect(a).toEqual({ itemId: "a", quantity: 5, totalByCurrency: { MRU: 500 } });
    expect(b).toEqual({ itemId: "b", quantity: 1, totalByCurrency: { MRU: 500 } });
  });

  it("subtracts a return's quantity/value from the item's totals", () => {
    const invoices = [
      invoice({ id: "orig", lines: [{ itemId: "a", quantity: 5, unitPrice: 100, transactionId: "t1" }] }),
      invoice({
        id: "ret",
        returnOfInvoiceId: "orig",
        lines: [{ itemId: "a", quantity: 2, unitPrice: 100, transactionId: "t2" }],
      }),
    ];
    const totals = computeItemSalesTotals(invoices);
    expect(totals.find((t) => t.itemId === "a")).toEqual({ itemId: "a", quantity: 3, totalByCurrency: { MRU: 300 } });
  });

  it("ignores a purchase invoice", () => {
    expect(computeItemSalesTotals([invoice({ id: "1", kind: "purchase", clientId: undefined, supplierId: "s1" })])).toHaveLength(0);
  });
});

describe("largestCurrencyValue", () => {
  it("returns the single largest value across currencies", () => {
    expect(largestCurrencyValue({ MRU: 500, USD: 20 })).toBe(500);
  });

  it("returns 0 for an empty record", () => {
    expect(largestCurrencyValue({})).toBe(0);
  });
});
