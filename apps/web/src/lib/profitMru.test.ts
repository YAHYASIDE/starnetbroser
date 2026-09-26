import { describe, expect, it } from "vitest";
import { entryUsdToMru, formatProfitMru, sumProfitMru } from "./profitMru";
import type { LedgerEntry } from "./ledgerStore";

const ship = (id: string, status: "pending" | "settled", lockedMru?: number): LedgerEntry => ({
  id, kind: "debit", amount: 43000, currency: "MRU", note: "", email: "", date: "2026-09-09", createdAt: "x",
  saleRate: { rateFromUsd: 400, usdValue: 107.5 },
  starlinkCost: { status, currencyCode: "USD", amount: 80, paidAt: status === "settled" ? "2026-09-10" : undefined },
  profitCurrencyRates: lockedMru !== undefined ? { MRU: lockedMru } : undefined,
});

describe("profit in MRU", () => {
  it("uses each settled shipment's locked rate, today's rate for expected (D) profit", () => {
    // profit = 107.5 - 80 = 27.5 USD
    const t = sumProfitMru([ship("a", "settled", 400), ship("b", "pending")], 410);
    expect(t).toEqual({ confirmedMru: 11000, confirmedExact: true, expectedMru: 11275, expectedCount: 1, confirmedCount: 1 });
  });

  it("falls back to today's rate for a settled shipment with no locked MRU rate", () => {
    const t = sumProfitMru([ship("a", "settled")], 400);
    expect(t.confirmedMru).toBe(11000);
    expect(t.confirmedExact).toBe(false);
    expect(entryUsdToMru(10, ship("a", "settled", 390), 400)).toBe(3900);
  });
});

describe("formatProfitMru", () => {
  it("prefers the locked MRU, then today's rate (≈), then USD", () => {
    expect(formatProfitMru(27.5, 400, 11000)).toBe("11,000 أوقية");
    expect(formatProfitMru(-27.5, 400)).toBe("≈ 11,000 أوقية");
    expect(formatProfitMru(27.5, undefined)).toBe("27.5 USD");
  });
});
