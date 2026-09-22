import { describe, expect, it } from "vitest";
import { computeDeviceAccountingSummary, computeShipmentProfit } from "./accountingStore";
import { LedgerEntry } from "./ledgerStore";

function shipment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "s1",
    kind: "debit",
    amount: 45000,
    currency: "MRU",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    saleRate: { rateFromUsd: 400, usdValue: 112.5 },
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 100, paidAt: "2026-09-21" },
    ...overrides,
  };
}

function payment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "p1",
    kind: "credit",
    amount: 20000,
    currency: "MRU",
    note: "",
    email: "",
    date: "2026-09-22",
    createdAt: "2026-09-22T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeShipmentProfit", () => {
  it("computes the spec's own worked example: 45,000 MRU @1USD=400MRU sale, 100 USD cost -> 12.50 USD profit", () => {
    const profit = computeShipmentProfit(shipment());
    expect(profit).toEqual({ status: "computed", saleValueUsd: 112.5, starlinkCostUsd: 100, profitUsd: 12.5 });
  });

  it("computes a loss as a negative profitUsd", () => {
    const profit = computeShipmentProfit(
      shipment({ starlinkCost: { status: "settled", currencyCode: "USD", amount: 150, paidAt: "2026-09-21" } }),
    );
    expect(profit.status).toBe("computed");
    expect(profit.profitUsd).toBeCloseTo(-37.5);
  });

  it("converts a non-USD Starlink cost using its own rate snapshot: 98,000 ARS @1USD=1,400ARS = 70 USD", () => {
    const profit = computeShipmentProfit(
      shipment({
        amount: 100,
        currency: "USD",
        saleRate: undefined,
        starlinkCost: {
          status: "settled",
          currencyCode: "ARS",
          amount: 98000,
          rate: { rateFromUsd: 1400, usdValue: 70 },
          paidAt: "2026-09-21",
        },
      }),
    );
    expect(profit).toEqual({ status: "computed", saleValueUsd: 100, starlinkCostUsd: 70, profitUsd: 30 });
  });

  it("is a USD sale with no saleRate needed at all", () => {
    const profit = computeShipmentProfit(shipment({ amount: 200, currency: "USD", saleRate: undefined }));
    expect(profit.saleValueUsd).toBe(200);
  });

  it("is 'pending' for a shipment marked D (not yet settled)", () => {
    expect(computeShipmentProfit(shipment({ starlinkCost: { status: "pending" } }))).toEqual({ status: "pending" });
  });

  it("is 'pending' when settled but missing the sale-side USD rate", () => {
    expect(computeShipmentProfit(shipment({ saleRate: undefined }))).toEqual({ status: "pending" });
  });

  it("is 'pending' when settled but missing the cost-side USD rate", () => {
    const profit = computeShipmentProfit(
      shipment({ starlinkCost: { status: "settled", currencyCode: "ARS", amount: 1000, paidAt: "2026-09-21" } }),
    );
    expect(profit).toEqual({ status: "pending" });
  });

  it("is 'legacy' for a debit entry with no starlinkCost info at all", () => {
    expect(computeShipmentProfit(shipment({ starlinkCost: undefined }))).toEqual({ status: "legacy" });
  });

  it("is 'legacy' for a credit entry (never a shipment)", () => {
    expect(computeShipmentProfit(payment())).toEqual({ status: "legacy" });
  });
});

describe("computeDeviceAccountingSummary", () => {
  it("is all-zero/no-data for an empty device", () => {
    const summary = computeDeviceAccountingSummary([]);
    expect(summary.shipmentCount).toBe(0);
    expect(summary.netResult).toEqual({ status: "no-data" });
    expect(summary.totalSaleValueUsd).toBe(0);
    expect(summary.totalPaidByCustomer).toEqual({});
    expect(summary.totalRemainingDebt).toEqual({});
  });

  it("is 'complete' with the right net when every shipment is settled", () => {
    const summary = computeDeviceAccountingSummary([
      shipment({ id: "s1" }), // profit +12.5
      shipment({
        id: "s2",
        starlinkCost: { status: "settled", currencyCode: "USD", amount: 150, paidAt: "2026-09-21" },
      }), // profit -37.5
    ]);
    expect(summary.shipmentCount).toBe(2);
    expect(summary.settledShipmentCount).toBe(2);
    expect(summary.pendingShipmentCount).toBe(0);
    expect(summary.totalSaleValueUsd).toBeCloseTo(225); // 112.5 * 2
    expect(summary.totalSettledStarlinkCostUsd).toBeCloseTo(250); // 100 + 150
    expect(summary.totalProfitsUsd).toBeCloseTo(12.5);
    expect(summary.totalLossesUsd).toBeCloseTo(37.5);
    expect(summary.netResult).toEqual({ status: "complete", netUsd: -25 });
  });

  it("is 'incomplete' and restricts netUsd to the settled subset when a D shipment exists", () => {
    const summary = computeDeviceAccountingSummary([
      shipment({ id: "s1" }), // settled, profit +12.5
      shipment({ id: "s2", starlinkCost: { status: "pending" } }), // D, unsettled
    ]);
    expect(summary.shipmentCount).toBe(2);
    expect(summary.settledShipmentCount).toBe(1);
    expect(summary.pendingShipmentCount).toBe(1);
    expect(summary.netResult).toEqual({ status: "incomplete", netUsd: 12.5 });
    // Sale value still counts both shipments - it's a property of the sale, not of cost settlement.
    expect(summary.totalSaleValueUsd).toBeCloseTo(225);
    // Only the settled shipment's cost counts.
    expect(summary.totalSettledStarlinkCostUsd).toBeCloseTo(100);
  });

  it("is 'incomplete' with no netUsd when nothing is settled yet", () => {
    const summary = computeDeviceAccountingSummary([shipment({ starlinkCost: { status: "pending" } })]);
    expect(summary.netResult).toEqual({ status: "incomplete" });
  });

  it("counts legacy shipments separately and excludes them from every USD total", () => {
    const summary = computeDeviceAccountingSummary([
      shipment({ id: "s1" }),
      shipment({ id: "legacy-1", starlinkCost: undefined, saleRate: undefined }),
    ]);
    expect(summary.shipmentCount).toBe(2);
    expect(summary.legacyShipmentCount).toBe(1);
    expect(summary.settledShipmentCount).toBe(1);
    // The legacy entry has no saleRate, so its sale value cannot be resolved to USD and is skipped.
    expect(summary.totalSaleValueUsd).toBeCloseTo(112.5);
  });

  it("sums customer payments per currency, never converted or mixed", () => {
    const summary = computeDeviceAccountingSummary([
      payment({ id: "p1", amount: 20000, currency: "MRU" }),
      payment({ id: "p2", amount: 30, currency: "USD" }),
      payment({ id: "p3", amount: 5000, currency: "MRU" }),
    ]);
    expect(summary.totalPaidByCustomer).toEqual({ MRU: 25000, USD: 30 });
  });

  it("reports only the positive (owed) remaining balance per currency", () => {
    const summary = computeDeviceAccountingSummary([
      shipment({ id: "s1", amount: 45000, currency: "MRU" }), // debit +45000 MRU
      payment({ id: "p1", amount: 20000, currency: "MRU" }), // credit -20000 MRU
      payment({ id: "p2", amount: 50, currency: "USD" }), // credit -50 USD -> account in credit for USD
    ]);
    expect(summary.totalRemainingDebt).toEqual({ MRU: 25000 });
  });
});
