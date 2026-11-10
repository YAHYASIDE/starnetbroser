import { describe, expect, it } from "vitest";
import { buildRepDailyStatement, listRepDeviceCommissions } from "./repStore";
import { buildRepPeriodStatement, keepCurrency } from "./repAccount";
import { repStatementTable } from "./repStatementDoc";
import type { LedgerEntry } from "./ledgerStore";

const entry = (over: Partial<LedgerEntry>): LedgerEntry =>
  ({
    id: "e1",
    kind: "debit",
    amount: 100,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-11-07",
    createdAt: "2026-11-07T09:00:00.000Z",
    representativeId: "r1",
    representativeCommissionPercent: 50,
    profitCurrencyRates: { MRU: 40 },
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 50, paidAt: "2026-11-10", settledAt: "2026-11-10T08:00:00.000Z" },
    ...over,
  }) as LedgerEntry;

describe("📈 ربحه · آخر 24 ساعة (his Nov 10 2026 report)", () => {
  it("a renewal recorded 3 days ago and paid to Starlink today shows in the last 24 hours", () => {
    const days = buildRepDailyStatement("r1", listRepDeviceCommissions("r1", { d1: [entry({})] }), [], []);
    const st = buildRepPeriodStatement(days, {}, keepCurrency);
    const lines = repStatementTable(st, st, "profit", keepCurrency, "2026-11-09T10:32:00.000Z");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.row.date).toBe("2026-11-10");
  });

  it("one settled before the window stays out", () => {
    const old = entry({ starlinkCost: { status: "settled", currencyCode: "USD", amount: 50, paidAt: "2026-11-08", settledAt: "2026-11-08T08:00:00.000Z" } });
    const days = buildRepDailyStatement("r1", listRepDeviceCommissions("r1", { d1: [old] }), [], []);
    const st = buildRepPeriodStatement(days, {}, keepCurrency);
    expect(repStatementTable(st, st, "profit", keepCurrency, "2026-11-09T10:32:00.000Z")).toHaveLength(0);
  });
});
