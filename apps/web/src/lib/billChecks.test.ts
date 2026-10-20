import { describe, expect, it } from "vitest";
import { planBillChecks } from "./billChecks";
import { awaitingCost } from "./awaitingBill";
import type { LedgerEntry } from "./ledgerStore";

const T0 = new Date("2026-10-19T10:00:00Z");
const charge = (id: string, cost: LedgerEntry["starlinkCost"]): LedgerEntry =>
  ({ id, kind: "debit", amount: 1, currency: "USD", note: "", email: "", date: "2026-10-19", createdAt: T0.toISOString(), starlinkCost: cost }) as LedgerEntry;

describe("⏳ background invoice checks", () => {
  it("a new waiting charge schedules its device once; a filled one drops the device's checks", () => {
    const ledger = { d1: [charge("e1", awaitingCost("USD", T0))], d2: [charge("e2", { status: "pending", currencyCode: "USD", amount: 40 })] };
    const first = planBillChecks(ledger, {}, T0);
    expect(first.schedule).toEqual([{ accountId: "d1", delaysMs: [30 * 60_000, 60 * 60_000, 120 * 60_000, 360 * 60_000, 720 * 60_000] }]);
    expect(first.next).toEqual({ e1: "d1" });
    expect(planBillChecks(ledger, first.next, T0).schedule).toEqual([]);
    const filled = { d1: [charge("e1", { status: "pending", currencyCode: "USD", amount: 70 })] };
    expect(planBillChecks(filled, first.next, T0)).toEqual({ schedule: [], cancel: ["d1"], next: {} });
  });
});
