import { describe, expect, it } from "vitest";
import {
  computeStock,
  createInvoice,
  Invoice,
  invoiceBalanceDue,
  invoicePaymentStatus,
  invoiceSubtotal,
  invoiceTotal,
  InvoiceList,
  listInvoices,
  listInvoicesForClient,
  listInvoicesForSupplier,
  listReturnsForInvoice,
  returnedQuantityForLine,
} from "./invoiceStore";
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

describe("invoice totals", () => {
  it("subtotal sums quantity*unitPrice across lines", () => {
    const inv = invoice({
      lines: [
        { itemId: "a", quantity: 2, unitPrice: 100, transactionId: "t1" },
        { itemId: "b", quantity: 1, unitPrice: 50, transactionId: "t2" },
      ],
    });
    expect(invoiceSubtotal(inv)).toBe(250);
  });

  it("total subtracts the discount, floored at 0", () => {
    expect(invoiceTotal(invoice({ discount: 50 }))).toBe(150);
    expect(invoiceTotal(invoice({ discount: 500 }))).toBe(0);
  });

  it("balanceDue is total minus paidAmount", () => {
    expect(invoiceBalanceDue(invoice({ paidAmount: 80 }))).toBe(120);
  });

  it("payment status: credit when nothing paid", () => {
    expect(invoicePaymentStatus(invoice({ paidAmount: 0 }))).toBe("credit");
  });

  it("payment status: paid when fully paid", () => {
    expect(invoicePaymentStatus(invoice({ paidAmount: 200 }))).toBe("paid");
  });

  it("payment status: partial otherwise", () => {
    expect(invoicePaymentStatus(invoice({ paidAmount: 100 }))).toBe("partial");
  });
});

describe("createInvoice - sale", () => {
  it("rejects an invoice with no lines", () => {
    const result = createInvoice([], [], { kind: "sale", date: "2026-09-20", currencyCode: "MRU", lines: [] });
    expect(result.ok).toBe(false);
  });

  it("creates a sell transaction per line and deducts stock", () => {
    const stock: StoreTransactionList = [
      { id: "buy1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 50, currencyCode: "MRU", date: "2026-09-01", createdAt: "t0" },
    ];
    const result = createInvoice([], stock, {
      kind: "sale",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 3, unitPrice: 100 }],
      clientId: "client-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(computeStock(result.transactions, "a")).toBe(7);
    const created = result.transactions.find((t) => t.id === result.invoice.lines[0].transactionId)!;
    expect(created.kind).toBe("sell");
    expect(created.invoiceId).toBe(result.invoice.id);
    expect(created.clientId).toBe("client-1");
    expect(result.invoice.clientId).toBe("client-1");
  });

  it("rejects overselling past available stock (delegated to recordStoreTransaction)", () => {
    const result = createInvoice([], [], {
      kind: "sale",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 5, unitPrice: 100 }],
    });
    expect(result.ok).toBe(false);
  });

  it("aborts the whole invoice if any line fails, leaving transactions untouched", () => {
    const stock: StoreTransactionList = [
      { id: "buy1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 50, currencyCode: "MRU", date: "2026-09-01", createdAt: "t0" },
    ];
    const result = createInvoice([], stock, {
      kind: "sale",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [
        { itemId: "a", quantity: 3, unitPrice: 100 },
        { itemId: "b", quantity: 999, unitPrice: 100 }, // no stock for "b" at all
      ],
    });
    expect(result.ok).toBe(false);
  });

  // These three use "purchase" (never stock-limited) so the failure genuinely comes from the
  // discount/paidAmount validation under test, not an incidental "no stock" rejection.
  it("rejects a negative discount", () => {
    const result = createInvoice([], [], {
      kind: "purchase",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 1, unitPrice: 100 }],
      discount: -5,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a discount larger than the subtotal", () => {
    const result = createInvoice([], [], {
      kind: "purchase",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 1, unitPrice: 100 }],
      discount: 200,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects paidAmount larger than the total", () => {
    const result = createInvoice([], [], {
      kind: "purchase",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 1, unitPrice: 100 }],
      paidAmount: 150,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a partial payment within the total", () => {
    const stock: StoreTransactionList = [
      { id: "buy1", itemId: "a", kind: "buy", quantity: 5, unitPrice: 50, currencyCode: "MRU", date: "2026-09-01", createdAt: "t0" },
    ];
    const result = createInvoice([], stock, {
      kind: "sale",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 1, unitPrice: 100 }],
      paidAmount: 40,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(invoicePaymentStatus(result.invoice)).toBe("partial");
  });
});

describe("createInvoice - purchase", () => {
  it("creates a buy transaction per line and adds stock, linked to a supplier", () => {
    const result = createInvoice([], [], {
      kind: "purchase",
      date: "2026-09-20",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 20, unitPrice: 60 }],
      supplierId: "supplier-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(computeStock(result.transactions, "a")).toBe(20);
    const created = result.transactions[0];
    expect(created.kind).toBe("buy");
    expect(result.invoice.supplierId).toBe("supplier-1");
    expect(result.invoice.clientId).toBeUndefined();
  });
});

