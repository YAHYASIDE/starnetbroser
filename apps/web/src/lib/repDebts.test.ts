import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { clientRepIds, clientRepNames, matchesClientOwner, repDevicesDebt } from "./repDebts";
import type { LedgerEntry } from "./ledgerStore";

const acc = (o: Partial<StarlinkAccountSummary>) => ({ id: "x", name: "x", ...o }) as StarlinkAccountSummary;
const e = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "e", kind: "debit", amount: 0, currency: "MRU", note: "", email: "", date: "2026-09-01", createdAt: "", ...o });
const now = "2026-09-01T00:00:00.000Z";
const reps = {
  r1: { id: "r1", name: "سالم", commissionPercent: 50, createdAt: now, updatedAt: now },
  r2: { id: "r2", name: "أحمد", commissionPercent: 30, createdAt: now, updatedAt: now },
};

describe("clientRepNames", () => {
  it("lists each rep of the client's devices once, skipping deleted devices", () => {
    const accounts = [
      acc({ id: "a", clientId: "c1", representativeId: "r1" }),
      acc({ id: "b", clientId: "c1", representativeId: "r1" }),
      acc({ id: "c", clientId: "c1", representativeId: "r2", deletedAt: now }),
      acc({ id: "d", clientId: "c2", representativeId: "r2" }),
      acc({ id: "e", clientId: "c1" }),
    ];
    expect(clientRepNames("c1", accounts, reps)).toEqual(["سالم"]);
    expect(clientRepNames("c2", accounts, reps)).toEqual(["أحمد"]);
    expect(clientRepNames("c3", accounts, reps)).toEqual([]);
  });
});

describe("repDevicesDebt", () => {
  it("adds up what the customers of the rep's devices still owe, per currency", () => {
    const accounts = [
      acc({ id: "a", representativeId: "r1" }),
      acc({ id: "b", representativeId: "r1" }),
      acc({ id: "c", representativeId: "r1" }),
      acc({ id: "d", representativeId: "r2" }),
    ];
    const ledger = {
      a: [e({ amount: 120000 }), e({ kind: "credit", amount: 20000 }), e({ amount: 12500, currency: "SIFA" })],
      b: [e({ amount: 5000 }), e({ kind: "credit", amount: 8000 })], // in credit - adds nothing
      c: [e({ amount: 100, currency: "USD" }), e({ kind: "credit", amount: 100, currency: "USD" })], // paid up
      d: [e({ amount: 999 })],
    };
    const debt = repDevicesDebt("r1", accounts, ledger);
    expect(debt.rows).toEqual([{ accountId: "a", owed: { MRU: 100000, SIFA: 12500 } }]);
    expect(debt.totalByCurrency).toEqual({ MRU: 100000, SIFA: 12500 });
  });
});

describe("clients page: my customers / the reps' customers", () => {
  const devices = [
    { id: "a1", clientId: "c1", representativeId: "r1" },
    { id: "a2", clientId: "c1", representativeId: "r2" },
    { id: "a3", clientId: "c2" },
    { id: "a4", clientId: "c3", representativeId: "r1", deletedAt: "2026-10-01" },
  ] as unknown as StarlinkAccountSummary[];

  it("tells whose customer each one is, and filters by it", () => {
    expect(clientRepIds("c1", devices)).toEqual(["r1", "r2"]);
    expect(clientRepIds("c2", devices)).toEqual([]);
    expect(clientRepIds("c3", devices)).toEqual([]); // only a deleted device of r1
    expect(matchesClientOwner([], "mine")).toBe(true);
    expect(matchesClientOwner(["r1"], "mine")).toBe(false);
    expect(matchesClientOwner(["r1"], "reps")).toBe(true);
    expect(matchesClientOwner(["r1", "r2"], { repId: "r2" })).toBe(true);
    expect(matchesClientOwner([], { repId: "r2" })).toBe(false);
    expect(matchesClientOwner([], "all")).toBe(true);
  });
});
