import { describe, expect, it } from "vitest";
import { adjustmentDelta, recordPartyAdjustment, type PartyAdjustmentList } from "./partyBalanceStore";
import {
  clearClientsProfitFresh,
  laterReset,
  profitResetByAccount,
  startClientsProfitFresh,
  ZERO_NOTE,
  zeroingAdjustments,
} from "./clientBulk";

describe("zeroingAdjustments", () => {
  it("brings every currency of the client's balance to exactly 0, moving no cash", () => {
    const inputs = zeroingAdjustments("c1", { MRU: 1500, USD: -20.5, SIFA: 0.001 }, "2026-10-02");
    expect(inputs).toHaveLength(2);
    let list: PartyAdjustmentList = [];
    for (const input of inputs) {
      const result = recordPartyAdjustment(list, input);
      expect(result.ok).toBe(true);
      if (result.ok) list = result.list;
    }
    const byCurrency: Record<string, number> = { MRU: 1500, USD: -20.5 };
    for (const a of list) byCurrency[a.currencyCode] += adjustmentDelta(a);
    expect(byCurrency.MRU).toBeCloseTo(0, 6);
    expect(byCurrency.USD).toBeCloseTo(0, 6);
    expect(list.every((a) => !a.cashMoved && a.note === ZERO_NOTE)).toBe(true);
  });
});

describe("client profit start points", () => {
  const now = new Date(2026, 9, 2, 10, 0, 0);

  it("starts the chosen clients from today and clears them again", () => {
    const resets = startClientsProfitFresh({}, ["c1", "c2"], now);
    expect(resets.c1?.date).toBe("2026-10-02");
    expect(Object.keys(clearClientsProfitFresh(resets, ["c1"]))).toEqual(["c2"]);
  });

  it("each device gets the later of the global point and its client's", () => {
    const early = { date: "2026-09-01", at: "" };
    const late = { date: "2026-10-02", at: "2026-10-02T10:00:00.000Z" };
    expect(laterReset(early, late)).toBe(late);
    expect(laterReset(null, early)).toBe(early);
    expect(laterReset(undefined, null)).toBeNull();
    const map = profitResetByAccount(
      [{ id: "d1", clientId: "c1" }, { id: "d2", clientId: "c2" }, { id: "d3" }],
      { c1: late },
      early,
    );
    expect(map).toEqual({ d1: late, d2: early, d3: early });
  });
});
