import { describe, expect, it } from "vitest";
import {
  computeRepCashHeldByCurrency,
  computeRepCommissionEarnedByCurrency,
  computeRepCommissionOwedByCurrency,
  computeRepManualBalanceByCurrency,
  createRepresentative,
  listRepInvoiceCommissions,
  listRepresentatives,
  recordRepSettlement,
  RepresentativeStore,
  RepSettlementList,
  updateRepresentative,
} from "./repStore";
import { Invoice } from "./invoiceStore";

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

describe("createRepresentative / updateRepresentative", () => {
  it("creates a representative with a trimmed name and non-negative commission", () => {
    const { representative } = createRepresentative({}, { name: "  أحمد  ", commissionPercent: 5 });
    expect(representative.name).toBe("أحمد");
    expect(representative.commissionPercent).toBe(5);
  });

  it("floors a negative commissionPercent at 0", () => {
    const { representative } = createRepresentative({}, { name: "أحمد", commissionPercent: -3 });
    expect(representative.commissionPercent).toBe(0);
  });

  it("updates an existing representative's rate without touching its id", () => {
    const { store, representative } = createRepresentative({}, { name: "أحمد", commissionPercent: 5 });
    const updated = updateRepresentative(store, representative.id, { name: "أحمد", commissionPercent: 7 });
    expect(updated[representative.id]?.commissionPercent).toBe(7);
    expect(updated[representative.id]?.id).toBe(representative.id);
  });

  it("no-ops when updating an unknown id", () => {
    const store: RepresentativeStore = {};
    expect(updateRepresentative(store, "missing", { name: "x", commissionPercent: 5 })).toBe(store);
  });
});

describe("listRepresentatives", () => {
  it("sorts by name", () => {
    let store: RepresentativeStore = {};
    store = createRepresentative(store, { name: "ياسين", commissionPercent: 5 }).store;
    store = createRepresentative(store, { name: "أحمد", commissionPercent: 5 }).store;
    const names = listRepresentatives(store).map((r) => r.name);
    expect(names).toEqual(["أحمد", "ياسين"]);
  });
});

