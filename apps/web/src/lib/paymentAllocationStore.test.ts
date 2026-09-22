import { describe, expect, it } from "vitest";
import {
  addAllocations,
  computeShipmentPaymentStatus,
  createAllocation,
  getAccountAllocations,
  paidTowardShipment,
  PaymentAllocation,
  planFifoAllocation,
  removeAllocationsForEntry,
  withAccountAllocations,
} from "./paymentAllocationStore";
import { LedgerEntry } from "./ledgerStore";

function shipment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "s1",
    kind: "debit",
    amount: 100,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-01",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function alloc(overrides: Partial<PaymentAllocation> = {}): PaymentAllocation {
  return {
    id: "a1",
    paymentEntryId: "p1",
    shipmentEntryId: "s1",
    amount: 30,
    currency: "USD",
    createdAt: "2026-09-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("getAccountAllocations / withAccountAllocations", () => {
  it("returns an empty array for an account with none yet", () => {
    expect(getAccountAllocations({}, "acc-1")).toEqual([]);
  });

  it("withAccountAllocations sets that account's allocations without touching others", () => {
    const store = { "acc-1": [alloc({ id: "a" })] };
    const updated = withAccountAllocations(store, "acc-2", [alloc({ id: "b" })]);
    expect(getAccountAllocations(updated, "acc-1")).toEqual(store["acc-1"]);
    expect(getAccountAllocations(updated, "acc-2").map((a) => a.id)).toEqual(["b"]);
  });
});

describe("createAllocation / addAllocations", () => {
  it("creates an allocation with a fresh id and given fields", () => {
    const created = createAllocation("p1", "s1", 25, "MRU");
    expect(created.paymentEntryId).toBe("p1");
    expect(created.shipmentEntryId).toBe("s1");
    expect(created.amount).toBe(25);
    expect(created.currency).toBe("MRU");
    expect(created.id).toBeTruthy();
  });

  it("addAllocations appends without mutating the input", () => {
    const original = [alloc({ id: "a" })];
    const result = addAllocations(original, [alloc({ id: "b" })]);
    expect(original).toHaveLength(1);
    expect(result.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("removeAllocationsForEntry", () => {
  it("removes allocations where the entry is the payment side", () => {
    const allocations = [alloc({ id: "a", paymentEntryId: "p1" }), alloc({ id: "b", paymentEntryId: "p2" })];
    expect(removeAllocationsForEntry(allocations, "p1").map((a) => a.id)).toEqual(["b"]);
  });

  it("removes allocations where the entry is the shipment side", () => {
    const allocations = [alloc({ id: "a", shipmentEntryId: "s1" }), alloc({ id: "b", shipmentEntryId: "s2" })];
    expect(removeAllocationsForEntry(allocations, "s1").map((a) => a.id)).toEqual(["b"]);
  });

  it("does not mutate the input", () => {
    const allocations = [alloc({ id: "a" })];
    removeAllocationsForEntry(allocations, "p1");
    expect(allocations).toHaveLength(1);
  });
});

describe("paidTowardShipment / computeShipmentPaymentStatus", () => {
  it("sums every allocation targeting that shipment", () => {
    const allocations = [
      alloc({ shipmentEntryId: "s1", amount: 30 }),
      alloc({ shipmentEntryId: "s1", amount: 20 }),
      alloc({ shipmentEntryId: "s2", amount: 999 }),
    ];
    expect(paidTowardShipment(allocations, "s1")).toBe(50);
  });

  it("is 'unpaid' with no allocations", () => {
    expect(computeShipmentPaymentStatus(shipment({ amount: 100 }), [])).toBe("unpaid");
  });

  it("is 'partial' when paid less than the full amount", () => {
    const allocations = [alloc({ shipmentEntryId: "s1", amount: 40 })];
    expect(computeShipmentPaymentStatus(shipment({ id: "s1", amount: 100 }), allocations)).toBe("partial");
  });

  it("is 'paid' once allocations reach the full amount", () => {
    const allocations = [alloc({ shipmentEntryId: "s1", amount: 60 }), alloc({ shipmentEntryId: "s1", amount: 40 })];
    expect(computeShipmentPaymentStatus(shipment({ id: "s1", amount: 100 }), allocations)).toBe("paid");
  });

  it("is 'paid' even if overpaid", () => {
    const allocations = [alloc({ shipmentEntryId: "s1", amount: 150 })];
    expect(computeShipmentPaymentStatus(shipment({ id: "s1", amount: 100 }), allocations)).toBe("paid");
  });
});

describe("planFifoAllocation", () => {
  it("fills the single oldest unpaid shipment first", () => {
    const entries = [
      shipment({ id: "old", amount: 50, date: "2026-09-01" }),
      shipment({ id: "new", amount: 50, date: "2026-09-10" }),
    ];
    const { plan, unallocated } = planFifoAllocation(entries, [], 30, "USD");
    expect(plan).toEqual([{ shipmentEntryId: "old", amount: 30 }]);
    expect(unallocated).toBe(0);
  });

  it("splits a payment across multiple shipments, oldest first", () => {
    const entries = [
      shipment({ id: "old", amount: 50, date: "2026-09-01" }),
      shipment({ id: "mid", amount: 30, date: "2026-09-05" }),
      shipment({ id: "new", amount: 40, date: "2026-09-10" }),
    ];
    const { plan, unallocated } = planFifoAllocation(entries, [], 90, "USD");
    expect(plan).toEqual([
      { shipmentEntryId: "old", amount: 50 },
      { shipmentEntryId: "mid", amount: 30 },
      { shipmentEntryId: "new", amount: 10 },
    ]);
    expect(unallocated).toBe(0);
  });

  it("reports the leftover once every eligible shipment is filled", () => {
    const entries = [shipment({ id: "s1", amount: 50 })];
    const { plan, unallocated } = planFifoAllocation(entries, [], 80, "USD");
    expect(plan).toEqual([{ shipmentEntryId: "s1", amount: 50 }]);
    expect(unallocated).toBe(30);
  });

  it("skips already-fully-paid shipments", () => {
    const entries = [shipment({ id: "s1", amount: 50, date: "2026-09-01" }), shipment({ id: "s2", amount: 50, date: "2026-09-05" })];
    const allocations = [alloc({ shipmentEntryId: "s1", amount: 50 })];
    const { plan } = planFifoAllocation(entries, allocations, 20, "USD");
    expect(plan).toEqual([{ shipmentEntryId: "s2", amount: 20 }]);
  });

  it("only considers shipments in the same currency as the payment", () => {
    const entries = [shipment({ id: "usd", amount: 50, currency: "USD" }), shipment({ id: "mru", amount: 50, currency: "MRU" })];
    const { plan } = planFifoAllocation(entries, [], 20, "MRU");
    expect(plan).toEqual([{ shipmentEntryId: "mru", amount: 20 }]);
  });

  it("never considers a credit entry a target", () => {
    const entries = [shipment({ id: "s1", amount: 50 }), { ...shipment({ id: "c1" }), kind: "credit" as const }];
    const { plan } = planFifoAllocation(entries, [], 10, "USD");
    expect(plan).toEqual([{ shipmentEntryId: "s1", amount: 10 }]);
  });

  it("is empty with the full amount unallocated when there is nothing eligible", () => {
    const { plan, unallocated } = planFifoAllocation([], [], 40, "USD");
    expect(plan).toEqual([]);
    expect(unallocated).toBe(40);
  });
});
