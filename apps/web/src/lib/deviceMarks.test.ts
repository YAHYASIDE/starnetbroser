import { describe, expect, it } from "vitest";
import { computeDeviceMarks } from "./deviceMarks";
import { computeExpectedShipmentProfit, summarizeDeviceProfit } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";
import type { PaymentAllocation } from "./paymentAllocationStore";

const ship = (id: string, date: string, status: "pending" | "settled", amount = 43000): LedgerEntry => ({
  id, kind: "debit", amount, currency: "MRU", note: "", email: "", date, createdAt: `${date}T00:00:00Z`,
  saleRate: { rateFromUsd: 400, usdValue: amount / 400 },
  starlinkCost: { status, currencyCode: "USD", amount: 80, paidAt: status === "settled" ? date : undefined },
  profitCurrencyRates: status === "settled" ? { MRU: 400 } : undefined,
});
const pay = (id: string, amount: number): LedgerEntry => ({
  id, kind: "credit", amount, currency: "MRU", note: "", email: "", date: "2026-09-20", createdAt: "2026-09-20T00:00:00Z",
});
const alloc = (paymentEntryId: string, shipmentEntryId: string, amount: number): PaymentAllocation => ({
  id: `${paymentEntryId}-${shipmentEntryId}`, paymentEntryId, shipmentEntryId, amount, currency: "MRU", createdAt: "x",
});

describe("computeDeviceMarks", () => {
  it("D red while any shipment is unpaid to Starlink; P green once the latest shipment is paid", () => {
    const entries = [ship("s1", "2026-09-09", "pending"), pay("p1", 45000)];
    expect(computeDeviceMarks(entries, [alloc("p1", "s1", 43000)])).toEqual({ d: "pending", p: "paid" });
  });

  it("orange P for a partly paid latest shipment, none when unpaid", () => {
    const entries = [ship("s1", "2026-09-09", "pending"), pay("p1", 10000), ship("s0", "2026-08-01", "settled", 5000)];
    expect(computeDeviceMarks(entries, [alloc("p1", "s0", 5000), alloc("p1", "s1", 5000)]).p).toBe("partial");
    expect(computeDeviceMarks([ship("s1", "2026-09-09", "pending")], []).p).toBeNull();
  });

  it("✓ once settled, and treats a fully cleared balance as paid even without allocations", () => {
    expect(computeDeviceMarks([ship("s1", "2026-09-09", "settled"), pay("p1", 43000)], [])).toEqual({ d: "settled", p: "paid" });
    expect(computeDeviceMarks([], [])).toEqual({ d: null, p: null });
  });
});

describe("expected profit", () => {
  it("computes a D shipment's profit from its recorded cost, and confirms it once settled", () => {
    // sale 43,000 MRU at 400 = 107.5 USD, cost 80 USD
    expect(computeExpectedShipmentProfit(ship("s", "2026-09-09", "pending"))).toEqual({ status: "expected", profitUsd: 27.5 });
    expect(computeExpectedShipmentProfit(ship("s", "2026-09-09", "settled"))).toEqual({ status: "confirmed", profitUsd: 27.5, profitMru: 11000 });
    const summary = summarizeDeviceProfit([ship("a", "2026-09-09", "pending"), ship("b", "2026-08-09", "settled"), pay("p", 1)]);
    expect(summary).toEqual({ confirmedUsd: 27.5, confirmedMru: 11000, confirmedCount: 1, expectedUsd: 27.5, expectedCount: 1 });
  });
});
