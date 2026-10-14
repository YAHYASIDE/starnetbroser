import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import type { CashEntry } from "./cashStore";
import {
  addMonths,
  buildComparison,
  buildPeriodMetrics,
  buildYearAnalysis,
  changePct,
  compareRange,
  defaultCompareMode,
  periodRange,
  type DashInput,
} from "./financeDashboard";
import { buildMonthNet } from "./netProfit";

function shipment(o: Partial<LedgerEntry>): LedgerEntry {
  return { id: "s", kind: "debit", amount: 100, currency: "USD", note: "", email: "", date: "2026-10-09", createdAt: "2026-10-09T10:00:00.000Z", ...o };
}
function payment(o: Partial<LedgerEntry>): LedgerEntry {
  return { id: "p", kind: "credit", amount: 2000, currency: "MRU", note: "", email: "", date: "2026-10-09", createdAt: "2026-10-09T11:00:00.000Z", ...o };
}
function cash(o: Partial<CashEntry>): CashEntry {
  return { id: "c", kind: "out", amount: 500, currencyCode: "MRU", date: "2026-10-09", createdAt: "2026-10-09T10:00:00.000Z", ...o } as CashEntry;
}

const rates = { USD: 1, MRU: 40 };
const settled = (paidAt: string) => ({ status: "settled" as const, currencyCode: "USD", amount: 60, paidAt });

const input: DashInput = {
  ledgerStore: {
    d1: [
      // Sold 100$, Starlink 60$ paid today, locked 40 → sale 4000, cost 2400, profit 1600; rep 50% = 800.
      shipment({ id: "a", starlinkCost: settled("2026-10-09"), profitCurrencyRates: { MRU: 40 }, representativeId: "r1", representativeCommissionPercent: 50 }),
      payment({ id: "pa", paymentMethod: "bankily" }),
    ],
    d2: [
      // Recorded today but still D: not profit - «ربح معلّق» 40$ × 40 = 1600.
      shipment({ id: "b", starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } }),
      payment({ id: "pb", amount: 10, currency: "USD", paymentMethod: "cash" }),
    ],
    d3: [
      // Same day last month: sold 100$, cost 80$ → profit 800.
      shipment({ id: "c", date: "2026-09-09", starlinkCost: { ...settled("2026-09-09"), amount: 80 }, profitCurrencyRates: { MRU: 40 } }),
      payment({ id: "pc", date: "2026-09-09", amount: 1000 }),
      // A travel-registration debt: not a renewal.
      shipment({ id: "t", amount: 15000, currency: "MRU", travelFeeFor: "October 15" }),
    ],
  },
  invoices: [],
  transactions: [],
  cash: [cash({ id: "rent" }), cash({ id: "sep", date: "2026-09-09", amount: 100 })],
  rates,
  clientOf: (id) => (id === "d1" || id === "d2" ? "client-1" : undefined),
};

