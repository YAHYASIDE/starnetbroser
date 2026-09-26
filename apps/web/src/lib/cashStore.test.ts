import { describe, expect, it } from "vitest";
import {
  CashEntry,
  CashEntryList,
  computeCashBalanceByCurrency,
  deleteCashEntry,
  listCashEntries,
  listStandaloneCashEntries,
  recordCashEntry,
  applyLedgerPaymentsToCash,
  removeLinkedCashEntries,
  postPartyAdjustmentToCash,
  postRepSettlementToCash,
  computeCashDaySummary,
  recordCashClosing,
  deleteCashClosing,
} from "./cashStore";
import type { PartyAdjustment } from "./partyBalanceStore";
import type { RepSettlement } from "./repStore";
import { LedgerEntry } from "./ledgerStore";

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

function payment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return { id: "p1", kind: "credit", amount: 100, currency: "MRU", note: "", email: "", date: "2026-09-25", createdAt: "x", ...overrides };
}

describe("applyLedgerPaymentsToCash", () => {
  it("posts a cash 'in' for a newly added payment only", () => {
    const old = payment({ id: "old" });
    const cash = applyLedgerPaymentsToCash([], [old], [old, payment({ id: "new", amount: 250 })], "منزل");
    expect(cash).toHaveLength(1);
    expect(cash[0]).toMatchObject({ kind: "in", amount: 250, currencyCode: "MRU", sourceId: "new", sourceKind: "device-payment" });
  });

  it("ignores new charges (debits)", () => {
    expect(applyLedgerPaymentsToCash([], [], [payment({ kind: "debit" })], "منزل")).toEqual([]);
  });

  it("removes the linked entry when the payment is deleted, and updates it when edited", () => {
    const posted = applyLedgerPaymentsToCash([], [], [payment()], "منزل");
    const edited = applyLedgerPaymentsToCash(posted, [payment()], [payment({ amount: 300 })], "منزل");
    expect(edited[0].amount).toBe(300);
    expect(applyLedgerPaymentsToCash(edited, [payment({ amount: 300 })], [], "منزل")).toEqual([]);
  });

  it("linked entries are not standalone expenses", () => {
    const posted = applyLedgerPaymentsToCash([], [], [payment()], "منزل");
    expect(listStandaloneCashEntries(posted)).toEqual([]);
    expect(removeLinkedCashEntries(posted, "p1")).toEqual([]);
  });
});

function adjustment(overrides: Partial<PartyAdjustment> = {}): PartyAdjustment {
  return {
    id: "a1",
    partyKind: "client",
    partyId: "c1",
    direction: "weOwe",
    amount: 500,
    currencyCode: "MRU",
    date: "2026-09-25",
    cashMoved: true,
    createdAt: "x",
    ...overrides,
  };
}

describe("postPartyAdjustmentToCash", () => {
  it("a client's payment (له) is cash in, a supplier payment (عليه) is cash out", () => {
    expect(postPartyAdjustmentToCash([], adjustment(), "أحمد")[0]).toMatchObject({ kind: "in", amount: 500, sourceId: "a1", sourceKind: "party-balance" });
    const supplier = adjustment({ partyKind: "supplier", direction: "owesUs" });
    expect(postPartyAdjustmentToCash([], supplier, "مورد")[0].kind).toBe("out");
  });

  it("does nothing when the entry did not move cash", () => {
    expect(postPartyAdjustmentToCash([], adjustment({ cashMoved: undefined }), "أحمد")).toEqual([]);
  });
});

describe("postRepSettlementToCash", () => {
  const settlement = (kind: RepSettlement["kind"]): RepSettlement => ({
    id: "s1",
    representativeId: "r1",
    kind,
    amount: 200,
    currencyCode: "USD",
    date: "2026-09-25",
    createdAt: "x",
  });

  it("handover is cash in, commission payout is cash out, manual adjustments never touch the till", () => {
    expect(postRepSettlementToCash([], settlement("cashHandover"), "علي")[0]).toMatchObject({ kind: "in", sourceKind: "rep-settlement" });
    expect(postRepSettlementToCash([], settlement("commissionPayout"), "علي")[0].kind).toBe("out");
    expect(postRepSettlementToCash([], settlement("manualCredit"), "علي")).toEqual([]);
    expect(postRepSettlementToCash([], settlement("manualDebit"), "علي")).toEqual([]);
  });
});

describe("daily cash closing", () => {
  const log: CashEntryList = [
    entry({ id: "1", kind: "in", amount: 1000, currencyCode: "MRU", date: "2026-09-24" }),
    entry({ id: "2", kind: "in", amount: 300, currencyCode: "MRU", date: "2026-09-25" }),
    entry({ id: "3", kind: "out", amount: 100, currencyCode: "MRU", date: "2026-09-25" }),
    entry({ id: "4", kind: "in", amount: 999, currencyCode: "MRU", date: "2026-09-26" }),
  ];

  it("summarises the day: opening, in, out and expected, ignoring later days", () => {
    expect(computeCashDaySummary(log, "2026-09-25").MRU).toEqual({ opening: 1000, in: 300, out: 100, expected: 1200 });
  });

  it("posts a shortage as a linked 'out' entry and deleting the closing removes it", () => {
    const result = recordCashClosing(log, [], "2026-09-25", { MRU: 1150 });
    if (!result.ok) throw new Error(result.message);
    expect(result.closing.lines).toEqual([{ currencyCode: "MRU", expected: 1200, counted: 1150, difference: -50 }]);
    const posted = result.cash.filter((e) => e.sourceKind === "closing");
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: "out", amount: 50, date: "2026-09-25" });
    const undone = deleteCashClosing(result.cash, result.closings, result.closing.id);
    expect(undone.cash).toEqual(log);
    expect(undone.closings).toEqual([]);
  });

  it("a matching count posts nothing", () => {
    const result = recordCashClosing(log, [], "2026-09-25", { MRU: 1200 });
    expect(result.ok && result.cash).toEqual(log);
  });
});
