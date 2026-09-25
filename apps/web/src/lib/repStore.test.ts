import { describe, expect, it } from "vitest";
import {
  buildRepDailyStatement,
  computeRepSharesUsd,
  listRepDeviceCommissions,
  totalRepDeviceCommissions,
  computeRepCashHeldByCurrency,
  computeRepCommissionEarnedByCurrency,
  computeRepCommissionOwedByCurrency,
  computeRepManualBalanceByCurrency,
  countLinkedAccounts,
  createRepresentative,
  listRepInvoiceCommissions,
  listRepresentatives,
  recordRepSettlement,
  repFromClientDevice,
  RepresentativeStore,
  RepSettlementList,
  updateRepresentative,
} from "./repStore";
import { Invoice } from "./invoiceStore";
import { LedgerEntry } from "./ledgerStore";

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

describe("countLinkedAccounts", () => {
  it("counts only accounts whose representativeId matches", () => {
    const accounts = [{ representativeId: "r1" }, { representativeId: "r2" }, { representativeId: "r1" }, {}];
    expect(countLinkedAccounts(accounts, "r1")).toBe(2);
    expect(countLinkedAccounts(accounts, "r2")).toBe(1);
    expect(countLinkedAccounts(accounts, "r3")).toBe(0);
  });
});

describe("repFromClientDevice", () => {
  it("returns undefined when clientId is undefined", () => {
    expect(repFromClientDevice([{ clientId: "c1", representativeId: "r1" }], undefined)).toBeUndefined();
  });

  it("returns undefined when the client has no linked devices", () => {
    expect(repFromClientDevice([{ clientId: "c2", representativeId: "r1" }], "c1")).toBeUndefined();
  });

  it("returns undefined when the client's device(s) have no representative", () => {
    expect(repFromClientDevice([{ clientId: "c1" }], "c1")).toBeUndefined();
  });

  it("returns the representativeId when exactly one distinct rep is linked", () => {
    const accounts = [
      { clientId: "c1", representativeId: "r1" },
      { clientId: "c1", representativeId: "r1" },
      { clientId: "c2", representativeId: "r2" },
    ];
    expect(repFromClientDevice(accounts, "c1")).toBe("r1");
  });

  it("returns undefined when the client's devices are split across more than one rep", () => {
    const accounts = [
      { clientId: "c1", representativeId: "r1" },
      { clientId: "c1", representativeId: "r2" },
    ];
    expect(repFromClientDevice(accounts, "c1")).toBeUndefined();
  });
});

function shipment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 100,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-20" },
    representativeId: "r1",
    representativeCommissionPercent: 50,
    ...overrides,
  };
}

describe("device profit shares", () => {
  it("gives the rep his locked percent of a settled shipment's profit", () => {
    const rows = listRepDeviceCommissions("r1", { d1: [shipment()] });
    expect(rows).toHaveLength(1);
    expect(rows[0].repShareUsd).toBe(20); // profit 40 * 50%
    expect(rows[0].ourShareUsd).toBe(20);
  });

  it("ignores entries without a rep snapshot (created before the feature), other reps and payments", () => {
    const store = {
      d1: [
        shipment({ id: "old", representativeId: undefined, representativeCommissionPercent: undefined }),
        shipment({ id: "other", representativeId: "r2" }),
        shipment({ id: "pay", kind: "credit", starlinkCost: undefined }),
      ],
    };
    expect(listRepDeviceCommissions("r1", store)).toEqual([]);
  });

  it("gives no share yet while Starlink's cost is still D (pending)", () => {
    const rows = listRepDeviceCommissions("r1", {
      d1: [shipment({ starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } })],
    });
    expect(rows[0].repShareUsd).toBeUndefined();
    expect(totalRepDeviceCommissions(rows)).toEqual({ profitUsd: 0, repShareUsd: 0, ourShareUsd: 0, pendingCount: 1 });
  });

  it("a loss earns the rep nothing - we carry it", () => {
    const rows = listRepDeviceCommissions("r1", {
      d1: [shipment({ starlinkCost: { status: "settled", currencyCode: "USD", amount: 130, paidAt: "2026-09-20" } })],
    });
    expect(rows[0].repShareUsd).toBe(0);
    expect(rows[0].ourShareUsd).toBe(-30);
  });

  it("a rep locked as sharing losses carries his percent of the loss, reducing what he's owed", () => {
    const loss = shipment({
      id: "loss",
      representativeSharesLosses: true,
      starlinkCost: { status: "settled", currencyCode: "USD", amount: 130, paidAt: "2026-09-20" },
    });
    const rows = listRepDeviceCommissions("r1", { d1: [shipment(), loss] });
    const lossRow = rows.find((r) => r.entry.id === "loss")!;
    expect(lossRow.repShareUsd).toBe(-15);
    expect(lossRow.ourShareUsd).toBe(-15);
    expect(computeRepCommissionOwedByCurrency("r1", [], [], rows)).toEqual({ USD: 5 });
  });

  it("adds device shares into commission earned/owed in USD, minus USD payouts", () => {
    const rows = listRepDeviceCommissions("r1", { d1: [shipment()] });
    expect(computeRepCommissionEarnedByCurrency("r1", [], rows)).toEqual({ USD: 20 });
    const settlements: RepSettlementList = [
      { id: "s", representativeId: "r1", kind: "commissionPayout", amount: 5, currencyCode: "USD", date: "2026-09-21", createdAt: "x" },
    ];
    expect(computeRepCommissionOwedByCurrency("r1", [], settlements, rows)).toEqual({ USD: 15 });
  });

  it("computeRepSharesUsd sums every rep's share across entries", () => {
    expect(computeRepSharesUsd([shipment(), shipment({ id: "e2", representativeId: "r2", representativeCommissionPercent: 25 })])).toBe(30);
  });

  it("buildRepDailyStatement groups by day newest-first with each day's split", () => {
    const rows = listRepDeviceCommissions("r1", {
      d1: [shipment({ id: "a", date: "2026-09-20" }), shipment({ id: "b", date: "2026-09-22", createdAt: "2026-09-22T09:00:00.000Z" })],
    });
    const settlements: RepSettlementList = [
      { id: "s", representativeId: "r1", kind: "commissionPayout", amount: 5, currencyCode: "USD", date: "2026-09-22", createdAt: "2026-09-22T12:00:00.000Z" },
    ];
    const days = buildRepDailyStatement("r1", rows, [], settlements);
    expect(days.map((d) => d.date)).toEqual(["2026-09-22", "2026-09-20"]);
    expect(days[0].rows.map((r) => r.id)).toEqual(["s", "b"]);
    expect(days[0].repShareUsd).toBe(20);
    expect(days[0].ourShareUsd).toBe(20);
  });
});