describe("📊 periods", () => {
  it("each filter is a date range", () => {
    expect(periodRange("today", "2026-10-09")).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(periodRange("yesterday", "2026-10-01")).toEqual({ from: "2026-09-30", to: "2026-09-30" });
    expect(periodRange("7d", "2026-10-09")).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(periodRange("month", "2026-10-09")).toEqual({ from: "2026-10-01", to: "2026-10-09" });
    expect(periodRange("lastMonth", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("3m", "2026-01-20")).toEqual({ from: "2025-11-01", to: "2026-01-20" });
    expect(periodRange("year", "2026-10-09")).toEqual({ from: "2026-01-01", to: "2026-10-09" });
    expect(periodRange("custom", "2026-10-09", { from: "2026-10-05", to: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });

  it("compares with the same day last month by default (9 Oct ↔ 9 Sep), month ends clamped", () => {
    expect(defaultCompareMode("today")).toBe("prevMonth");
    expect(compareRange({ from: "2026-10-09", to: "2026-10-09" }, "prevMonth")).toEqual({ from: "2026-09-09", to: "2026-09-09" });
    expect(addMonths("2026-10-31", -1)).toBe("2026-09-30");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(compareRange({ from: "2026-10-09", to: "2026-10-09" }, "prevDay")).toEqual({ from: "2026-10-08", to: "2026-10-08" });
    expect(compareRange({ from: "2026-10-03", to: "2026-10-09" }, "prevWeek")).toEqual({ from: "2026-09-26", to: "2026-10-02" });
    expect(compareRange({ from: "2026-01-01", to: "2026-10-09" }, "prevYear")).toEqual({ from: "2025-01-01", to: "2025-10-09" });
  });
});

describe("📊 one period's figures", () => {
  const today = buildPeriodMetrics(input, { from: "2026-10-09", to: "2026-10-09" });

  it("revenue − Starlink cost − rep shares − expenses = net profit (the same net as «الصافي»)", () => {
    expect(today.revenueMru).toBe(4000);
    expect(today.starlinkCostMru).toBe(2400);
    expect(today.net.starlinkRepSharesMru).toBe(800);
    expect(today.expensesMru).toBe(500);
    expect(today.netMru).toBe(4000 - 2400 - 800 - 500);
    expect(today.revenueMru - today.starlinkCostMru - today.net.starlinkRepSharesMru + today.net.storeNetMru - today.expensesMru).toBe(today.netMru);
    // The month view of the same data gives the same October net.
    const october = buildMonthNet({ month: "2026-10", ...input });
    expect(buildPeriodMetrics(input, { from: "2026-10-01", to: "2026-10-31" }).netMru).toBe(october.netMru);
  });

  it("a D renewal is pending profit, not profit; payments are collections, not revenue", () => {
    expect(today.pendingProfitMru).toBe(1600);
    expect(today.pendingCount).toBe(1);
    expect(today.collectedMru).toBe(2000 + 400);
    expect(today.collectedByMethod.map((m) => [m.label, m.mru, m.count])).toEqual([["بنكيلي", 2000, 1], ["نقدًا", 400, 1]]);
  });

  it("counts renewals and the customers who renewed; the travel debt is not a renewal", () => {
    expect(today.renewals).toBe(2);
    expect(today.renewedClients).toBe(1);
    expect(today.avgProfitPerRenewalMru).toBe(1600);
    expect(today.marginPct).toBeCloseTo((300 / 4000) * 100);
  });

  it("nothing in the period: no average, no margin (never an invented number)", () => {
    const empty = buildPeriodMetrics(input, { from: "2026-08-01", to: "2026-08-31" });
    expect(empty.empty).toBe(true);
    expect(empty.avgProfitPerRenewalMru).toBeUndefined();
    expect(empty.marginPct).toBeUndefined();
  });
});

describe("📊 «مقارنة الأداء»", () => {
  it("9 Oct vs 9 Sep: amounts, differences, % only on a positive base", () => {
    const now = buildPeriodMetrics(input, { from: "2026-10-09", to: "2026-10-09" });
    const before = buildPeriodMetrics(input, { from: "2026-09-09", to: "2026-09-09" });
    const rows = Object.fromEntries(buildComparison(now, before).map((r) => [r.key, r]));
    expect(rows.net!.previous).toBe(800 - 100);
    expect(rows.net!.current).toBe(300);
    expect(rows.net!.pct).toBeCloseTo(((300 - 700) / 700) * 100);
    expect(rows.expenses!.upIsGood).toBe(false);
    expect(rows.renewals!.current).toBe(2);
    expect(rows.renewals!.previous).toBe(1);
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(5, -3)).toBeNull();
  });
});

describe("📊 «تحليل الأداء الشهري»", () => {
  it("twelve months, best and worst among the active ones, growth month to month", () => {
    const year = buildYearAnalysis(input, 2026, "2026-10-09");
    expect(year.months).toHaveLength(12);
    expect(year.months[10]!.future).toBe(true);
    expect(year.best?.month).toBe("2026-09");
    expect(year.worst?.month).toBe("2026-10");
    expect(year.months[9]!.growthPct).toBeCloseTo(((300 - 700) / 700) * 100);
  });
});
