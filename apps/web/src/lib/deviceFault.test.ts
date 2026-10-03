import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import { computeShipmentProfit, shipmentProfitDate } from "./accountingStore";
import { isFaulty, openDebtEntries, restoreWaivedDebts, waiveOpenDebts } from "./deviceFault";
import { listOpenShipmentDebts } from "./starlinkDebt";
import { shipmentRepShareUsd } from "./repStore";
import { computeRenewalReminders } from "./reminders";

function shipment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "s1",
    kind: "debit",
    amount: 100,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-10",
    createdAt: "2026-09-10T10:00:00.000Z",
    starlinkCost: { status: "pending", currencyCode: "USD", amount: 70 },
    representativeId: "r1",
    representativeCommissionPercent: 50,
    ...overrides,
  };
}

const now = new Date("2026-09-26T12:00:00.000Z");

describe("burned device with an open D", () => {
  const entries = [
    shipment(),
    shipment({ id: "old", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-08-10" } }),
    shipment({ id: "pay", kind: "credit", starlinkCost: undefined }),
  ];

  it("drops the D: the whole sale is profit on the fault day, the rep keeps his percent", () => {
    const { entries: next, count } = waiveOpenDebts(entries, "2026-09-26", { MRU: 40 }, now);
    expect(count).toBe(1);
    const burned = next[0]!;
    expect(openDebtEntries(next)).toHaveLength(0);
    expect(listOpenShipmentDebts({ d1: next })).toHaveLength(0);
    expect(computeShipmentProfit(burned)).toMatchObject({ status: "computed", profitUsd: 100, profitMru: 4000 });
    expect(shipmentProfitDate(burned)).toBe("2026-09-26");
    expect(shipmentRepShareUsd(burned)).toBe(50);
    // The customer still owes the sale; the settled and payment entries are untouched.
    expect(burned.amount).toBe(100);
    expect(next[1]).toBe(entries[1]);
    expect(next[2]).toBe(entries[2]);
  });

  it("drops a cost owed in another currency to 0 as well", () => {
    const mru = shipment({ starlinkCost: { status: "pending", currencyCode: "MRU", amount: 2800, rate: { rateFromUsd: 40, usdValue: 70 } } });
    const burned = waiveOpenDebts([mru], "2026-09-26", { MRU: 40 }, now).entries[0]!;
    expect(computeShipmentProfit(burned)).toMatchObject({ status: "computed", profitUsd: 100 });
    expect(restoreWaivedDebts([burned]).entries[0]!.starlinkCost).toEqual(mru.starlinkCost);
  });

  it("brings the D back exactly as it was once the device is repaired", () => {
    const waived = waiveOpenDebts(entries, "2026-09-26", { MRU: 40 }, now).entries;
    const { entries: restored, count } = restoreWaivedDebts(waived);
    expect(count).toBe(1);
    expect(restored[0]).toEqual({ ...entries[0], profitCurrencyRates: undefined });
    expect(computeShipmentProfit(restored[0]!).status).toBe("pending");
    expect(restored[1]).toBe(waived[1]);
  });
});

describe("faulty devices and renewal reminders", () => {
  const base = { id: "a", name: "x", rechargeDate: "2026-01-01" } as unknown as StarlinkAccountSummary;
  it("leaves a faulty device out of the renewal reminders", () => {
    const faulty = { ...base, id: "b", deviceFault: { reason: "burned" as const, note: "", reportedAt: now.toISOString() } };
    expect(isFaulty(faulty)).toBe(true);
    expect(computeRenewalReminders([base, faulty]).map((r) => r.account.id)).toEqual(["a"]);
  });
});
