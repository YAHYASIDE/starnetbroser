// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { recordRepSwapHandover, swapAmount, swapNotes, swapOther } from "./repSwap";
import { linkedSettlementIds, loadRepSettlements } from "./repStore";
import { loadCashEntries } from "./cashStore";

describe("swapAmount", () => {
  it("converts at «1,000 سيفا = X أوقية» both ways", () => {
    expect(swapAmount(3600, "MRU", 3600)).toBe(1000);
    expect(swapAmount(1000, "SIFA", 3600)).toBe(3600);
    expect(swapAmount(5000, "MRU", 3642)).toBe(1372.87);
    expect(swapAmount(100, "MRU", 0)).toBe(0);
    expect(swapOther("MRU")).toBe("SIFA");
    expect(swapOther("USD")).toBeNull();
  });

  it("writes the rate on every record", () => {
    const n = swapNotes({ amount: 3600, currency: "MRU", toAmount: 1000, toCurrency: "SIFA", rate: 3600, target: "🟠 شخصي", method: "bankily" });
    expect(n.out).toBe("💱 حُوّلت إلى 🟠 شخصي: 1,000 سيفا (1,000 سيفا = 3,600 أوقية)");
    expect(n.into).toBe("💱 من دفعة 3,600 أوقية (1,000 سيفا = 3,600 أوقية)");
    expect(n.money).toContain("بنكيلي");
  });
});

describe("recordRepSwapHandover", () => {
  beforeEach(() => window.localStorage.clear());

  it("money in as paid, his أوقية account unchanged, his شخصي +1,000 سيفا - one handover", () => {
    const r = recordRepSwapHandover({ repId: "r1", repName: "حسين", amount: 3600, currency: "MRU", rate: 3600, date: "2026-10-22" });
    expect(r.ok).toBe(true);
    const s = loadRepSettlements();
    expect(s.map((x) => [x.kind, x.amount, x.currencyCode])).toEqual([
      ["cashHandover", 3600, "MRU"],
      ["manualDebit", 3600, "MRU"],
      ["manualCredit", 1000, "SIFA"],
    ]);
    expect(new Set(s.map((x) => x.handoverId)).size).toBe(1);
    expect(s[0]!.swap).toEqual({ toAmount: 1000, toCurrency: "SIFA", rate: 3600 });
    // The cash register gets the أوقية that came in, not سيفا.
    expect(loadCashEntries().map((e) => [e.kind, e.amount, e.currencyCode])).toEqual([["in", 3600, "MRU"]]);
  });

  it("refuses a currency it can't swap and a missing rate", () => {
    expect(recordRepSwapHandover({ repId: "r1", repName: "", amount: 10, currency: "USD", rate: 3600, date: "2026-10-22" }).ok).toBe(false);
    expect(recordRepSwapHandover({ repId: "r1", repName: "", amount: 10, currency: "MRU", rate: 0, date: "2026-10-22" }).ok).toBe(false);
    expect(loadRepSettlements()).toEqual([]);
  });

  it("deleting any of the three deletes all three; a normal handover part alone", () => {
    recordRepSwapHandover({ repId: "r1", repName: "", amount: 3600, currency: "MRU", rate: 3600, date: "2026-10-22" });
    const s = loadRepSettlements();
    expect(linkedSettlementIds(s, s[1]!.id).sort()).toEqual(s.map((x) => x.id).sort());
    const plain = [{ ...s[0]!, id: "p1", handoverId: "h2", swap: undefined }, { ...s[1]!, id: "p2", handoverId: "h2" }];
    expect(linkedSettlementIds(plain, "p1")).toEqual(["p1"]);
  });
});
