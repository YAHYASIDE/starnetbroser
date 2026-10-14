import { describe, expect, it } from "vitest";
import { entriesAfterProfitReset, startProfitFresh, undoProfitFresh } from "./profitReset";
import { settleShipmentCost } from "./starlinkDebt";
import type { LedgerEntry } from "./ledgerStore";
import type { RepresentativeStore } from "./repStore";

function shipment(id: string, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id,
    kind: "debit",
    amount: 45000,
    currency: "MRU",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    saleRate: { rateFromUsd: 40, usdValue: 1125 },
    starlinkCost: { status: "pending", currencyCode: "USD", amount: 1075 },
    ...overrides,
  };
}

const reps: RepresentativeStore = {
  r1: { id: "r1", name: "أ", commissionPercent: 50, createdAt: "", updatedAt: "" },
  r2: { id: "r2", name: "ب", commissionPercent: 30, resetFrom: { date: "2026-08-01", at: "" }, createdAt: "", updatedAt: "" },
};

describe("fresh start for profit", () => {
  const now = new Date(2026, 8, 26, 12, 0, 0);

  it("starts profit from today without touching the representatives", () => {
    const { reset, repStore } = startProfitFresh(reps, now);
    expect(reset.date).toBe("2026-09-26");
    // 🤝 never touches the representatives (his Oct 12 2026 rule)
    expect(repStore).toBe(reps);
    expect(reset.previousRepResets).toEqual({});
    expect(undoProfitFresh(reset, repStore)).toBe(reps);
    // an older reset that did restart them still undoes them
    const older = { ...reset, previousRepResets: { r1: null, r2: { date: "2026-08-01", at: "" } } };
    const restarted = { r1: { ...reps.r1!, resetFrom: { date: "2026-09-26", at: "" } }, r2: { ...reps.r2!, resetFrom: { date: "2026-09-26", at: "" } } };
    const undone = undoProfitFresh(older, restarted);
    expect(undone.r1!.resetFrom).toBeUndefined();
    expect(undone.r2!.resetFrom).toEqual({ date: "2026-08-01", at: "" });
  });

  it("counts only profit that became real after it - a D paid later the same day counts", () => {
    const { reset } = startProfitFresh(reps, now);
    const paidBefore = shipment("old", { starlinkCost: { status: "settled", currencyCode: "USD", amount: 1075, paidAt: "2026-09-10" } });
    const openD = shipment("d");
    const paidAfter = settleShipmentCost(shipment("new"), { date: "2026-09-26", profitRates: {}, fromCard: true });
    // settledAt is "now" of the test run; make it after the reset moment explicitly.
    paidAfter.starlinkCost = { ...paidAfter.starlinkCost!, settledAt: "2026-09-26T13:00:00.000Z" };
    const kept = entriesAfterProfitReset([paidBefore, openD, paidAfter], reset).map((e) => e.id);
    expect(kept).toEqual(["d", "new"]);
    expect(entriesAfterProfitReset([paidBefore], null)).toHaveLength(1);
  });
});
