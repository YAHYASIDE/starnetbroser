import { describe, expect, it } from "vitest";
import type { CashEntry } from "./cashStore";
import { buildExpenseReport, previousMonth } from "./expenseReport";

const e = (o: Partial<CashEntry>): CashEntry => ({ id: "x", kind: "out", amount: 1, currencyCode: "MRU", date: "2026-09-10", createdAt: "2026-09-10T00:00:00Z", ...o });

describe("expenses by category", () => {
  it("groups this month's standalone expenses per currency with last month alongside", () => {
    const report = buildExpenseReport(
      [
        e({ amount: 5000, category: "إيجار" }),
        e({ amount: 700, category: "نقل" }),
        e({ amount: 300, category: " نقل " }),
        e({ amount: 200 }),
        e({ amount: 5000, category: "إيجار", date: "2026-08-10" }),
        e({ amount: 20, currencyCode: "USD", category: "إنترنت" }),
        e({ kind: "in", amount: 999 }),
        e({ amount: 999, sourceId: "s", sourceKind: "device-payment" }),
        e({ amount: 999, invoiceId: "i" }),
        e({ amount: 999, date: "2026-07-01" }),
      ],
      "2026-09",
    );
    expect(report.MRU).toEqual({
      total: 6200,
      previousTotal: 5000,
      rows: [
        { category: "إيجار", amount: 5000, previous: 5000, count: 1 },
        { category: "نقل", amount: 1000, previous: 0, count: 2 },
        { category: "بدون فئة", amount: 200, previous: 0, count: 1 },
      ],
    });
    expect(report.USD!.total).toBe(20);
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});
