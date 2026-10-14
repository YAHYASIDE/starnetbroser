import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntry } from "./cashStore";
import type { Invoice } from "./invoiceStore";
import type { LedgerEntry } from "./ledgerStore";
import type { PartyAdjustment } from "./partyBalanceStore";
import type { RepSettlement } from "./repStore";
import { buildPeriodMetrics, type DashInput } from "./financeDashboard";
import { buildAlerts, buildDebtFlow, buildGoalItems, buildMoneySources, buildStarlinkAnalysis, type MoneyInput } from "./financeAnalysis";

const T = "2026-10-09";
const P = "2026-09-09";
const range = { from: T, to: T };
const prev = { from: P, to: P };
const rates = { USD: 1, MRU: 40 };

const debit = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "d", kind: "debit", amount: 4000, currency: "MRU", note: "", email: "", date: T, createdAt: "x", ...o });
const credit = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "c", kind: "credit", amount: 1000, currency: "MRU", note: "", email: "", date: T, createdAt: "x", ...o });

const ledger = {
  a1: [
    debit({ id: "s1", amount: 100, currency: "USD", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: T }, profitCurrencyRates: { MRU: 40 }, saleRate: { usdValue: 100, rateFromUsd: 1 } as never }),
    credit({ id: "p1", amount: 3000, paymentMethod: "bankily" }),
    // The device part of a rep's handover is a device payment held by the rep - counted once, as «تسليم المندوبين».
    credit({ id: "p2", amount: 500, paymentMethod: "cash", heldByRepId: "r1" }),
  ],
  a2: [
    debit({ id: "s2", amount: 90, currency: "USD", starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } }),
    debit({ id: "t1", amount: 15000, travelFeeFor: "October 15" }),
    credit({ id: "p3", amount: 2000, paymentMethod: "orange", date: P }),
  ],
};
const invoices = [
  { id: "i1", kind: "sale", date: T, currencyCode: "MRU", lines: [{ itemId: "x", quantity: 1, unitPrice: 5000, transactionId: "t" }], discount: 0, paidAmount: 2000, createdAt: "" },
] as unknown as Invoice[];
const adjustments = [
  { id: "a", partyKind: "client", partyId: "c1", direction: "weOwe", amount: 700, currencyCode: "MRU", date: T, cashMoved: true, paymentMethod: "sedad", createdAt: "" },
  { id: "b", partyKind: "supplier", partyId: "s1", direction: "owesUs", amount: 900, currencyCode: "MRU", date: T, cashMoved: true, createdAt: "" },
] as unknown as PartyAdjustment[];
const settlements = [{ id: "r", representativeId: "r1", kind: "cashHandover", amount: 250, currencyCode: "MRU", date: T, createdAt: "" }] as RepSettlement[];
const cash = [
  { id: "m", kind: "in", amount: 100, currencyCode: "MRU", date: T, createdAt: "" },
  { id: "linked", kind: "in", amount: 3000, currencyCode: "MRU", date: T, createdAt: "", sourceId: "p1", sourceKind: "device-payment" },
] as CashEntry[];

const money: MoneyInput = { ledger, invoices, adjustments, settlements, cash, rates };

describe("💳 money sources", () => {
  it("each source once: device payments by method, rep handovers, store at the till, manual «داخل» - a linked cash entry is not counted again", () => {
    const s = buildMoneySources(money, range, prev);
    const by = Object.fromEntries(s.rows.map((r) => [r.key, [r.mru, r.count]]));
    expect(by["method:bankily"]).toEqual([3000, 1]);
    expect(by["method:sedad"]).toEqual([700, 1]);
    expect(by.rep).toEqual([750, 2]);
    expect(by.store).toEqual([2000, 1]);
    expect(by.manual).toEqual([100, 1]);
    expect(s.totalMru).toBe(3000 + 700 + 750 + 2000 + 100);
    // Orange appears with 0 now, 2000 the period before.
    expect(s.rows.find((r) => r.key === "method:orange")).toMatchObject({ mru: 0, previousMru: 2000, changePct: -100 });
  });

  it("a sale on credit is not money in: renewals + registration + the unpaid part of the invoice", () => {
    const s = buildMoneySources(money, range, prev);
    expect(s.creditSalesMru).toBe(4000 + 3600 + 15000 + 3000);
  });
});

