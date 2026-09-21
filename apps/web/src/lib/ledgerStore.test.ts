import { describe, expect, it } from "vitest";
import {
  addEntry,
  computeBalance,
  createLedgerEntry,
  getAccountEntries,
  LedgerEntry,
  removeEntry,
  sortEntriesNewestFirst,
  totalOwedAcrossAccounts,
  withAccountEntries,
} from "./ledgerStore";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 10,
    note: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeBalance", () => {
  it("is zero for no entries", () => {
    expect(computeBalance([])).toBe(0);
  });

  it("sums debits as positive (customer owes)", () => {
    expect(computeBalance([entry({ kind: "debit", amount: 10 }), entry({ kind: "debit", amount: 5 })])).toBe(15);
  });

  it("subtracts credits (payments reduce what's owed)", () => {
    expect(computeBalance([entry({ kind: "debit", amount: 20 }), entry({ kind: "credit", amount: 8 })])).toBe(12);
  });

  it("goes negative once credits exceed debits (customer is in credit)", () => {
    expect(computeBalance([entry({ kind: "debit", amount: 5 }), entry({ kind: "credit", amount: 20 })])).toBe(-15);
  });
});

describe("addEntry / removeEntry", () => {
  it("addEntry appends without mutating the input array", () => {
    const original = [entry({ id: "a" })];
    const result = addEntry(original, entry({ id: "b" }));
    expect(original).toHaveLength(1);
    expect(result.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("removeEntry removes only the matching id, without mutating the input", () => {
    const original = [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })];
    const result = removeEntry(original, "b");
    expect(original).toHaveLength(3);
    expect(result.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("removeEntry on an unknown id is a safe no-op", () => {
    const original = [entry({ id: "a" })];
    expect(removeEntry(original, "does-not-exist")).toEqual(original);
  });
});

describe("sortEntriesNewestFirst", () => {
  it("orders by date descending", () => {
    const entries = [
      entry({ id: "old", date: "2026-09-01" }),
      entry({ id: "new", date: "2026-09-20" }),
      entry({ id: "mid", date: "2026-09-10" }),
    ];
    expect(sortEntriesNewestFirst(entries).map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks same-day ties by createdAt descending", () => {
    const entries = [
      entry({ id: "first", date: "2026-09-20", createdAt: "2026-09-20T08:00:00.000Z" }),
      entry({ id: "second", date: "2026-09-20", createdAt: "2026-09-20T14:00:00.000Z" }),
    ];
    expect(sortEntriesNewestFirst(entries).map((e) => e.id)).toEqual(["second", "first"]);
  });

  it("does not mutate the input array", () => {
    const entries = [entry({ id: "a", date: "2026-09-01" }), entry({ id: "b", date: "2026-09-20" })];
    sortEntriesNewestFirst(entries);
    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("getAccountEntries / withAccountEntries", () => {
  it("returns an empty array for an account with no entries yet", () => {
    expect(getAccountEntries({}, "acc-1")).toEqual([]);
  });

  it("withAccountEntries sets that account's entries without touching other accounts", () => {
    const store = { "acc-1": [entry({ id: "a" })] };
    const updated = withAccountEntries(store, "acc-2", [entry({ id: "b" })]);
    expect(getAccountEntries(updated, "acc-1")).toEqual(store["acc-1"]);
    expect(getAccountEntries(updated, "acc-2").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("createLedgerEntry", () => {
  it("trims the note and stores a positive amount as given", () => {
    const created = createLedgerEntry("credit", 25, "  دفعة نقدية  ", "2026-09-21");
    expect(created.kind).toBe("credit");
    expect(created.amount).toBe(25);
    expect(created.note).toBe("دفعة نقدية");
    expect(created.date).toBe("2026-09-21");
    expect(created.id).toBeTruthy();
  });

  it("gives two calls distinct ids", () => {
    const a = createLedgerEntry("debit", 1, "", "2026-09-21");
    const b = createLedgerEntry("debit", 1, "", "2026-09-21");
    expect(a.id).not.toBe(b.id);
  });
});

describe("totalOwedAcrossAccounts", () => {
  it("sums only the positive balances, ignoring accounts in credit", () => {
    const store = {
      "acc-1": [entry({ kind: "debit", amount: 30 })],
      "acc-2": [entry({ kind: "credit", amount: 50 })],
      "acc-3": [entry({ kind: "debit", amount: 10 }), entry({ kind: "debit", amount: 5 })],
    };
    expect(totalOwedAcrossAccounts(store)).toBe(45);
  });

  it("is zero when every account is settled or in credit", () => {
    const store = { "acc-1": [entry({ kind: "credit", amount: 5 })] };
    expect(totalOwedAcrossAccounts(store)).toBe(0);
  });

  it("is zero for an empty store", () => {
    expect(totalOwedAcrossAccounts({})).toBe(0);
  });
});
