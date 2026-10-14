/**
 * His Oct 9 2026 brief, part 8: the scenarios not already covered one by one in
 * moneyMovements / financeStarlink / financeDebts / alertCenter tests - each checked before and after.
 * (1, 2, 3, 4, 9, 12 → financeStarlink.test; 5, 6, 7 → moneyMovements.test; 10 → moneyMovements.test +
 * alertCenter.test; 11 → financeDebts.test.)
 */
import { describe, expect, it } from "vitest";
import { applyLedgerPaymentsToCash, computeCashBalanceByCurrency } from "./cashStore";
import type { LedgerEntry } from "./ledgerStore";
import { EMPTY_DEBT_BOOK } from "./myMoney";
import { buildMovements, collectionSeries, moneyPlaces, placeBalance, summarizeByKind, CASH_PLACE, type MovementInput } from "./moneyMovements";
import { buildPeriodMetrics } from "./financeDashboard";

const rates = { USD: 1, MRU: 40 };
const renewal = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "r", kind: "debit", amount: 4000, currency: "MRU", note: "", email: "", date: "2026-10-02", createdAt: "2026-10-02T08:00:00Z", ...o });
const pay = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "p", kind: "credit", amount: 4000, currency: "MRU", note: "", email: "", date: "2026-10-03", createdAt: "2026-10-03T08:00:00Z", paymentMethod: "cash", ...o });
const input = (ledger: Record<string, LedgerEntry[]>, cash: MovementInput["cash"]): MovementInput => ({
  ledger,
  invoices: [],
  adjustments: [],
  settlements: [],
  cash,
  book: { accounts: [], adjustments: [] },
  cardTopUps: [],
  incomes: [],
  expenses: [],
  debts: EMPTY_DEBT_BOOK,
});

describe("8: cancelling a recorded payment (the app's way: deleting it removes its الكاش entry)", () => {
  it("everything it moved comes back - nothing counted twice, nothing left behind", () => {
    const before = [renewal({ id: "r1" }), pay({ id: "p1" })];
    const cash1 = applyLedgerPaymentsToCash([], [], before, "جهاز");
    expect(computeCashBalanceByCurrency(cash1)).toEqual({ MRU: 4000 });
    const after = [renewal({ id: "r1" })];
    const cash2 = applyLedgerPaymentsToCash(cash1, before, after, "جهاز");
    expect(computeCashBalanceByCurrency(cash2)).toEqual({});
    const moves = buildMovements(input({ a1: after }, cash2));
    expect(moves).toEqual([]);
    const cash = moneyPlaces({ accounts: [], adjustments: [] }).find((p) => p.id === CASH_PLACE)!;
    expect(placeBalance(cash, moves, "2026-12-31")).toEqual({ MRU: 0 });
  });
});

describe("13: changing the period moves every figure together", () => {
  const ledger = { a1: [renewal({ id: "r1" }), pay({ id: "p1", amount: 1000, date: "2026-10-03" }), pay({ id: "p2", amount: 2000, date: "2026-10-20" })] };
  const cash = applyLedgerPaymentsToCash([], [], ledger.a1, "جهاز");
  const moves = buildMovements(input(ledger, cash));

  for (const range of [
    { from: "2026-10-01", to: "2026-10-09" },
    { from: "2026-10-10", to: "2026-10-31" },
    { from: "2026-10-01", to: "2026-10-31" },
  ]) {
    it(`${range.from} → ${range.to}: collections by kind = the chart's buckets = the dashboard's «المحصّل»`, () => {
      const kinds = summarizeByKind(moves, range, rates).collectedMru;
      const chart = collectionSeries(moves, range, rates).buckets.reduce((s, b) => s + b.mru, 0);
      const metrics = buildPeriodMetrics({ ledgerStore: ledger, invoices: [], transactions: [], cash, rates }, range).collectedMru;
      expect(chart).toBe(kinds);
      expect(metrics).toBe(kinds);
    });
  }
});
