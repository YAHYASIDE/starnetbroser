import { describe, expect, it } from "vitest";
import {
  CashEntry,
  CashEntryList,
  computeCashBalanceByCurrency,
  deleteCashEntry,
  listCashEntries,
  listStandaloneCashEntries,
  recordCashEntry,
} from "./cashStore";

function entry(overrides: Partial<CashEntry> = {}): CashEntry {
  return {
    id: "e1",
    kind: "in",
    amount: 100,
    currencyCode: "MRU",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("recordCashEntry", () => {
  it("rejects a non-positive amount", () => {
    const result = recordCashEntry([], { kind: "in", amount: 0, currencyCode: "MRU", date: "2026-09-20" });
    expect(result.ok).toBe(false);
  });

  it("appends a valid entry with trimmed category/note", () => {
    const result = recordCashEntry([], {
      kind: "out",
      amount: 500,
      currencyCode: "MRU",
      date: "2026-09-20",
      category: "  إيجار  ",
      note: "  دفعة شهرية  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(1);
      expect(result.entry.category).toBe("إيجار");
      expect(result.entry.note).toBe("دفعة شهرية");
    }
  });

  it("keeps invoiceId when given, for later exclusion from standalone expenses", () => {
    const result = recordCashEntry([], { kind: "in", amount: 100, currencyCode: "MRU", date: "2026-09-20", invoiceId: "inv1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.invoiceId).toBe("inv1");
  });
});

describe("deleteCashEntry", () => {
  it("removes only the given entry", () => {
    const entries: CashEntryList = [entry({ id: "1" }), entry({ id: "2" })];
    const next = deleteCashEntry(entries, "1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("2");
  });
});

describe("computeCashBalanceByCurrency", () => {
  it("is empty with no entries", () => {
    expect(computeCashBalanceByCurrency([])).toEqual({});
  });

  it("sums in minus out, grouped by currency", () => {
    const entries: CashEntryList = [
      entry({ id: "1", kind: "in", amount: 1000, currencyCode: "MRU" }),
      entry({ id: "2", kind: "out", amount: 300, currencyCode: "MRU" }),
      entry({ id: "3", kind: "in", amount: 50, currencyCode: "USD" }),
    ];
    expect(computeCashBalanceByCurrency(entries)).toEqual({ MRU: 700, USD: 50 });
  });
});

describe("listCashEntries", () => {
  it("sorts newest first by date", () => {
    const entries: CashEntryList = [
      entry({ id: "1", date: "2026-09-01", createdAt: "t1" }),
      entry({ id: "2", date: "2026-09-05", createdAt: "t2" }),
      entry({ id: "3", date: "2026-09-03", createdAt: "t3" }),
    ];
    expect(listCashEntries(entries).map((e) => e.id)).toEqual(["2", "3", "1"]);
  });
});

describe("listStandaloneCashEntries", () => {
  it("keeps only entries with no invoiceId", () => {
    const entries: CashEntryList = [
      entry({ id: "1", invoiceId: undefined }),
      entry({ id: "2", invoiceId: "inv1" }),
      entry({ id: "3", invoiceId: undefined }),
    ];
    expect(listStandaloneCashEntries(entries).map((e) => e.id)).toEqual(["1", "3"]);
  });
});
