import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import { buildProfitRows, groupProfitDays, hideProfitDay, showProfitDay, withoutHiddenProfitDays } from "./profitStatement";

// Fake amounts only.
function shipment(id: string, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id,
    kind: "debit",
    amount: 12000,
    currency: "MRU",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    saleRate: { rateFromUsd: 400, usdValue: 30 },
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 20, paidAt: "2026-09-22" },
    profitCurrencyRates: { MRU: 400 },
    ...overrides,
  };
}

const payment = (id: string, amount: number): LedgerEntry => ({
  id,
  kind: "credit",
  amount,
  currency: "MRU",
  note: "",
  email: "",
  date: "2026-09-21",
  createdAt: "2026-09-21T10:00:00.000Z",
});

describe("profit statement rows", () => {
  it("tells the whole story of a paid shipment: sale, cost, locked rate, rep share, paid", () => {
    const entry = shipment("s1", { representativeId: "r1", representativeCommissionPercent: 50 });
    const [row] = buildProfitRows({ a1: [entry, payment("p1", 12000)] }, {}, 380, "confirmed");
    expect(row).toMatchObject({
      entryId: "s1",
      accountId: "a1",
      date: "2026-09-22",
      saleDate: "2026-09-20",
      status: "confirmed",
      sale: { amount: 12000, currency: "MRU", usd: 30, rateFromUsd: 400 },
      cost: { amount: 20, currency: "USD", usd: 20, paidAt: "2026-09-22", viaCard: false, waived: false },
      profitUsd: 10,
      profitMru: 4000,
      mruExact: true,
      rep: { id: "r1", percent: 50, shareUsd: 5, shareMru: 2000 },
      ourMru: 2000,
      clientPayment: "paid",
    });
  });

  it("lists D shipments only as expected, at today's rate, on the sale day", () => {
    const d = shipment("d1", { starlinkCost: { status: "pending", currencyCode: "USD", amount: 40 }, profitCurrencyRates: undefined });
    expect(buildProfitRows({ a1: [d] }, {}, 380, "confirmed")).toEqual([]);
    const [row] = buildProfitRows({ a1: [d] }, {}, 380, "expected");
    expect(row).toMatchObject({ date: "2026-09-20", status: "expected", profitUsd: -10, profitMru: -3800, mruExact: false, clientPayment: "unpaid" });
  });

  it("a rep shares no loss unless agreed", () => {
    const loss = shipment("l1", { starlinkCost: { status: "settled", currencyCode: "USD", amount: 40, paidAt: "2026-09-22" }, representativeId: "r1", representativeCommissionPercent: 50 });
    expect(buildProfitRows({ a1: [loss] }, {}, 400, "confirmed")[0]!.rep!.shareUsd).toBe(0);
    const shared = { ...loss, representativeSharesLosses: true };
    expect(buildProfitRows({ a1: [shared] }, {}, 400, "confirmed")[0]!.rep!.shareUsd).toBe(-5);
  });

  it("groups by day, newest first, with each day's totals", () => {
    const rows = buildProfitRows(
      {
        a1: [shipment("s1"), shipment("s2", { starlinkCost: { status: "settled", currencyCode: "USD", amount: 10, paidAt: "2026-09-25" } })],
        a2: [shipment("s3")],
      },
      {},
      400,
      "confirmed",
    );
    const days = groupProfitDays(rows);
    expect(days.map((d) => d.date)).toEqual(["2026-09-25", "2026-09-22"]);
    expect(days[1]!.rows.map((r) => r.entryId).sort()).toEqual(["s1", "s3"]);
    expect(days[1]!.profitMru).toBe(8000);
    expect(days[0]!.profitMru).toBe(8000);
  });
});

describe("hidden profit days", () => {
  it("leaves a hidden day's paid shipments out, keeps payments and D, and can show it again", () => {
    const ledger = { a1: [shipment("s1"), payment("p1", 5000), shipment("d1", { starlinkCost: { status: "pending", currencyCode: "USD", amount: 20 } })] };
    const hidden = hideProfitDay({}, "2026-09-22", new Date("2026-10-02T10:00:00Z"));
    expect(hidden).toEqual({ "2026-09-22": "2026-10-02T10:00:00.000Z" });
    expect(withoutHiddenProfitDays(ledger, hidden).a1!.map((e) => e.id)).toEqual(["p1", "d1"]);
    expect(withoutHiddenProfitDays(ledger, showProfitDay(hidden, "2026-09-22")).a1).toHaveLength(3);
  });
});