describe("computeRepCashHeldByCurrency", () => {
  it("sums paidAmount on invoices attributed to the rep, per currency", () => {
    const invoices = [
      invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", paidAmount: 5000 }),
      invoice({ id: "2", representativeId: "r1", currencyCode: "MRU", paidAmount: 2000 }),
      invoice({ id: "3", representativeId: "r2", currencyCode: "MRU", paidAmount: 9000 }), // different rep
    ];
    expect(computeRepCashHeldByCurrency("r1", invoices, [])).toEqual({ MRU: 7000 });
  });

  it("subtracts a recorded cash handover", () => {
    const invoices = [invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", paidAmount: 5000 })];
    const settlements: RepSettlementList = [
      { id: "s1", representativeId: "r1", kind: "cashHandover", amount: 3000, currencyCode: "MRU", date: "2026-09-21", createdAt: "t" },
    ];
    expect(computeRepCashHeldByCurrency("r1", invoices, settlements)).toEqual({ MRU: 2000 });
  });

  it("ignores a return invoice", () => {
    const invoices = [
      invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", paidAmount: 5000, returnOfInvoiceId: "orig" }),
    ];
    expect(computeRepCashHeldByCurrency("r1", invoices, [])).toEqual({});
  });

  it("ignores an unpaid invoice (nothing collected yet)", () => {
    const invoices = [invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", paidAmount: 0 })];
    expect(computeRepCashHeldByCurrency("r1", invoices, [])).toEqual({});
  });
});

describe("computeRepCommissionOwedByCurrency", () => {
  it("sums commission from each invoice's own locked commissionPercent", () => {
    const invoices = [
      invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", representativeCommissionPercent: 5 }), // total 200 -> 10
      invoice({
        id: "2",
        representativeId: "r1",
        currencyCode: "MRU",
        representativeCommissionPercent: 5,
        lines: [{ itemId: "a", quantity: 1, unitPrice: 1000, transactionId: "t2" }],
      }), // total 1000 -> 50
    ];
    expect(computeRepCommissionOwedByCurrency("r1", invoices, [])).toEqual({ MRU: 60 });
  });

  it("does not rewrite commission when the representative's CURRENT rate differs from the locked one", () => {
    const invoices = [invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", representativeCommissionPercent: 5 })]; // 200 -> 10
    // Even though nothing here references a "current" rate of, say, 10%, this test documents the
    // invariant: only the invoice's own locked snapshot is ever read.
    expect(computeRepCommissionOwedByCurrency("r1", invoices, [])).toEqual({ MRU: 10 });
  });

  it("subtracts a recorded commission payout", () => {
    const invoices = [invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", representativeCommissionPercent: 5 })]; // 10
    const settlements: RepSettlementList = [
      { id: "s1", representativeId: "r1", kind: "commissionPayout", amount: 4, currencyCode: "MRU", date: "2026-09-21", createdAt: "t" },
    ];
    expect(computeRepCommissionOwedByCurrency("r1", invoices, settlements)).toEqual({ MRU: 6 });
  });

  it("skips an invoice with no locked commission snapshot", () => {
    const invoices = [invoice({ id: "1", representativeId: "r1", currencyCode: "MRU" })];
    expect(computeRepCommissionOwedByCurrency("r1", invoices, [])).toEqual({});
  });
});

describe("recordRepSettlement", () => {
  it("rejects a zero or negative amount", () => {
    const result = recordRepSettlement([], {
      representativeId: "r1",
      kind: "cashHandover",
      amount: 0,
      currencyCode: "MRU",
      date: "2026-09-21",
    });
    expect(result.ok).toBe(false);
  });

  it("appends a valid settlement", () => {
    const result = recordRepSettlement([], {
      representativeId: "r1",
      kind: "cashHandover",
      amount: 500,
      currencyCode: "MRU",
      date: "2026-09-21",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settlements).toHaveLength(1);
  });
});

describe("computeRepManualBalanceByCurrency", () => {
  it("adds manualCredit and subtracts manualDebit, per currency", () => {
    const settlements: RepSettlementList = [
      { id: "s1", representativeId: "r1", kind: "manualCredit", amount: 1000, currencyCode: "MRU", date: "2026-09-21", createdAt: "t" },
      { id: "s2", representativeId: "r1", kind: "manualDebit", amount: 400, currencyCode: "MRU", date: "2026-09-22", createdAt: "t" },
      { id: "s3", representativeId: "r2", kind: "manualCredit", amount: 500, currencyCode: "MRU", date: "2026-09-22", createdAt: "t" }, // different rep
    ];
    expect(computeRepManualBalanceByCurrency("r1", settlements)).toEqual({ MRU: 600 });
  });

  it("ignores cashHandover/commissionPayout settlements", () => {
    const settlements: RepSettlementList = [
      { id: "s1", representativeId: "r1", kind: "cashHandover", amount: 1000, currencyCode: "MRU", date: "2026-09-21", createdAt: "t" },
      { id: "s2", representativeId: "r1", kind: "commissionPayout", amount: 400, currencyCode: "MRU", date: "2026-09-22", createdAt: "t" },
    ];
    expect(computeRepManualBalanceByCurrency("r1", settlements)).toEqual({});
  });

  it("returns an empty object when there are no manual settlements", () => {
    expect(computeRepManualBalanceByCurrency("r1", [])).toEqual({});
  });
});

describe("computeRepCommissionEarnedByCurrency", () => {
  it("sums gross commission and never nets out a commissionPayout settlement", () => {
    const invoices = [invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", representativeCommissionPercent: 5 })]; // 200 -> 10
    expect(computeRepCommissionEarnedByCurrency("r1", invoices)).toEqual({ MRU: 10 });
  });

  it("skips an invoice with no locked commission snapshot", () => {
    const invoices = [invoice({ id: "1", representativeId: "r1", currencyCode: "MRU" })];
    expect(computeRepCommissionEarnedByCurrency("r1", invoices)).toEqual({});
  });

  it("ignores a return invoice", () => {
    const invoices = [
      invoice({ id: "1", representativeId: "r1", currencyCode: "MRU", representativeCommissionPercent: 5, returnOfInvoiceId: "orig" }),
    ];
    expect(computeRepCommissionEarnedByCurrency("r1", invoices)).toEqual({});
  });
});

describe("listRepInvoiceCommissions", () => {
  it("lists each invoice attributed to the rep with its own commission amount, newest first", () => {
    const invoices = [
      invoice({ id: "1", date: "2026-09-20", representativeId: "r1", currencyCode: "MRU", representativeCommissionPercent: 5 }), // 200 -> 10
      invoice({
        id: "2",
        date: "2026-09-22",
        representativeId: "r1",
        currencyCode: "MRU",
        representativeCommissionPercent: 5,
        lines: [{ itemId: "a", quantity: 1, unitPrice: 1000, transactionId: "t2" }],
      }), // 1000 -> 50
    ];
    const rows = listRepInvoiceCommissions("r1", invoices);
    expect(rows.map((r) => r.invoice.id)).toEqual(["2", "1"]);
    expect(rows.map((r) => r.commissionAmount)).toEqual([50, 10]);
  });

  it("excludes invoices attributed to another rep or with no locked commission", () => {
    const invoices = [
      invoice({ id: "1", representativeId: "r2", currencyCode: "MRU", representativeCommissionPercent: 5 }),
      invoice({ id: "2", representativeId: "r1", currencyCode: "MRU" }),
    ];
    expect(listRepInvoiceCommissions("r1", invoices)).toEqual([]);
  });
});
