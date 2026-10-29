import { describe, expect, it } from "vitest";
import { computeShipmentProfit } from "./accountingStore";
import { applyLedgerPaymentsToCash } from "./cashStore";
import { clientRecordNote, isPlainAdjustment, modeKind, noCost, showsCost } from "./ledgerModes";
import { isIncompletePaymentRateEntry, isShipmentEntry, type LedgerEntry } from "./ledgerStore";

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({ id: "x", kind: "debit", amount: 1000, currency: "MRU", note: "", email: "", date: "2026-10-29", createdAt: "2026-10-29T10:00:00.000Z", ...over });

describe("🧾 the «دفعة» window's three tabs (his Oct 29 2026 ask)", () => {
  it("each tab's kind and cost section", () => {
    expect(modeKind("travel", "credit")).toBe("debit");
    expect(modeKind("pay", "debit")).toBe("credit");
    expect(modeKind("add", "credit")).toBe("credit");
    expect(showsCost("add", "debit", true, "device")).toBe(true);
    expect(showsCost("add", "debit", true, "client")).toBe(false);
    expect(showsCost("travel", "debit", false, "device")).toBe(false);
    expect(showsCost("add", "credit", true, "device")).toBe(false);
    expect(isPlainAdjustment("add", "debit", false)).toBe(true);
    expect(isPlainAdjustment("add", "credit", true)).toBe(true);
    expect(isPlainAdjustment("add", "debit", true)).toBe(false);
    expect(isPlainAdjustment("travel", "debit", false)).toBe(false);
    expect(clientRecordNote("travel", "DEMO", " x ")).toBe("🛂 توثيق · DEMO · x");
  });

  it("🛂 a travel registration with no cost: the whole price is profit", () => {
    const sale = entry({ amount: 4000, saleRate: { rateFromUsd: 400, usdValue: 10 }, starlinkCost: noCost("2026-10-29"), purpose: "travel" });
    const p = computeShipmentProfit(sale);
    expect(p.status).toBe("computed");
    expect(p.status === "computed" && p.profitUsd).toBe(10);
  });

  it("➕ a plain balance is no shipment, no incomplete rate and no cash", () => {
    const owes = entry({ adjustment: true });
    const gives = entry({ id: "y", kind: "credit", adjustment: true });
    expect(isShipmentEntry(owes)).toBe(false);
    expect(isIncompletePaymentRateEntry(gives)).toBe(false);
    expect(applyLedgerPaymentsToCash([], [], [owes, gives], "DEMO")).toEqual([]);
    expect(applyLedgerPaymentsToCash([], [], [entry({ id: "z", kind: "credit" })], "DEMO")).toHaveLength(1);
  });
});
