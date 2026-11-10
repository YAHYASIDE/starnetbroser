import { describe, expect, it } from "vitest";
import { adjustmentDeletions, BULK_LIMIT, cleanDeletedOps, deletedDay, deletedText, ledgerDeletions, liveIdsOf, restoreInList, restoreLedger, settlementDeletions, stillDeleted, withDeletions, type DeletedOp } from "./deletedOps";
import type { LedgerEntry } from "./ledgerStore";
import type { RepSettlement } from "./repStore";

// Fake data only.
const e = (id: string, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, kind: "credit", amount: 10000, currency: "SIFA", note: "", email: "", date: "2026-11-05", createdAt: "2026-11-05T10:00:00Z", ...extra });
const AT = "2026-11-10T12:00:00.000Z";

describe("🗑️ deleted operations stay in the statements (his Nov 10 2026 ask)", () => {
  it("a removed entry is logged with its device; a posted-with-another or an untouched one is not", () => {
    const before = { d1: [e("a"), e("b"), e("c", { invoiceId: "inv1" } as Partial<LedgerEntry>)], d2: [e("x")] };
    const log = ledgerDeletions(before, { d1: [], d2: [e("x")] }, AT);
    expect(log.map((d) => [d.store, d.record.id, d.store === "ledger" && d.accountId])).toEqual([["ledger", "a", "d1"], ["ledger", "b", "d1"]]);
  });

  it("an entry moved to another device is not a deletion", () => {
    expect(ledgerDeletions({ d1: [e("a")], d2: [] }, { d1: [], d2: [e("a")] }, AT)).toEqual([]);
  });

  it("a big clean-up is not «حذف عملية»", () => {
    const many = Array.from({ length: BULK_LIMIT + 1 }, (_, i) => e(`e${i}`));
    expect(ledgerDeletions({ d1: many }, { d1: [] }, AT)).toEqual([]);
  });

  it("settlements and له / عليه amounts too", () => {
    const s = { id: "s1", representativeId: "r1", kind: "cashHandover", amount: 5000, currencyCode: "SIFA", date: "2026-11-04", createdAt: "x" } as RepSettlement;
    expect(settlementDeletions([s], [], AT)[0]).toMatchObject({ store: "settlement", record: { id: "s1" } });
    expect(adjustmentDeletions([{ id: "j1", partyKind: "client", partyId: "c1", direction: "owesUs", amount: 3, currencyCode: "MRU", date: "2026-11-01", createdAt: "x" }], [], AT)[0]).toMatchObject({ store: "adjustment" });
  });

  it("back in its store → no longer shown; restoring puts it back once", () => {
    const [d] = ledgerDeletions({ d1: [e("a")] }, { d1: [] }, AT) as [Extract<DeletedOp, { store: "ledger" }>];
    const log = withDeletions([], [d]);
    expect(stillDeleted(log, liveIdsOf({ d1: [] }, [], []))).toHaveLength(1);
    const back = restoreLedger({ d1: [] }, d);
    expect(back.d1!.map((x) => x.id)).toEqual(["a"]);
    expect(restoreLedger(back, d)).toBe(back);
    expect(stillDeleted(log, liveIdsOf(back, [], []))).toHaveLength(0);
    expect(restoreInList([{ id: "1" }], { id: "1" })).toHaveLength(1);
  });

  it("reads in his words, on the day it was deleted", () => {
    const [d] = ledgerDeletions({ d1: [e("a", { note: "تحويل" })] }, { d1: [] }, AT);
    expect(deletedText(d!, () => "جهاز تجريبي")).toBe("🗑️ حُذفت: 💵 دفعة - جهاز تجريبي (05/11) · تحويل");
    expect(deletedDay(d!)).toMatch(/^2026-11-1[01]$/);
    expect(cleanDeletedOps([d, { id: 1 }, null])).toHaveLength(1);
    expect(withDeletions(withDeletions([], [d!]), [d!])).toHaveLength(1);
  });
});
