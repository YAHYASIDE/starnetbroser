// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadCashEntries } from "./cashStore";
import { recordRepLoan } from "./repHandover";
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
