import { describe, expect, it } from "vitest";
import { calculateProfit, convert, priceForProfit } from "./profitCalculator";

describe("profit calculator", () => {
  const rates = { MRU: 40, SIFA: 600 };
  it("converts the cost into the sale currency and splits the rep share", () => {
    expect(convert(50, "USD", "MRU", rates)).toBe(2000);
    expect(convert(600, "SIFA", "USD", rates)).toBe(1);
    expect(convert(1, "XXX", "USD", rates)).toBeNull();
    const r = calculateProfit({ costAmount: 50, costCurrency: "USD", saleAmount: 3000, saleCurrency: "MRU", rates, repPercent: 50, extraCost: 200 })!;
    expect(r).toMatchObject({ cost: 2200, profit: 800, repShare: 400, net: 400 });
    expect(r.margin).toBeCloseTo(26.67, 1);
    expect(calculateProfit({ costAmount: 100, costCurrency: "USD", saleAmount: 3000, saleCurrency: "MRU", rates, repPercent: 50 })!.repShare).toBe(0);
    expect(calculateProfit({ costAmount: 1, costCurrency: "USD", saleAmount: 0, saleCurrency: "MRU", rates })).toBeNull();
  });

  it("suggests a price for a wanted profit, rounded up", () => {
    expect(priceForProfit({ costAmount: 50, costCurrency: "USD", saleCurrency: "MRU", rates }, 1000, 100)).toBe(3000);
    expect(priceForProfit({ costAmount: 50.5, costCurrency: "USD", saleCurrency: "MRU", rates }, 1000, 100)).toBe(3100);
  });
});
