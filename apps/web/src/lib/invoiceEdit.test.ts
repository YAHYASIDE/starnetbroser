// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createInvoice, invoiceTotal } from "./invoiceStore";
import { deleteInvoice, invoiceLockReason, syncInvoiceCash, updateInvoice } from "./invoiceEdit";
import { computeStock, recordStoreTransaction } from "./storeStore";

function setup() {
  const bought = recordStoreTransaction([], { itemId: "i1", kind: "buy", quantity: 10, unitPrice: 5000, currencyCode: "MRU", date: "2026-10-01" });
  if (!bought.ok) throw new Error("buy");
  const sale = createInvoice([], bought.transactions, { kind: "sale", date: "2026-10-20", currencyCode: "MRU", lines: [{ itemId: "i1", quantity: 3, unitPrice: 60000 }], paidAmount: 50000, clientId: "c1", note: "أول" });
  if (!sale.ok) throw new Error("sale");
  const cash = syncInvoiceCash([], sale.invoice, sale.invoice.id);
  return { invoices: sale.invoices, transactions: sale.transactions, cash, id: sale.invoice.id, createdAt: sale.invoice.createdAt };
}

describe("✎ editing a store invoice from the statement (his Oct 20 2026 ask)", () => {
  it("quantity, price, discount, paid, date, note - same id; the stock and الكاش follow", () => {
    const s = setup();
    expect(computeStock(s.transactions, "i1")).toBe(7);
    const r = updateInvoice(s.invoices, s.transactions, s.cash, s.id, { date: "2026-10-19", lines: [{ quantity: 2, unitPrice: 90000 }], discount: 10000, paidAmount: 100000, note: "معدّلة" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.invoices).toHaveLength(1);
    expect(r.invoice).toMatchObject({ id: s.id, createdAt: s.createdAt, date: "2026-10-19", discount: 10000, paidAmount: 100000, note: "معدّلة", clientId: "c1" });
    expect(invoiceTotal(r.invoice!)).toBe(170000);
    expect(computeStock(r.transactions, "i1")).toBe(8);
    expect(r.cash).toHaveLength(1);
    expect(r.cash[0]).toMatchObject({ kind: "in", amount: 100000, date: "2026-10-19", invoiceId: s.id });
    // paid → 0: its cash goes
    const unpaid = updateInvoice(r.invoices, r.transactions, r.cash, s.id, { date: "2026-10-19", lines: [{ quantity: 2, unitPrice: 90000 }], discount: 0, paidAmount: 0 });
    expect(unpaid.ok && unpaid.cash).toEqual([]);
  });

  it("more than the stock is refused, nothing changed", () => {
    const s = setup();
    const r = updateInvoice(s.invoices, s.transactions, s.cash, s.id, { date: "2026-10-20", lines: [{ quantity: 11, unitPrice: 60000 }], discount: 0, paidAmount: 0 });
    expect(r).toEqual({ ok: false, message: "الكمية المطلوبة أكبر من المخزون المتاح (10)" });
  });

  it("🗑 delete: the invoice, its stock movement and its cash together", () => {
    const s = setup();
    const r = deleteInvoice(s.invoices, s.transactions, s.cash, s.id);
    expect(r.ok && r.invoices).toEqual([]);
    expect(r.ok && computeStock(r.transactions, "i1")).toBe(10);
    expect(r.ok && r.cash).toEqual([]);
  });

  it("an invoice with a return is left alone", () => {
    const s = setup();
    const ret = createInvoice(s.invoices, s.transactions, { kind: "sale", date: "2026-10-20", currencyCode: "MRU", lines: [{ itemId: "i1", quantity: 1, unitPrice: 60000 }], returnOfInvoiceId: s.id });
    if (!ret.ok) throw new Error("return");
    expect(invoiceLockReason(ret.invoices, s.id)).toBe("عليها مرتجع - احذف المرتجع أولًا من المتجر");
    expect(deleteInvoice(ret.invoices, ret.transactions, s.cash, s.id).ok).toBe(false);
    // the return itself can go
    expect(deleteInvoice(ret.invoices, ret.transactions, s.cash, ret.invoice.id).ok).toBe(true);
  });

  it("from the store's list: the shipping and the customer too (his Oct 22 2026 «كل شيء مع الشحن»)", () => {
    const s = setup();
    const withShip = updateInvoice(s.invoices, s.transactions, s.cash, s.id, { date: "2026-10-20", lines: [{ quantity: 3, unitPrice: 60000, shipping: { cost: 2000, charge: 5000 } }], discount: 0, paidAmount: 50000, clientId: "c2" });
    expect(withShip.ok).toBe(true);
    if (!withShip.ok) return;
    expect(withShip.invoice!.lines[0]).toMatchObject({ shippingCost: 2000, shippingCharge: 5000 });
    expect(withShip.invoice!.clientId).toBe("c2");
    expect(invoiceTotal(withShip.invoice!)).toBe(185000);
    // absent = kept; false = removed
    const kept = updateInvoice(withShip.invoices, withShip.transactions, withShip.cash, s.id, { date: "2026-10-20", lines: [{ quantity: 3, unitPrice: 60000 }], discount: 0, paidAmount: 0 });
    expect(kept.ok && kept.invoice!.lines[0]!.shippingCharge).toBe(5000);
    expect(kept.ok && kept.invoice!.clientId).toBe("c2");
    if (!kept.ok) return;
    const removed = updateInvoice(kept.invoices, kept.transactions, kept.cash, s.id, { date: "2026-10-20", lines: [{ quantity: 3, unitPrice: 60000, shipping: false }], discount: 0, paidAmount: 0 });
    expect(removed.ok && removed.invoice!.lines[0]!.shippingCharge).toBeUndefined();
  });
});
