import { describe, expect, it } from "vitest";
import { buildClientCombinedStatement, computeClientCombinedTotals } from "./clientAccount";
import { Invoice } from "./invoiceStore";
import { LedgerEntry } from "./ledgerStore";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    kind: "sale",
    date: "2026-09-20",
    currencyCode: "MRU",
    lines: [{ itemId: "a", quantity: 1, unitPrice: 1000, transactionId: "t1" }],
    discount: 0,
    paidAmount: 0,
    clientId: "c1",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 500,
    currency: "MRU",
    note: "",
    email: "",
    date: "2026-09-21",
    createdAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

const devices = [{ id: "d1", name: "منزل" }];

describe("computeClientCombinedTotals", () => {
  it("adds device charges and payments to the store totals, per currency", () => {
    const ledgerStore = {
      d1: [entry(), entry({ id: "p", kind: "credit", amount: 200 }), entry({ id: "u", currency: "USD", amount: 70 })],
      other: [entry({ id: "x", amount: 9999 })],
    };
    const totals = computeClientCombinedTotals([invoice({ paidAmount: 400 })], [], "c1", devices, ledgerStore);
    expect(totals.MRU).toEqual({ total: 1500, paid: 600, returned: 0, adjusted: 0, remaining: 900 });
    expect(totals.USD).toEqual({ total: 70, paid: 0, returned: 0, adjusted: 0, remaining: 70 });
  });
});

describe("buildClientCombinedStatement", () => {
  it("interleaves invoices and device operations with one running balance per currency", () => {
    const ledgerStore = {
      d1: [entry({ id: "charge", date: "2026-09-21" }), entry({ id: "pay", kind: "credit", amount: 300, date: "2026-09-22" })],
    };
    const rows = buildClientCombinedStatement([invoice()], [], "c1", devices, ledgerStore);
    expect(rows.map((r) => [r.id, r.type, r.balanceAfter])).toEqual([
      ["pay", "device-payment", 1200],
      ["charge", "device-charge", 1500],
      ["inv1", "invoice", 1000],
    ]);
    expect(rows[0].deviceName).toBe("منزل");
  });
});
