import { describe, expect, it } from "vitest";
import { keepCurrency, makeRepConverter, repRowDelta } from "./repAccount";
import { buildRepDailyStatement, computeRepCommissionOwedByCurrency, computeRepManualBalanceByCurrency, type RepCustomerOp, type RepSettlement } from "./repStore";
import { repProfitIn, repWallets } from "./repWallets";

const op = (id: string, amount: number, currency: string, date = "2026-10-05"): RepCustomerOp => ({ entryId: id, accountId: "a1", date, at: `${date}T10:00:00.000Z`, amount, currency, byRep: false });
const st = (id: string, kind: RepSettlement["kind"], amount: number, currencyCode: string, extra: Partial<RepSettlement> = {}): RepSettlement => ({
  id, representativeId: "r1", kind, amount, currencyCode, date: "2026-10-10", createdAt: `2026-10-10T1${id.length}:00:00.000Z`, rates: { MRU: 400, SIFA: 600 }, ...extra,
});

describe("📂 a rep's accounts (his Oct 12 2026 ask)", () => {
  it("سيفا and أوقية are separate accounts, never converted", () => {
    const days = buildRepDailyStatement("r1", [], [], [st("h", "cashHandover", 20000, "SIFA"), st("l", "manualDebit", 15000, "SIFA"), st("m", "cashHandover", 5000, "MRU")], [op("o1", 50000, "SIFA"), op("o2", 8000, "MRU")]);
    const { money } = repWallets(days, keepCurrency);
    expect(money.map((w) => w.id)).toEqual(["SIFA", "MRU"]);
    // −50,000 renewals +20,000 handed over −15,000 loan
    expect(money[0]!.balance).toEqual({ SIFA: -45000 });
    expect(money[0]!.lines).toHaveLength(3);
    expect(money[1]!.balance).toEqual({ MRU: -3000 });
  });

  it("his profit moved into his سيفا account leaves «ربحه» and lowers what he owes - the total stays", () => {
    const transfer = st("t", "profitTransfer", 6000, "SIFA", { toDebt: true });
    const days = buildRepDailyStatement("r1", [], [], [transfer], [op("o1", 50000, "SIFA")]);
    const { money, profit } = repWallets(days, keepCurrency);
    expect(money[0]!.balance).toEqual({ SIFA: -44000 });
    expect(profit.balance).toEqual({ SIFA: -6000 });
    expect(repRowDelta({ type: "settlement", id: "t", date: "2026-10-10", createdAt: "", settlement: transfer })).toEqual({});
    // the store's own balances agree: profit −6,000, his account +6,000
    expect(computeRepCommissionOwedByCurrency("r1", [], [transfer])).toEqual({ SIFA: -6000 });
    expect(computeRepManualBalanceByCurrency("r1", [transfer])).toEqual({ SIFA: 6000 });
  });

  it("a write-off («تصفير الربح») only lowers his profit", () => {
    const off = st("w", "profitTransfer", 1000, "MRU");
    const days = buildRepDailyStatement("r1", [], [], [off]);
    const { money, profit } = repWallets(days, keepCurrency);
    expect(profit.balance).toEqual({ MRU: -1000 });
    expect(money[1]!.balance).toEqual({ MRU: 0 });
    expect(computeRepManualBalanceByCurrency("r1", [off])).toEqual({});
  });

  it("his profit in one currency, for the transfer's amount", () => {
    const days = buildRepDailyStatement("r1", [], [], [st("c", "commissionPayout", 10, "USD")]);
    // he was paid 10 $ more than his profit: nothing is due
    expect(repProfitIn(days, "SIFA", makeRepConverter(["SIFA"], { SIFA: 600 }))).toBe(0);
  });
});
