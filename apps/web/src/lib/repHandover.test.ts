// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadCashEntries } from "./cashStore";
import { loanAccountId, recordRepHandover, recordRepLoan, routeBotLoans } from "./repHandover";
import { cashWalletFlows, partyFlows, type MoneyAccount } from "./moneyAccounts";
import type { RepRequest } from "./repRequests";
import { computeRepManualBalanceByCurrency, loadRepSettlements, type RepSettlement } from "./repStore";

const loan: RepRequest = {
  id: "q1", repId: "r1", kind: "loan", text: "🏦 سلفة", createdAt: "", status: "pending",
  amount: 20000, currency: "MRU", loanApp: "بنكيلي", loanNumber: "22123456",
};

beforeEach(() => window.localStorage.clear());

describe("🏦 an approved loan", () => {
  it("is recorded as an advance the rep owes, without a cash-register entry", () => {
    expect(recordRepLoan(loan, 20000, "MRU", "2026-09-30")).toEqual({ ok: true });
    const [settlement] = loadRepSettlements();
    expect(settlement).toMatchObject({ representativeId: "r1", kind: "manualDebit", amount: 20000, currencyCode: "MRU", date: "2026-09-30" });
    expect(settlement!.note).toContain("بنكيلي");
    expect(settlement!.note).toContain("22123456");
    expect(computeRepManualBalanceByCurrency("r1", loadRepSettlements())).toEqual({ MRU: -20000 });
    expect(loadCashEntries()).toEqual([]);
  });
});

describe("🤲 a handover he sent through an app of «حسابي»", () => {
  // His Oct 11 2026 report: 70,000 فرانك on أورانج and 130,000 on نيتا landed in الكاش.
  const orange = { id: "acc-orange", name: "أورانج موني (مالي)", icon: "🟠", currencyCode: "SIFA", method: "orange", openingBalance: 0, openingDate: "2026-01-01" };
  const handover = (paymentMethod?: RepRequest["paymentMethod"]): RepRequest => ({
    id: "h1", repId: "r1", kind: "handover", text: "💼 دفعة في حسابي الشخصي", createdAt: "", status: "pending", amount: 14000, currency: "SIFA", ...(paymentMethod ? { paymentMethod } : {}),
  });

  it("goes to that account, not to الكاش", () => {
    window.localStorage.setItem("starnet_money_accounts_v1", JSON.stringify({ accounts: [orange], adjustments: [] }));
    expect(recordRepHandover(handover("orange"), 14000, "SIFA", "2026-10-11")).toEqual({ ok: true });
    const [settlement] = loadRepSettlements();
    expect(settlement).toMatchObject({ kind: "cashHandover", amount: 14000, currencyCode: "SIFA", accountId: "acc-orange" });
    expect(settlement!.note).toContain("أورانج");
    expect(loadCashEntries()).toEqual([]);
  });

  it("in cash سيفا counts in «💵 كاش سيفا» (his Oct 11 2026 choice), not in الكاش", () => {
    const wallet = { id: "acc-cash-sifa", name: "كاش سيفا", icon: "💵", currencyCode: "SIFA", cashWallet: true, openingBalance: 0, openingDate: "2026-10-05", balanceSet: false } as MoneyAccount;
    window.localStorage.setItem("starnet_money_accounts_v1", JSON.stringify({ accounts: [orange, wallet], adjustments: [] }));
    expect(recordRepHandover(handover("cash"), 700, "SIFA", "2026-10-11")).toEqual({ ok: true });
    const cash = loadCashEntries();
    expect(cash).toHaveLength(1);
    expect(cashWalletFlows(cash, {}, [orange as MoneyAccount, wallet])).toEqual([{ accountId: "acc-cash-sifa", currencyCode: "SIFA", date: "2026-10-11", amount: 700 }]);
  });

  it("in cash, or an app with no account in «حسابي», stays in الكاش as before", () => {
    expect(recordRepHandover(handover("orange"), 14000, "SIFA", "2026-10-11")).toEqual({ ok: true });
    expect(loadRepSettlements()[0]!.accountId).toBeUndefined();
    expect(loadCashEntries()).toHaveLength(1);
  });
});

describe("🏦 an approved loan sent through an app of «حسابي»", () => {
  // His Oct 11 2026 report: a 75,000 فرانك (15,000 سيفا) loan by أورانج didn't lower أورانج.
  const orange = { id: "acc-orange", name: "أورانج موني (مالي)", icon: "🟠", currencyCode: "SIFA", method: "orange", openingBalance: 0, openingDate: "2026-01-01" } as MoneyAccount;
  const viaOrange: RepRequest = { ...loan, amount: 15000, currency: "SIFA", loanApp: "أورانج موني", loanNumber: "70000000" };

  it("comes out of that account", () => {
    window.localStorage.setItem("starnet_money_accounts_v1", JSON.stringify({ accounts: [orange], adjustments: [] }));
    expect(recordRepLoan(viaOrange, 15000, "SIFA", "2026-10-11")).toEqual({ ok: true });
    const [settlement] = loadRepSettlements();
    expect(settlement).toMatchObject({ kind: "manualDebit", amount: 15000, currencyCode: "SIFA", accountId: "acc-orange" });
    expect(partyFlows([], loadRepSettlements())).toEqual([{ accountId: "acc-orange", currencyCode: "SIFA", date: "2026-10-11", amount: -15000 }]);
  });

  it("one approved today before the fix gets its account; older ones are left alone", () => {
    const old = { id: "s1", representativeId: "r1", kind: "manualDebit", amount: 1000, currencyCode: "SIFA", date: "2026-10-01", note: "سلفة عبر أورانج موني إلى 70000000 (بوت المال)", createdAt: "2026-10-01T10:00:00.000Z" } as RepSettlement;
    const today = { ...old, id: "s2", amount: 15000, date: "2026-10-11", createdAt: "2026-10-11T21:55:00.000Z" };
    const typed = { ...today, id: "s3", note: "سلفة يدوية" };
    const next = routeBotLoans([old, today, typed], [orange]);
    expect(next.map((s) => s.accountId)).toEqual([undefined, "acc-orange", undefined]);
    expect(routeBotLoans(next, [orange])).toBe(next);
    expect(loanAccountId("بنكيلي", "SIFA", [orange])).toBeNull();
  });
});