describe("🧾 debts and collections", () => {
  it("new debt vs what was paid against it, and what was paid to suppliers", () => {
    const d = buildDebtFlow(money, range);
    expect(d.newDebtMru).toBe(4000 + 3600 + 15000 + 3000);
    expect(d.collectedMru).toBe(3000 + 500 + 700);
    expect(d.ratioPct).toBeCloseTo((4200 / 25600) * 100);
    expect(d.paidSuppliersMru).toBe(900);
    expect(buildDebtFlow(money, { from: "2026-01-01", to: "2026-01-31" }).ratioPct).toBeUndefined();
  });
});

describe("📡 Starlink analysis", () => {
  const input: DashInput = { ledgerStore: ledger, invoices: [], transactions: [], cash: [], rates };
  const accounts = [
    { id: "a1", name: "جهاز أ", clientId: "c1", rechargeDate: "2026/10/11" },
    { id: "a2", name: "جهاز ب", rechargeDate: "2027/01/01" },
  ] as StarlinkAccountSummary[];

  it("realized vs pending, paid vs still owed, the best devices and customers", () => {
    const m = buildPeriodMetrics(input, range);
    const a = buildStarlinkAnalysis(m, ledger, ledger, accounts, (id) => (id === "c1" ? "زبون أ" : undefined), rates);
    expect(a.realizedCount).toBe(1);
    expect(a.realizedProfitMru).toBe(1600);
    expect(a.pendingCount).toBe(1);
    expect(a.pendingProfitMru).toBe(1200);
    expect([a.periodSettled, a.periodPending]).toEqual([1, 1]);
    expect(a.openDCount).toBe(1);
    expect(a.openDMru).toBe(2400);
    expect(a.topDevices).toEqual([{ id: "a1", name: "جهاز أ", value: 1600, count: 1 }]);
    expect(a.topClients).toEqual([{ id: "c1", name: "زبون أ", value: 1600, count: 1 }]);
  });
});

describe("🎯 goals and alerts", () => {
  const input: DashInput = { ledgerStore: ledger, invoices: [], transactions: [], cash: [], rates };
  const now = buildPeriodMetrics(input, range);
  const before = buildPeriodMetrics({ ...input, ledgerStore: { a1: [debit({ id: "old", date: P, amount: 100, currency: "USD", starlinkCost: { status: "settled", currencyCode: "USD", amount: 20, paidAt: P }, profitCurrencyRates: { MRU: 40 } })] } }, prev);
  const debt = buildDebtFlow(money, range);

  it("each goal's progress, ceilings warn near and over the limit", () => {
    const goals = buildGoalItems({ profitDayMru: 1600, profitMonthMru: 2000, expensesMaxMru: 100, newDebtsMaxMru: 20000 }, now, now, debt);
    expect(goals.map((g) => [g.key, g.status])).toEqual([
      ["profitDayMru", "done"],
      ["profitMonthMru", "near"],
      ["expensesMaxMru", "progress"],
      ["newDebtsMaxMru", "over"],
    ]);
    expect(buildGoalItems({}, now, now, debt)).toEqual([]);
  });

  it("alerts come from the numbers: profit drop, debts growing, goals - nothing without data", () => {
    const goals = buildGoalItems({ profitDayMru: 1600, newDebtsMaxMru: 20000 }, now, now, debt);
    const alerts = buildAlerts({ current: now, previous: before, previousLabel: "الشهر الماضي", debt, openDCount: 1, goals });
    expect(alerts.map((a) => a.key)).toEqual(["profit-drop", "debts-up", "goal-profitDayMru", "goal-newDebtsMaxMru"]);
    expect(alerts[0]!.text).toContain("50%");
    const quiet = buildAlerts({ current: now, previous: now, previousLabel: "x", debt: { ...debt, newDebtMru: 0 }, openDCount: 0, goals: [] });
    expect(quiet).toEqual([]);
    expect(buildAlerts({ current: now, previous: now, previousLabel: "x", debt: { ...debt, newDebtMru: 0 }, openDCount: 3, openDMru: 7200, goals: [] })[0]!.text).toContain("3 تجديدًا");
  });
});
