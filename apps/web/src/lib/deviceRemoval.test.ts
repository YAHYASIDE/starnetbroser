import { describe, expect, it } from "vitest";
import { CashEntry } from "./cashStore";
import { deviceRecordsQuestion, deviceRecordsSummary, hasDeviceRecords, removeDeviceRecords } from "./deviceRemoval";
import { LedgerEntry } from "./ledgerStore";
import { PaymentAllocation } from "./paymentAllocationStore";
import { PreviousDebt } from "./previousDebt";

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 10,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

function allocation(id: string, paymentEntryId: string, shipmentEntryId: string): PaymentAllocation {
  return { id, paymentEntryId, shipmentEntryId, amount: 5, currency: "USD", createdAt: "2026-09-20T10:00:00.000Z" };
}

function cash(id: string, sourceId?: string): CashEntry {
  return {
    id,
    kind: "in",
    amount: 5,
    currencyCode: "USD",
    date: "2026-09-20",
    category: "دفعة جهاز",
    note: "",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...(sourceId ? { sourceId, sourceKind: "device-payment" } : {}),
  } as CashEntry;
}

function debt(id: string, accountId: string): PreviousDebt {
  return { id, accountId, date: "2026-09-01", amountUsd: 20, createdAt: "2026-09-01T10:00:00.000Z" };
}

describe("deviceRemoval", () => {
  const ledger = {
    gone: [entry({ id: "ship" }), entry({ id: "pay", kind: "credit" })],
    kept: [entry({ id: "other-ship" }), entry({ id: "other-pay", kind: "credit" })],
  };
  const allocations = {
    gone: [allocation("a1", "pay", "ship")],
    // A payment on the kept device that was allocated to the deleted device's shipment.
    kept: [allocation("a2", "other-pay", "ship"), allocation("a3", "other-pay", "other-ship")],
  };
  const cashEntries = [cash("c1", "pay"), cash("c2", "other-pay"), cash("c3")];
  const previousDebts = [debt("p1", "gone"), debt("p2", "kept")];

  it("summarises what a device still has", () => {
    const summary = deviceRecordsSummary("gone", ledger, previousDebts);
    expect(summary).toEqual({ entryCount: 2, previousDebtCount: 1 });
    expect(hasDeviceRecords(summary)).toBe(true);
    expect(hasDeviceRecords(deviceRecordsSummary("new", ledger, previousDebts))).toBe(false);
  });

  it("removes the device's entries, their cash, every allocation touching them and its previous debts", () => {
    const next = removeDeviceRecords({ ledger, allocations, cash: cashEntries, previousDebts }, "gone", "Kit 1");
    expect(Object.keys(next.ledger)).toEqual(["kept"]);
    expect(next.ledger.kept).toBe(ledger.kept);
    expect(next.allocations).toEqual({ kept: [allocation("a3", "other-pay", "other-ship")] });
    expect(next.cash.map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(next.previousDebts.map((d) => d.id)).toEqual(["p2"]);
  });

  it("asks only when there is something to delete", () => {
    expect(deviceRecordsQuestion("Kit 1", { entryCount: 0, previousDebtCount: 0 })).toBeNull();
    const question = deviceRecordsQuestion("Kit 1", { entryCount: 3, previousDebtCount: 1 });
    expect(question).toContain("3 عملية و 1 دين سابق");
    expect(question).toContain("Kit 1");
  });
});
