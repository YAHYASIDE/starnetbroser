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
const plan = { saleAmount: 2000, saleCurrency: "MRU", costAmount: 30, costCurrency: "USD", costPending: false };

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

  it("records the Starlink cost as D (pending, no profit rates yet) when asked or by the plan's default", () => {
    const eur: CurrencyStore = { ...store, EUR: { code: "EUR", name: "يورو", symbol: "€", rateFromUsd: 0.8, updatedAt: now, enabled: true } };
    const asked = buildRenewalShipment({ ...plan, costCurrency: "EUR", costAmount: 24 }, eur, "2026-09-25", { costPending: true });
    if (!asked.ok) throw new Error(asked.message);
    expect(asked.entry.starlinkCost).toEqual({ status: "pending", currencyCode: "EUR", amount: 24, rate: { rateFromUsd: 0.8, usdValue: 30 } });
    expect(asked.entry.profitCurrencyRates).toBeUndefined();
    const byPlan = buildRenewalShipment({ ...plan, costPending: true }, store, "2026-09-25");
    expect(byPlan.ok && byPlan.entry.starlinkCost?.status).toBe("pending");
    const overridden = buildRenewalShipment({ ...plan, costPending: true }, store, "2026-09-25", { costPending: false });
    expect(overridden.ok && overridden.entry.starlinkCost?.status).toBe("settled");
  });

  it("a renewal is D by default - we borrow the month from Starlink", () => {
    const { costPending: _ignored, ...legacyPlan } = plan;
    const result = buildRenewalShipment(legacyPlan, store, "2026-09-25");
    expect(result.ok && result.entry.starlinkCost?.status).toBe("pending");
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
