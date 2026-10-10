import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import { orphanProofIds, parseProofs, serializeProofs } from "./paymentProofs";

const entry = (id: string) => ({ id, kind: "credit", amount: 1, currency: "MRU", date: "2026-09-27", note: "", email: "", createdAt: "" }) as LedgerEntry;

describe("payment proofs", () => {
  it("round-trips through the backup value and drops anything that isn't an image", () => {
    const proofs = { p1: "data:image/jpeg;base64,AAA", p2: "data:image/png;base64,BBB" };
    expect(parseProofs(serializeProofs(proofs))).toEqual(proofs);
    expect(parseProofs(JSON.stringify({ p1: "data:image/jpeg;base64,A", bad: "javascript:x", n: 5 }))).toEqual({ p1: "data:image/jpeg;base64,A" });
    expect(parseProofs("not json")).toEqual({});
    expect(parseProofs(undefined)).toEqual({});
  });

  it("finds photos whose payment is gone, but never on an empty ledger", () => {
    const ledger = { d1: [entry("p1")], d2: [entry("p3")] };
    expect(orphanProofIds(["p1", "p2", "p3"], ledger)).toEqual(["p2"]);
    expect(orphanProofIds(["p1", "p2"], {})).toEqual([]);
    expect(orphanProofIds(["p1"], { d1: [] })).toEqual([]);
  });

  it("keeps photos owned by a party adjustment or a card movement (not a ledger entry)", () => {
    const ledger = { d1: [entry("p1")] };
    // p2 is a party-adjustment photo, p3 a card-movement photo - both owners still exist, so neither is an orphan.
    expect(orphanProofIds(["p1", "p2", "p3", "gone"], ledger, ["p2", "p3"])).toEqual(["gone"]);
  });
});