describe("createInvoice - returns", () => {
  it("a sale return moves stock back IN (buy-direction) and clears clientId", () => {
    const saleStock: StoreTransactionList = [
      { id: "buy1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 50, currencyCode: "MRU", date: "2026-09-01", createdAt: "t0" },
    ];
    const sale = createInvoice([], saleStock, {
      kind: "sale",
      date: "2026-09-10",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 4, unitPrice: 100 }],
      clientId: "client-1",
    });
    if (!sale.ok) throw new Error("expected sale to succeed");
    expect(computeStock(sale.transactions, "a")).toBe(6);

    const ret = createInvoice(sale.invoices, sale.transactions, {
      kind: "sale",
      date: "2026-09-12",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 2, unitPrice: 100 }],
      returnOfInvoiceId: sale.invoice.id,
      clientId: "client-1", // ignored for a return
    });
    expect(ret.ok).toBe(true);
    if (!ret.ok) return;
    expect(computeStock(ret.transactions, "a")).toBe(8);
    const returnTxn = ret.transactions.find((t) => t.id === ret.invoice.lines[0].transactionId)!;
    expect(returnTxn.kind).toBe("buy");
    expect(ret.invoice.clientId).toBeUndefined();
    expect(ret.invoice.returnOfInvoiceId).toBe(sale.invoice.id);
  });

  it("a purchase return moves stock back OUT (sell-direction) and is capped by current stock", () => {
    const purchase = createInvoice([], [], {
      kind: "purchase",
      date: "2026-09-10",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 10, unitPrice: 50 }],
      supplierId: "supplier-1",
    });
    if (!purchase.ok) throw new Error("expected purchase to succeed");

    const okReturn = createInvoice(purchase.invoices, purchase.transactions, {
      kind: "purchase",
      date: "2026-09-12",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 4, unitPrice: 50 }],
      returnOfInvoiceId: purchase.invoice.id,
    });
    expect(okReturn.ok).toBe(true);
    if (!okReturn.ok) return;
    expect(computeStock(okReturn.transactions, "a")).toBe(6);
    expect(okReturn.transactions.find((t) => t.id === okReturn.invoice.lines[0].transactionId)!.kind).toBe("sell");

    const tooMuch = createInvoice(okReturn.invoices, okReturn.transactions, {
      kind: "purchase",
      date: "2026-09-13",
      currencyCode: "MRU",
      lines: [{ itemId: "a", quantity: 999, unitPrice: 50 }],
      returnOfInvoiceId: purchase.invoice.id,
    });
    expect(tooMuch.ok).toBe(false);
  });
});

describe("listInvoices / listInvoicesForClient / listInvoicesForSupplier", () => {
  const invoices: InvoiceList = [
    invoice({ id: "1", date: "2026-09-01", createdAt: "t1", clientId: "c1" }),
    invoice({ id: "2", date: "2026-09-05", createdAt: "t2", clientId: "c2" }),
    invoice({ id: "3", date: "2026-09-03", createdAt: "t3", kind: "purchase", clientId: undefined, supplierId: "s1" }),
  ];

  it("listInvoices sorts newest first by date", () => {
    expect(listInvoices(invoices).map((i) => i.id)).toEqual(["2", "3", "1"]);
  });

  it("listInvoicesForClient filters by clientId", () => {
    expect(listInvoicesForClient(invoices, "c1").map((i) => i.id)).toEqual(["1"]);
  });

  it("listInvoicesForSupplier filters by supplierId", () => {
    expect(listInvoicesForSupplier(invoices, "s1").map((i) => i.id)).toEqual(["3"]);
  });
});

describe("listReturnsForInvoice / returnedQuantityForLine", () => {
  it("finds returns pointing at the original invoice and sums returned quantity per item", () => {
    const invoices: InvoiceList = [
      invoice({ id: "orig", lines: [{ itemId: "a", quantity: 10, unitPrice: 100, transactionId: "t1" }] }),
      invoice({
        id: "ret1",
        returnOfInvoiceId: "orig",
        lines: [{ itemId: "a", quantity: 2, unitPrice: 100, transactionId: "t2" }],
      }),
      invoice({
        id: "ret2",
        returnOfInvoiceId: "orig",
        lines: [{ itemId: "a", quantity: 1, unitPrice: 100, transactionId: "t3" }],
      }),
      invoice({ id: "unrelated" }),
    ];
    expect(listReturnsForInvoice(invoices, "orig").map((i) => i.id).sort()).toEqual(["ret1", "ret2"]);
    expect(returnedQuantityForLine(invoices, "orig", "a")).toBe(3);
    expect(returnedQuantityForLine(invoices, "orig", "other-item")).toBe(0);
  });
});
