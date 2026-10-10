import { describe, expect, it } from "vitest";
import { hiddenRepIds, isHiddenRepClient, isHiddenRepDevice, repContact, visibleClients } from "./repSeparation";
import { setRepCustomersHidden, type RepresentativeStore } from "./repStore";

const rep = (id: string, extra: object = {}) => ({ id, name: `مندوب ${id}`, phone: "22200000", commissionPercent: 50, createdAt: "", updatedAt: "", ...extra });

describe("🔒 a rep's customers hidden from the operator", () => {
  const reps: RepresentativeStore = { r1: rep("r1", { customersHidden: true }), r2: rep("r2") };
  const hidden = hiddenRepIds(reps);

  it("only the reps with the switch on", () => {
    expect([...hidden]).toEqual(["r1"]);
    expect(isHiddenRepDevice({ representativeId: "r1" }, hidden)).toBe(true);
    expect(isHiddenRepDevice({ representativeId: "r2" }, hidden)).toBe(false);
    expect(isHiddenRepDevice({}, hidden)).toBe(false);
  });

  it("a customer is hidden while he belongs to that rep - ours and back-to-us customers stay", () => {
    const his = { repSegments: [{ repId: "r1", from: "2026-01-01", carry: true }] };
    const back = { repSegments: [{ repId: "r1", from: "2026-01-01", carry: true }, { from: "2026-05-01", carry: false }] };
    const ours = {};
    expect(isHiddenRepClient(his, hidden)).toBe(true);
    expect(isHiddenRepClient(back, hidden)).toBe(false);
    expect(visibleClients([his, back, ours], hidden)).toEqual([back, ours]);
  });

  it("messages for a hidden device go to the rep; the switch turns on and off without losing anything", () => {
    expect(repContact({ representativeId: "r1" }, reps)).toEqual({ name: "مندوب r1", phone: "22200000" });
    const off = setRepCustomersHidden(reps, "r1", false);
    expect(off.r1!.customersHidden).toBeUndefined();
    expect(off.r1!.commissionPercent).toBe(50);
    expect(setRepCustomersHidden(off, "r1", true).r1!.customersHidden).toBe(true);
  });
});
