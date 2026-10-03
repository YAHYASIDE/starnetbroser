import { describe, expect, it } from "vitest";
import { applyLedgerEntryEdit } from "./ledgerEntryEdit";
import type { LedgerEntry } from "./ledgerStore";

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return { id: "e", kind: "debit", amount: 100, currency: "MRU", note: "", email: "", date: "2026-09-20", createdAt: "2026-09-20T10:00:00.000Z", ...overrides };
}

describe("applyLedgerEntryEdit", () => {
  it("edits one entry in place and leaves the others", () => {
    const store = { d1: [entry({ id: "a" }), entry({ id: "b", amount: 50 })], d2: [entry({ id: "c" })] };
    const result = applyLedgerEntryEdit(store, [], "d1", "a", { amount: 45000, note: "تصحيح" }, "جهاز");
    expect(result.ledgerStore.d1[0]).toMatchObject({ id: "a", amount: 45000, note: "تصحيح" });
    expect(result.ledgerStore.d1[1]).toBe(store.d1[1]);
    expect(result.ledgerStore.d2).toBe(store.d2);
  });

  it("keeps the till in step when a payment's amount changes", () => {
    const pay = entry({ id: "p", kind: "credit", amount: 1000 });
    const till = [{ id: "k", kind: "in" as const, amount: 1000, currencyCode: "MRU", date: "2026-09-20", note: "", sourceId: "p", sourceKind: "device-payment" as const, createdAt: "" }];
    const result = applyLedgerEntryEdit({ d1: [pay] }, till, "d1", "p", { amount: 1500, date: "2026-09-21" }, "جهاز");
    expect(result.cash).toEqual([{ ...till[0], amount: 1500, date: "2026-09-21" }]);
  });
});
