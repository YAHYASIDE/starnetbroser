import { describe, expect, it } from "vitest";
import { ageDebt, computeDebtAging, daysAgoLabel, daysBetween, totalAgingByCurrency } from "./debtAging";
import type { LedgerEntry } from "./ledgerStore";
import type { StarlinkAccountSummary } from "@starnet/shared";

describe("ageDebt", () => {
  it("lets payments settle the oldest charges first", () => {
    const age = ageDebt(
      [
        { date: "2026-06-01", delta: 1000 }, // 116 days old
        { date: "2026-08-10", delta: 500 }, // 46 days
        { date: "2026-09-20", delta: 300 }, // 5 days
        { date: "2026-09-21", delta: -1200 }, // clears June fully and 200 of August
      ],
      "2026-09-25",
    );
    expect(age).toEqual({ total: 600, buckets: { fresh: 300, late: 300, overdue: 0 }, oldestDays: 46 });
  });

  it("applies an earlier overpayment to later charges and reports nothing owed when clear", () => {
    expect(ageDebt([{ date: "2026-09-01", delta: -100 }, { date: "2026-09-10", delta: 80 }], "2026-09-25").total).toBe(0);
    expect(ageDebt([], "2026-09-25")).toEqual({ total: 0, buckets: { fresh: 0, late: 0, overdue: 0 }, oldestDays: 0 });
  });

  it("counts days between dates (slash or dash)", () => {
    expect(daysBetween("2026/09/20", "2026-09-25")).toBe(5);
  });
});

describe("computeDebtAging", () => {
  const entry = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "e", kind: "debit", amount: 100, currency: "MRU", note: "", email: "", date: "2026-07-01", createdAt: "x", ...o });
  const account = (o: Partial<StarlinkAccountSummary>) => ({ id: "d", name: "جهاز", ...o }) as StarlinkAccountSummary;

  it("groups a client's devices together, lists unlinked devices alone, oldest first", () => {
    const debtors = computeDebtAging({
      clients: [{ id: "c1", name: "محمد", phone: "222" }],
      accounts: [account({ id: "d1", clientId: "c1" }), account({ id: "d2", clientId: "c1" }), account({ id: "d3", name: "وحيد" })],
      invoices: [],
      adjustments: [],
      ledgerStore: {
        d1: [entry({ id: "a", date: "2026-09-20" })],
        d2: [entry({ id: "b", date: "2026-09-01" })],
        d3: [entry({ id: "c", date: "2026-05-01", amount: 50 })],
      },
      today: "2026-09-25",
    });
    expect(debtors.map((d) => [d.kind, d.name, d.total, d.oldestDays])).toEqual([
      ["device", "وحيد", 50, 147],
      ["client", "محمد", 200, 24],
    ]);
    expect(totalAgingByCurrency(debtors)).toEqual({ MRU: { fresh: 200, late: 0, overdue: 50 } });
  });
});

describe("daysAgoLabel", () => {
  it("agrees with the number", () => {
    expect([0, 1, 2, 3, 10, 11, 46].map(daysAgoLabel)).toEqual(["اليوم", "منذ يوم واحد", "منذ يومين", "منذ 3 أيام", "منذ 10 أيام", "منذ 11 يومًا", "منذ 46 يومًا"]);
  });
});
