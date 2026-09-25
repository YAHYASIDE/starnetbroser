import { describe, expect, it } from "vitest";
import { buildRenewalShipment, validateRenewalPlan } from "./renewalPlan";
import { computeShipmentProfit } from "./accountingStore";
import type { CurrencyStore } from "./currencyStore";

const now = "2026-09-25T00:00:00.000Z";
const store: CurrencyStore = {
  USD: { code: "USD", name: "دولار", symbol: "$", rateFromUsd: 1, updatedAt: now, enabled: true },
  MRU: { code: "MRU", name: "أوقية", symbol: "MRU", rateFromUsd: 40, updatedAt: now, enabled: true },
  SIFA: { code: "SIFA", name: "سيفا", symbol: "SIFA", rateFromUsd: 600, updatedAt: now, enabled: true },
};
const plan = { saleAmount: 2000, saleCurrency: "MRU", costAmount: 30, costCurrency: "USD" };

describe("buildRenewalShipment", () => {
  it("builds a settled shipment with locked rates, so its profit is computable at once", () => {
    const result = buildRenewalShipment(plan, store, "2026-09-25", { representative: { id: "r1", commissionPercent: 50 } });
    if (!result.ok) throw new Error(result.message);
    const e = result.entry;
    expect(e).toMatchObject({ kind: "debit", amount: 2000, currency: "MRU", date: "2026-09-25", representativeId: "r1" });
    expect(e.saleRate).toEqual({ rateFromUsd: 40, usdValue: 50 });
    expect(e.starlinkCost).toMatchObject({ status: "settled", currencyCode: "USD", amount: 30, paidAt: "2026-09-25" });
    expect(computeShipmentProfit(e).profitUsd).toBe(20);
  });

  it("refuses instead of guessing when a rate is missing", () => {
    const noSifa = { USD: store.USD!, MRU: store.MRU! };
    expect(buildRenewalShipment(plan, noSifa, "2026-09-25")).toEqual({ ok: false, message: "سعر السيفا مقابل الدولار غير موجود في الإعدادات" });
    const r = buildRenewalShipment({ ...plan, costCurrency: "EUR" }, store, "2026-09-25");
    expect(r.ok).toBe(false);
  });

  it("validates the plan", () => {
    expect(validateRenewalPlan({ ...plan, saleAmount: 0 })).not.toBeNull();
    expect(validateRenewalPlan({ ...plan, saleCurrency: "EUR" })).not.toBeNull();
    expect(validateRenewalPlan(plan)).toBeNull();
  });
});
