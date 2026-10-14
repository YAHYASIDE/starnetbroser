import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CurrencyStore } from "./currencyStore";
import { computeDeviceMargins, marginsTelegramLine } from "./deviceMargins";

const now = "2026-10-06T00:00:00.000Z";
const currencies: CurrencyStore = {
  USD: { code: "USD", name: "دولار", symbol: "$", rateFromUsd: 1, updatedAt: now, enabled: true },
  MRU: { code: "MRU", name: "أوقية", symbol: "MRU", rateFromUsd: 40, updatedAt: now, enabled: true },
} as CurrencyStore;

const dev = (id: string, plan?: StarlinkAccountSummary["renewalPlan"], extra: Partial<StarlinkAccountSummary> = {}) =>
  ({ id, name: `جهاز ${id}`, renewalPlan: plan, ...extra }) as StarlinkAccountSummary;

describe("🔻 losing and weak devices", () => {
  it("judges each device at today's rates: losing, weak (< 10%), fine", () => {
    const m = computeDeviceMargins(
      [
        dev("lose", { saleAmount: 1600, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" }), // 40$ − 50$
        dev("weak", { saleAmount: 2000, saleCurrency: "MRU", costAmount: 47, costCurrency: "USD" }), // 50$ − 47$ = 6%
        dev("fine", { saleAmount: 2400, saleCurrency: "MRU", costAmount: 40, costCurrency: "USD" }), // 60$ − 40$
      ],
      currencies,
    );
    expect(m.losing.map((d) => d.id)).toEqual(["lose"]);
    expect(m.losing[0]!.profitUsd).toBeCloseTo(-10);
    expect(m.weak.map((d) => d.id)).toEqual(["weak"]);
    expect(m.weak[0]!.percent).toBeCloseTo(6);
    expect(m.losing[0]).toMatchObject({ sale: { amount: 1600, currency: "MRU", rateFromUsd: 40 }, cost: { amount: 50, currency: "USD", rateFromUsd: 1 }, suspicious: false });
  });

  it("flags numbers that can't be right (his real case: 15 أوقية sale vs 8,000$ cost)", () => {
    const m = computeDeviceMargins([dev("typo", { saleAmount: 15, saleCurrency: "MRU", costAmount: 8000, costCurrency: "USD" })], currencies);
    expect(m.losing[0]).toMatchObject({ suspicious: true });
    expect(m.losing[0]!.saleUsd).toBeCloseTo(0.375);
  });

  it("a dollar rise turns a device into a loser without touching its record", () => {
    const plan = { saleAmount: 2000, saleCurrency: "MRU", costAmount: 45, costCurrency: "USD" };
    expect(computeDeviceMargins([dev("a", plan)], currencies).losing).toHaveLength(0);
    const dearDollar = { ...currencies, MRU: { ...currencies.MRU!, rateFromUsd: 46 } } as CurrencyStore;
    expect(computeDeviceMargins([dev("a", plan)], dearDollar).losing).toHaveLength(1);
  });

  it("counts devices it can't judge, and skips deleted / archived / faulty ones", () => {
    const m = computeDeviceMargins(
      [
        dev("noPlan"),
        dev("noCost", { saleAmount: 2000, saleCurrency: "MRU", costAmount: 0, costCurrency: "USD" }),
        dev("noRate", { saleAmount: 30000, saleCurrency: "SIFA", costAmount: 50, costCurrency: "USD" }),
        dev("gone", { saleAmount: 1, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" }, { deletedAt: now }),
        dev("fault", { saleAmount: 1, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" }, { deviceFault: { reason: "other", note: "", reportedAt: now } } as unknown as Partial<StarlinkAccountSummary>),
      ],
      currencies,
    );
    expect(m).toMatchObject({ losing: [], weak: [], unpriced: 2, noRate: 1 });
  });

  it("the morning line names both groups, or nothing", () => {
    const m = computeDeviceMargins([dev("lose", { saleAmount: 1600, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" })], currencies);
    expect(marginsTelegramLine(m)).toBe("🔻 1 جهاز خاسر (تدفع لستارلينك أكثر مما تأخذ)");
    expect(marginsTelegramLine({ losing: [], weak: [] })).toBeNull();
  });
});
