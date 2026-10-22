// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadCashEntries } from "./cashStore";
import { loanAccountId, loanLedgerFor, recordRepHandover, recordRepLoan, routeBotLoans } from "./repHandover";
import { createRepLedger, EMPTY_REP_LEDGER_BOOK, loadRepLedgerBook, repLedgerBalances, repLedgerFlows } from "./repLedgers";

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
    expect(recordRepLoan(loan, 20000, "MRU", "2026-09-30")).toEqual({ ok: true, target: "🟢 الأوقية" });
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
    expect(recordRepLoan(viaOrange, 15000, "SIFA", "2026-10-11")).toEqual({ ok: true, target: "حسابك" });
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

describe("📂 a loan from the account he chose (his Oct 22 2026 rule)", () => {
  const orange = { id: "acc-orange", name: "أورانج موني (مالي)", icon: "🟠", currencyCode: "SIFA", method: "orange", openingBalance: 0, openingDate: "2026-01-01" } as MoneyAccount;
  const viaOrange: RepRequest = { ...loan, botId: "b1", amount: 15000, currency: "SIFA", loanApp: "أورانج موني", loanNumber: "70000000", loanAccount: "orange" };

  it("🟢 الأوقية: an advance in أوقية, as before", () => {
    expect(recordRepLoan({ ...loan, loanAccount: "MRU" }, 20000, "MRU", "2026-10-22")).toEqual({ ok: true, target: "🟢 الأوقية" });
    expect(loadRepSettlements()[0]).toMatchObject({ kind: "manualDebit", currencyCode: "MRU" });
  });

  it("🟠 أورانج موني: «عليه» in his أورانج account (made when missing), out of أورانج in «حسابي», once", () => {
    window.localStorage.setItem("starnet_money_accounts_v1", JSON.stringify({ accounts: [orange], adjustments: [] }));
    expect(recordRepLoan(viaOrange, 15000, "SIFA", "2026-10-22")).toEqual({ ok: true, target: "«أورانج موني»" });
    expect(recordRepLoan(viaOrange, 15000, "SIFA", "2026-10-22").ok).toBe(true); // the same bot message again
    const book = loadRepLedgerBook();
    expect(book.ledgers).toHaveLength(1);
    expect(book.ledgers[0]).toMatchObject({ repId: "r1", name: "أورانج موني", kind: "loan", currencies: ["SIFA"], franc: true });
    expect(repLedgerBalances(book, book.ledgers[0]!.id)).toEqual({ SIFA: -15000 });
    expect(repLedgerFlows(book)).toEqual([{ accountId: "acc-orange", currencyCode: "SIFA", date: "2026-10-22", amount: -15000 }]);
    expect(loadRepSettlements()).toEqual([]); // never his 🟠 شخصي
    expect(loadCashEntries()).toEqual([]);
  });

  it("uses his own account of that name (ORANJ, نيتا…), adding the currency when it lacks it", () => {
    const made = createRepLedger(EMPTY_REP_LEDGER_BOOK, { repId: "r1", name: "ORANJ MONEY", kind: "free", currencies: ["MRU"] });
    if (!made.ok) throw new Error(made.message);
    const found = loanLedgerFor(made.book, "r1", "orange", "SIFA");
    if ("ok" in found) throw new Error(found.message);
    expect(found.ledger.id).toBe(made.ledger.id);
    expect(found.ledger.currencies).toEqual(["MRU", "SIFA"]);
    const nita = loanLedgerFor(made.book, "r1", "nita", "SIFA");
    if ("ok" in nita) throw new Error(nita.message);
    expect(nita.ledger.name).toBe("نيتا");
    expect(loanLedgerFor(made.book, "r2", "orange", "SIFA")).toMatchObject({ ledger: { name: "أورانج موني", repId: "r2" } });
  });

  it("💰 الربح: paid out of his profit (may go beyond it), out of the app, never in الكاش", () => {
    window.localStorage.setItem("starnet_money_accounts_v1", JSON.stringify({ accounts: [orange], adjustments: [] }));
    expect(recordRepLoan({ ...viaOrange, loanAccount: "profit" }, 15000, "SIFA", "2026-10-22")).toEqual({ ok: true, target: "💰 الربح" });
    const [settlement] = loadRepSettlements();
    expect(settlement).toMatchObject({ kind: "commissionPayout", amount: 15000, currencyCode: "SIFA", accountId: "acc-orange" });
    expect(settlement!.note).toContain("من ربحه");
    expect(partyFlows([], loadRepSettlements())).toEqual([{ accountId: "acc-orange", currencyCode: "SIFA", date: "2026-10-22", amount: -15000 }]);
    expect(loadCashEntries()).toEqual([]);
  });
});
