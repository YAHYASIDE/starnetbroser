import { describe, expect, it } from "vitest";
import { createInvoice, invoiceRepCommission, type Invoice } from "./invoiceStore";
import { itemRepPrice, recordStoreTransaction, setItemRepPrice, type StoreItemRegistry } from "./storeStore";
import { computeRepCommissionOwedByCurrency, listRepInvoiceCommissions } from "./repStore";

const items: StoreItemRegistry = { mini: { id: "mini", name: "MINI", unit: "قطعة", createdAt: "", updatedAt: "" } };

describe("🤝 a rep's fixed price on an item (his Oct 22 2026 ask)", () => {
  it("is set and removed per rep, read only in its own currency", () => {
    const set = setItemRepPrice(items, "mini", "r1", { price: 185000, currencyCode: "MRU" });
    expect(itemRepPrice(set.mini, "r1", "MRU")).toBe(185000);
    expect(itemRepPrice(set.mini, "r1", "SIFA")).toBeUndefined();
    expect(itemRepPrice(set.mini, "r2", "MRU")).toBeUndefined();
    expect(setItemRepPrice(set, "mini", "r1", null).mini!.repPrices).toBeUndefined();
  });

  it("a sale through him: he earns sale − his price (a loss too), minus the discount - no percent", () => {
    const bought = recordStoreTransaction([], { itemId: "mini", kind: "buy", quantity: 5, unitPrice: 180000, currencyCode: "MRU", date: "2026-10-01" });
    if (!bought.ok) throw new Error("buy");
    const sale = createInvoice([], bought.transactions, {
      kind: "sale", date: "2026-10-22", currencyCode: "MRU", representativeId: "r1", representativeCommissionPercent: 50,
      lines: [{ itemId: "mini", quantity: 2, unitPrice: 200000, repUnitPrice: 185000, shippingCharge: 45000 }], discount: 5000, paidAmount: 0,
    });
    if (!sale.ok) throw new Error(sale.message);
    expect(sale.invoice.lines[0]!.repUnitPrice).toBe(185000);
    expect(invoiceRepCommission(sale.invoice)).toBe(25000); // (200,000 − 185,000) × 2 − 5,000
    expect(computeRepCommissionOwedByCurrency("r1", sale.invoices, [])).toEqual({ MRU: 25000 });
    expect(listRepInvoiceCommissions("r1", sale.invoices)[0]!.commissionAmount).toBe(25000);
    const below: Invoice = { ...sale.invoice, lines: [{ ...sale.invoice.lines[0]!, unitPrice: 180000 }], discount: 0 };
    expect(invoiceRepCommission(below)).toBe(-10000);
  });

  it("without his price the old percent stays; no rep = nothing; the price is never locked without a rep", () => {
    const inv: Invoice = { id: "i", kind: "sale", date: "2026-10-22", currencyCode: "MRU", lines: [{ itemId: "mini", quantity: 1, unitPrice: 100000, transactionId: "t" }], discount: 0, paidAmount: 0, representativeId: "r1", representativeCommissionPercent: 10, createdAt: "" };
    expect(invoiceRepCommission(inv)).toBe(10000);
    expect(invoiceRepCommission({ ...inv, representativeId: undefined })).toBeUndefined();
    const stock = recordStoreTransaction([], { itemId: "mini", kind: "buy", quantity: 1, unitPrice: 1, currencyCode: "MRU", date: "2026-10-01" });
    if (!stock.ok) throw new Error("buy");
    const noRep = createInvoice([], stock.transactions, { kind: "sale", date: "2026-10-22", currencyCode: "MRU", lines: [{ itemId: "mini", quantity: 1, unitPrice: 5, repUnitPrice: 3 }] });
    expect(noRep.ok && noRep.invoice.lines[0]!.repUnitPrice).toBeUndefined();
  });
});
