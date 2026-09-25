import { describe, expect, it } from "vitest";
import {
  adjustmentDelta,
  deletePartyAdjustment,
  listPartyAdjustments,
  PartyAdjustment,
  recordPartyAdjustment,
  updatePartyAdjustment,
} from "./partyBalanceStore";

function adjustment(overrides: Partial<PartyAdjustment> = {}): PartyAdjustment {
  return {
    id: "a1",
    partyKind: "client",
    partyId: "c1",
    direction: "owesUs",
    amount: 100,
    currencyCode: "MRU",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("recordPartyAdjustment", () => {
  it("rejects a zero or negative amount", () => {
    const input = { partyKind: "client" as const, partyId: "c1", direction: "owesUs" as const, currencyCode: "MRU", date: "2026-09-20" };
    expect(recordPartyAdjustment([], { ...input, amount: 0 }).ok).toBe(false);
    expect(recordPartyAdjustment([], { ...input, amount: -5 }).ok).toBe(false);
  });

  it("appends a trimmed record", () => {
    const result = recordPartyAdjustment([], {
      partyKind: "supplier",
      partyId: "s1",
      direction: "weOwe",
      amount: 50,
      currencyCode: "USD",
      date: "2026-09-20",
      note: "  رصيد افتتاحي ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.list).toHaveLength(1);
    expect(result.adjustment.note).toBe("رصيد افتتاحي");
  });
});

describe("adjustmentDelta", () => {
  it("client: عليه adds to what they owe, له subtracts", () => {
    expect(adjustmentDelta(adjustment({ direction: "owesUs" }))).toBe(100);
    expect(adjustmentDelta(adjustment({ direction: "weOwe" }))).toBe(-100);
  });

  it("supplier: له adds to what we owe them, عليه subtracts", () => {
    expect(adjustmentDelta(adjustment({ partyKind: "supplier", direction: "weOwe" }))).toBe(100);
    expect(adjustmentDelta(adjustment({ partyKind: "supplier", direction: "owesUs" }))).toBe(-100);
  });
});

describe("listPartyAdjustments / deletePartyAdjustment", () => {
  it("filters by party kind and id", () => {
    const list = [
      adjustment({ id: "1" }),
      adjustment({ id: "2", partyId: "c2" }),
      adjustment({ id: "3", partyKind: "supplier" }),
    ];
    expect(listPartyAdjustments(list, "client", "c1").map((a) => a.id)).toEqual(["1"]);
  });

  it("removes only the given id", () => {
    const list = [adjustment({ id: "1" }), adjustment({ id: "2" })];
    expect(deletePartyAdjustment(list, "1").map((a) => a.id)).toEqual(["2"]);
  });
});

describe("updatePartyAdjustment", () => {
  it("edits the entry in place, keeping its id, party and creation time", () => {
    const list = [adjustment(), adjustment({ id: "a2" })];
    const r = updatePartyAdjustment(list, "a1", { direction: "weOwe", amount: 40000, currencyCode: "MRU", date: "2026-09-16", note: " bankili ", paymentMethod: "bankily", cashMoved: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.adjustment).toMatchObject({ id: "a1", partyId: "c1", createdAt: "2026-09-20T10:00:00.000Z", direction: "weOwe", amount: 40000, note: "bankili", paymentMethod: "bankily", cashMoved: true });
    expect(r.list.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("rejects a bad amount or an unknown entry", () => {
    const input = { direction: "owesUs" as const, amount: 0, currencyCode: "MRU", date: "2026-09-20" };
    expect(updatePartyAdjustment([adjustment()], "a1", input).ok).toBe(false);
    expect(updatePartyAdjustment([adjustment()], "zz", { ...input, amount: 5 }).ok).toBe(false);
  });
});
