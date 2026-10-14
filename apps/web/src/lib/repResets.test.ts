import { describe, expect, it } from "vitest";
import { applyRepReset, inRepVersion, repResetPoints, repVersions, seedRepResetHistory, undoRepReset, pickRepReset } from "./repResets";
import type { RepresentativeStore } from "./repStore";

const p7 = { date: "2026-10-07", at: "2026-10-07T09:00:00.000Z" };
const p11 = { date: "2026-10-11", at: "2026-10-11T20:00:00.000Z" };
const rec = (date: string, createdAt = `${date}T12:00:00.000Z`) => ({ date, createdAt });

describe("🗄 a rep's resets as saved versions", () => {
  it("a new reset keeps the old one; undo goes back to it, never to «no reset»", () => {
    const once = applyRepReset({}, p7);
    expect(once).toEqual({ resetFrom: p7, resetHistory: undefined });
    const twice = applyRepReset(once, p11);
    expect(twice).toEqual({ resetFrom: p11, resetHistory: [p7] });
    const back = undoRepReset(twice);
    expect(back.resetFrom).toEqual(p7);
    // the undone reset stays saved
    expect(repResetPoints(back)).toEqual([p7, p11]);
    expect(undoRepReset(back).resetFrom).toBeUndefined();
    // and can be made current again
    expect(pickRepReset(back, p11).resetFrom).toEqual(p11);
  });

  it("each period between two resets is its own version", () => {
    const rep = { resetFrom: p11, resetHistory: [p7] };
    const versions = repVersions(rep);
    expect(versions).toEqual([{ from: p11 }, { from: p7, to: p11 }, { to: p7 }]);
    expect(inRepVersion(versions[0]!, rec("2026-10-12"))).toBe(true);
    expect(inRepVersion(versions[1]!, rec("2026-10-09"))).toBe(true);
    expect(inRepVersion(versions[1]!, rec("2026-10-12"))).toBe(false);
    expect(inRepVersion(versions[2]!, rec("2026-10-01"))).toBe(true);
    expect(inRepVersion(versions[2]!, rec("2026-10-09"))).toBe(false);
    expect(repVersions({})).toEqual([{}]);
  });

  it("finds the resets older versions overwrote (the profit fresh start remembered them)", () => {
    const store = { r1: { id: "r1", name: "أ", commissionPercent: 50, createdAt: "", updatedAt: "" } } as RepresentativeStore;
    const seeded = seedRepResetHistory(store, { ...p11, previousRepResets: { r1: p7, gone: null } });
    // his reset was undone completely: both points come back as saved versions, none is forced on him
    expect(seeded.r1!.resetFrom).toBeUndefined();
    expect(seeded.r1!.resetHistory).toEqual([p7, p11]);
    expect(seedRepResetHistory(seeded, { ...p11, previousRepResets: { r1: p7 } })).toBe(seeded);
    expect(seedRepResetHistory(store, null)).toBe(store);
  });
});
