import { describe, expect, it } from "vitest";
import { keepCurrency, makeRepConverter, repRowDelta } from "./repAccount";
import { buildRepDailyStatement, computeRepCommissionOwedByCurrency, computeRepManualBalanceByCurrency, type RepCustomerOp, type RepSettlement } from "./repStore";
import { repProfitIn, repProfitSigned, repProfitZeroEntry, repWallets, repZeroEntry, settleFormKind } from "./repWallets";

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

describe("🧹 تصفير one of his money accounts", () => {
  it("adds the له / عليه that brings it to 0", () => {
    expect(repZeroEntry(-44000)).toEqual({ kind: "manualCredit", amount: 44000 });
    expect(repZeroEntry(6000.456)).toEqual({ kind: "manualDebit", amount: 6000.46 });
    expect(repZeroEntry(0.001)).toBeNull();
  });
});

describe("🧹 تصفير الربح either way (his Oct 12 2026 report: «عليه 336,025 سيفا» could not be zeroed)", () => {
  it("a profit below 0 is brought back by «له في ربحه» (profitCredit) - his money accounts don't move", () => {
    // more of his profit moved into his سيفا account than he had
    const moved = st("t", "profitTransfer", 336025.91, "SIFA", { toDebt: true });
    const before = buildRepDailyStatement("r1", [], [], [moved]);
    const signed = repProfitSigned(before, "SIFA", keepCurrency);
    expect(signed).toBe(-336025.91);
    const zero = repProfitZeroEntry(signed)!;
    expect(zero).toEqual({ kind: "profitCredit", amount: 336025.91 });
    const after = buildRepDailyStatement("r1", [], [], [moved, st("z", zero.kind, zero.amount, "SIFA")]);
    const { money, profit } = repWallets(after, keepCurrency);
    expect(Math.abs(profit.balance.SIFA ?? 0)).toBeLessThan(0.01);
    expect(money[0]!.balance).toEqual({ SIFA: 336025.91 });
    expect(computeRepCommissionOwedByCurrency("r1", [], [moved, st("z", "profitCredit", 336025.91, "SIFA")])).toEqual({ SIFA: 0 });
  });

  it("a profit above 0 is written off, 0 needs nothing", () => {
    expect(repProfitZeroEntry(6000)).toEqual({ kind: "profitTransfer", amount: 6000 });
    expect(repProfitZeroEntry(0)).toBeNull();
  });
});

describe("💵 «تسوية» on his card (his Oct 12 2026 report: «عليه 50,000 سيفا» showed in his profit)", () => {
  it("«عليه» always goes to what he owes - never his profit, never الكاش", () => {
    expect(settleFormKind("debit", true)).toBe("manualDebit");
    expect(settleFormKind("debit", false)).toBe("manualDebit");
    const days = buildRepDailyStatement("r1", [], [], [st("d", settleFormKind("debit", true), 50000, "SIFA")]);
    const { money, profit } = repWallets(days, keepCurrency);
    expect(money[0]!.balance).toEqual({ SIFA: -50000 });
    expect(profit.balance.SIFA ?? 0).toBe(0);
  });

  it("«له» keeps the cash choice; an old «دفعت له من ربحه» edited stays one", () => {
    expect(settleFormKind("credit", true)).toBe("cashHandover");
    expect(settleFormKind("credit", false)).toBe("manualCredit");
    expect(settleFormKind("debit", true, "commissionPayout")).toBe("commissionPayout");
    expect(settleFormKind("debit", false, "manualDebit")).toBe("manualDebit");
  });
});

describe("💱 a rep's one currency (his Oct 31 2026 rule)", () => {
  it("«عملته» first, else his usual one; only أوقية / سيفا", async () => {
    const { repCurrencyOf } = await import("./repWallets");
    expect(repCurrencyOf({ defaultCurrency: "MRU" }, "SIFA")).toBe("MRU");
    expect(repCurrencyOf({}, "SIFA")).toBe("SIFA");
    expect(repCurrencyOf({}, "USD")).toBeNull();
    expect(repCurrencyOf({})).toBeNull();
  });

  it("hides the other money account while it is empty", async () => {
    const { visibleWallets } = await import("./repWallets");
    const w = (id: string, lines = 0, balance = 0) => ({ id, balance: { [id]: balance }, lines: Array.from({ length: lines }) as never[] });
    const all = [w("SIFA"), w("MRU", 7, 45000), w("profit", 3, 10)];
    expect(visibleWallets(all, "MRU").map((x) => x.id)).toEqual(["MRU", "profit"]);
    expect(visibleWallets([w("SIFA", 1, 5), w("MRU"), w("profit")], "MRU").map((x) => x.id)).toEqual(["SIFA", "MRU", "profit"]);
    expect(visibleWallets(all, null)).toHaveLength(3);
  });
});
