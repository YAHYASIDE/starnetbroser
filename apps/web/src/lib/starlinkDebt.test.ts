import { describe, expect, it } from "vitest";
import {
  buildCardStatement,
  cardShortfallForSuspended,
  listCardPayments,
  listOpenShipmentDebts,
  listSuspendedWithDebt,
  postCardTopUpToCash,
  recordCardTopUp,
  settleShipments,
  totalOpenDebtUsd,
} from "./starlinkDebt";
import { computeShipmentProfit, shipmentProfitDate } from "./accountingStore";
import { filterEntriesByProfitDate } from "./reportPeriod";
import { computeDeviceMarks } from "./deviceMarks";
import type { LedgerEntry } from "./ledgerStore";
import type { StarlinkAccountSummary } from "@starnet/shared";

function shipment(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: "s",
    kind: "debit",
    amount: 45000,
    currency: "MRU",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    saleRate: { rateFromUsd: 40, usdValue: 1125 },
    starlinkCost: { status: "pending", currencyCode: "USD", amount: 107.5 },
    ...overrides,
  };
}

const ledger = {
  d1: [shipment({ id: "a" }), shipment({ id: "old", date: "2026-08-20", starlinkCost: { status: "settled", currencyCode: "USD", amount: 100, paidAt: "2026-09-04", paidVia: "card" } })],
  d2: [shipment({ id: "b", date: "2026-09-22", starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } })],
  d3: [shipment({ id: "c", starlinkCost: { status: "pending" } })], // D without an amount: nothing owed yet
};

describe("open D's (what we owe Starlink)", () => {
  it("lists every D with a real cost, oldest first, and totals it", () => {
    const debts = listOpenShipmentDebts(ledger);
    expect(debts.map((d) => [d.entry.id, d.costUsd])).toEqual([["a", 107.5], ["b", 60]]);
    expect(totalOpenDebtUsd(debts)).toBe(167.5);
    expect(debts[0].expectedProfitUsd).toBeCloseTo(1017.5);
  });

  it("the D mark shows only where money is owed to Starlink", () => {
    expect(computeDeviceMarks(ledger.d1, []).d).toBe("pending");
    expect(computeDeviceMarks(ledger.d3, []).d).toBeNull();
  });

  it("flags devices Starlink suspended while their D is open", () => {
    const accounts = [
      { id: "d1", serviceStatus: "suspended" },
      { id: "d2", serviceStatus: "active" },
    ] as StarlinkAccountSummary[];
    const flagged = listSuspendedWithDebt(accounts, listOpenShipmentDebts(ledger));
    expect(flagged.map((f) => [f.account.id, f.costUsd])).toEqual([["d1", 107.5]]);
  });
});

describe("paying Starlink", () => {
  it("settles one or several D's on the payment day - the day the profit lands", () => {
    const next = settleShipments(ledger, [{ accountId: "d1", entryId: "a" }, { accountId: "d2", entryId: "b" }], {
      date: "2026-10-04",
      profitRates: { MRU: 40, SIFA: 600 },
      fromCard: true,
    });
    const a = next.d1.find((e) => e.id === "a")!;
    expect(a.starlinkCost).toMatchObject({ status: "settled", amount: 107.5, paidAt: "2026-10-04", paidVia: "card" });
    expect(a.profitCurrencyRates).toEqual({ MRU: 40, SIFA: 600 });
    expect(computeShipmentProfit(a).profitUsd).toBeCloseTo(1017.5);
    expect(shipmentProfitDate(a)).toBe("2026-10-04");
    expect(listOpenShipmentDebts(next)).toHaveLength(0);
    // Sold in September, paid in October: the profit is October's.
    const oct4 = new Date(2026, 9, 4, 12);
    expect(filterEntriesByProfitDate(next.d1, "today", oct4).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("the كاش card", () => {
  it("balance = top-ups − costs paid from it, with a running statement", () => {
    const top = recordCardTopUp([], { amountUsd: 200, paidAmount: 8000, paidCurrency: "MRU", date: "2026-09-01" });
    if (!top.ok) throw new Error(top.message);
    const paid = settleShipments(ledger, [{ accountId: "d1", entryId: "a" }], { date: "2026-10-04", profitRates: {}, fromCard: true });
    const statement = buildCardStatement(top.list, listCardPayments(paid));
    expect(statement.balanceUsd).toBeCloseTo(200 - 100 - 107.5);
    expect(statement.rows.map((r) => [r.type, r.amountUsd, r.balanceAfter])).toEqual([
      ["payment", -107.5, -7.5],
      ["payment", -100, 100],
      ["topup", 200, 200],
    ]);
    expect(recordCardTopUp([], { amountUsd: 0, paidAmount: 1, paidCurrency: "MRU", date: "x" }).ok).toBe(false);
  });

  it("a top-up takes its money out of الصندوق, linked to it", () => {
    const top = recordCardTopUp([], { amountUsd: 200, paidAmount: 8000, paidCurrency: "MRU", date: "2026-09-01" });
    if (!top.ok) throw new Error(top.message);
    const cash = postCardTopUpToCash([], top.topUp);
    expect(cash).toHaveLength(1);
    expect(cash[0]).toMatchObject({ kind: "out", amount: 8000, currencyCode: "MRU", sourceId: top.topUp.id, sourceKind: "card-topup" });
  });
});

describe("cardShortfallForSuspended", () => {
  const suspended = (costUsd: number) => ({ account: { id: "a" } as never, debts: [], costUsd });
  it("is what the card lacks to pay every suspended device's D", () => {
    expect(cardShortfallForSuspended([suspended(60), suspended(40)], 70)).toBe(30);
  });
  it("is zero when the card covers them, and a negative balance counts as empty", () => {
    expect(cardShortfallForSuspended([suspended(60)], 100)).toBe(0);
    expect(cardShortfallForSuspended([suspended(60)], -20)).toBe(60);
    expect(cardShortfallForSuspended([], 0)).toBe(0);
  });
});
