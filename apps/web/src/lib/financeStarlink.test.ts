import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildPeriodMetrics, type DashInput } from "./financeDashboard";
import { buildRenewalRows, fifoPaidByCharge, summarizeStarlink } from "./financeStarlink";
import { buildSupplierDebts } from "./financeDebts";
import type { LedgerEntry } from "./ledgerStore";
import { settleShipmentCost } from "./starlinkDebt";

const T = "2026-10-09";
const rates = { USD: 1, MRU: 40, SIFA: 600 };
const range = { from: "2026-10-01", to: "2026-10-31" };
const accounts = [
  { id: "a1", name: "جهاز 1", clientId: "c1", planName: "Residential" },
  { id: "a2", name: "جهاز 2", clientId: "c2", planName: "Roam" },
] as StarlinkAccountSummary[];
const clientName = (id: string) => ({ c1: "زبون أ", c2: "زبون ب" })[id];

const renewal = (o: Partial<LedgerEntry>): LedgerEntry => ({
  id: "r",
  kind: "debit",
  amount: 4000,
  currency: "MRU",
  note: "",
  email: "",
  date: "2026-10-02",
  createdAt: "2026-10-02T08:00:00Z",
  saleRate: { rateFromUsd: 40, usdValue: 100 },
  starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 },
  ...o,
});
const pay = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "p", kind: "credit", amount: 4000, currency: "MRU", note: "", email: "", date: "2026-10-03", createdAt: "2026-10-03T08:00:00Z", paymentMethod: "cash", ...o });

function dash(ledger: Record<string, LedgerEntry[]>): DashInput {
  return { ledgerStore: ledger, invoices: [], transactions: [], cash: [], rates };
}

describe("a renewal's six figures stay apart", () => {
  it("1: paid in full and Starlink paid → margin realized and cashed", () => {
    const settled = renewal({ id: "r1", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-10-02" }, profitCurrencyRates: { MRU: 40 } });
    const ledger = { a1: [settled, pay({ id: "p1", amount: 4000 })] };
    const book = summarizeStarlink(buildRenewalRows({ ledger, accounts, clientName, rates, range }));
    expect(book).toMatchObject({ count: 1, salesMru: 4000, paidByClientsMru: 4000, owedByClientsMru: 0, costMru: 2400, costSettledCount: 1, expectedMarginMru: 1600, cashedMarginMru: 1600 });
    const m = buildPeriodMetrics(dash(ledger), range);
    expect(m.net.starlinkProfitMru).toBe(1600);
    expect(m.collectedMru).toBe(4000); // collected - not added to profit
    expect(m.netMru).toBe(1600);
  });

  it("2: the customer paid part → his debt drops by that part only", () => {
    const ledger = { a1: [renewal({ id: "r1" }), pay({ id: "p1", amount: 1500 })] };
    const [row] = buildRenewalRows({ ledger, accounts, clientName, rates, range });
    expect(row).toMatchObject({ sale: 4000, paid: 1500, unpaid: 2500 });
  });

  it("3 + 4 + 12: a D renewal's margin is pending (never in profit); paying Starlink later realizes it once, the cost not counted twice", () => {
    const d = renewal({ id: "r1" });
    const before = { a1: [d, pay({ id: "p1", amount: 4000 })] };
    const m1 = buildPeriodMetrics(dash(before), range);
    expect(m1.netMru).toBe(0);
    expect(m1.pendingCount).toBe(1);
    expect(m1.pendingProfitMru).toBe(1600);
    const book1 = summarizeStarlink(buildRenewalRows({ ledger: before, accounts, clientName, rates, range }));
    expect(book1).toMatchObject({ costPendingCount: 1, costSettledCount: 0, cashedMarginMru: 0, unsettled: [expect.objectContaining({ entryId: "r1" })] });
    const sup1 = buildSupplierDebts({ suppliers: [], invoices: [], adjustments: [], ledger: before, previousDebts: [], accounts, rates, range, previous: { from: "2026-09-01", to: "2026-09-30" }, today: T });
    expect(sup1.starlinkUsd).toBe(60);

    const paid = settleShipmentCost(d, { date: "2026-10-08", profitRates: { MRU: 40 }, fromCard: true });
    const after = { a1: [paid, pay({ id: "p1", amount: 4000 })] };
    const m2 = buildPeriodMetrics(dash(after), range);
    expect(m2.net.starlinkProfitMru).toBe(1600);
    expect(m2.net.starlinkCostMru).toBe(2400); // the cost once, with the renewal
    expect(m2.pendingCount).toBe(0);
    const sup2 = buildSupplierDebts({ suppliers: [], invoices: [], adjustments: [], ledger: after, previousDebts: [], accounts, rates, range, previous: { from: "2026-09-01", to: "2026-09-30" }, today: T });
    expect(sup2).toMatchObject({ starlinkUsd: 0, starlinkPaidUsd: 60, starlinkPaidCount: 1 });
    // The day before it was paid it is profit nowhere.
    expect(buildPeriodMetrics(dash(after), { from: "2026-10-01", to: "2026-10-07" }).netMru).toBe(0);
  });

  it("9: a SIFA renewal keeps its currency; its أوقية value uses the locked rate once settled", () => {
    const sifa = renewal({ id: "r1", amount: 60000, currency: "SIFA", saleRate: { rateFromUsd: 600, usdValue: 100 }, starlinkCost: { status: "settled", currencyCode: "USD", amount: 70, paidAt: "2026-10-02" }, profitCurrencyRates: { MRU: 39 } });
    const [row] = buildRenewalRows({ ledger: { a2: [sifa] }, accounts, clientName, rates, range });
    expect(row).toMatchObject({ currency: "SIFA", sale: 60000, saleMru: 3900, costMru: 2730, approx: true });
    expect(row!.marginMru).toBeCloseTo(1170);
  });

  it("a renewal missing its cost is «incomplete» - neither a loss nor a profit", () => {
    const broken = renewal({ id: "r1", starlinkCost: { status: "pending" } });
    const loss = renewal({ id: "r2", amount: 2000, saleRate: { rateFromUsd: 40, usdValue: 50 }, starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-10-02" }, profitCurrencyRates: { MRU: 40 } });
    const book = summarizeStarlink(buildRenewalRows({ ledger: { a1: [broken], a2: [loss] }, accounts, clientName, rates, range }));
    expect(book.incomplete.map((r) => r.entryId)).toEqual(["r1"]);
    expect(book.losses.map((r) => r.entryId)).toEqual(["r2"]);
    expect(book.byPlan.map((g) => g.label).sort()).toEqual(["Residential", "Roam"]);
  });
});

describe("fifoPaidByCharge", () => {
  it("payments settle the oldest charge first, per currency; an earlier overpayment pays a later one", () => {
    const paid = fifoPaidByCharge({
      a1: [pay({ id: "p0", amount: 500, date: "2026-09-01" }), renewal({ id: "r1", date: "2026-09-02", amount: 1000 }), renewal({ id: "r2", date: "2026-09-03", amount: 1000 }), pay({ id: "p1", amount: 800, date: "2026-09-04" })],
    });
    expect(paid.get("r1")).toBe(1000);
    expect(paid.get("r2")).toBe(300);
  });
});
