// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadCashEntries } from "./cashStore";
import { recordRepHandover, recordRepLoan } from "./repHandover";
import type { RepRequest } from "./repRequests";
import { computeRepManualBalanceByCurrency, loadRepSettlements } from "./repStore";

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

  it("in cash, or an app with no account in «حسابي», stays in الكاش as before", () => {
    expect(recordRepHandover(handover("orange"), 14000, "SIFA", "2026-10-11")).toEqual({ ok: true });
    expect(loadRepSettlements()[0]!.accountId).toBeUndefined();
    expect(loadCashEntries()).toHaveLength(1);
  });
});
