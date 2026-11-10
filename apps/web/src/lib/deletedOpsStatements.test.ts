import { describe, expect, it } from "vitest";
import { ledgerDeletions, settlementDeletions } from "./deletedOps";
import { buildClientCombinedStatement } from "./clientAccount";
import { buildRepDailyStatement, repDeletedRows, type RepSettlement } from "./repStore";
import { buildRepPeriodStatement, keepCurrency } from "./repAccount";
import { repStatementTable, splitTableByCurrency } from "./repStatementDoc";
import { repRowText } from "./repRowText";
import type { LedgerEntry } from "./ledgerStore";

// Fake data only.
const pay = (id: string, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, kind: "credit", amount: 10000, currency: "SIFA", note: "", email: "", date: "2026-11-05", createdAt: "2026-11-05T10:00:00Z", ...extra });

describe("🗑️ a deleted operation in the customer's statement", () => {
  it("shows as the newest row at the moment it was deleted, the balance unchanged; a later one comes above it", () => {
    const charge: LedgerEntry = { ...pay("c1"), kind: "debit", amount: 30000, date: "2026-11-01", createdAt: "2026-11-01T09:00:00Z" };
    const deleted = ledgerDeletions({ d1: [charge, pay("p1")] }, { d1: [charge] }, "2026-11-10T12:00:00.000Z");
    const later = pay("p2", { amount: 5000, date: "2026-11-11", createdAt: "2026-11-11T08:00:00Z" });
    const rows = buildClientCombinedStatement([], [], "c-1", [{ id: "d1", name: "جهاز تجريبي" }], { d1: [charge, later] }, [], deleted);
    expect(rows.map((r) => r.type)).toEqual(["device-payment", "deleted", "device-charge"]);
    const del = rows[1]!;
    expect(del).toMatchObject({ delta: 0, amount: 10000, balanceAfter: 30000 });
    expect(del.note).toContain("🗑️ حُذفت: 💵 دفعة - جهاز تجريبي");
    expect(rows[0]!.balanceAfter).toBe(25000);
  });

  it("another customer's device is not his", () => {
    const deleted = ledgerDeletions({ d9: [pay("p1")] }, { d9: [] }, "2026-11-10T12:00:00.000Z");
    expect(buildClientCombinedStatement([], [], "c-1", [{ id: "d1", name: "x" }], { d1: [] }, [], deleted)).toEqual([]);
  });
});

describe("🗑️ a deleted operation in the rep's statement", () => {
  const s: RepSettlement = { id: "s1", representativeId: "r1", kind: "cashHandover", amount: 7000, currencyCode: "SIFA", date: "2026-11-04", createdAt: "2026-11-04T10:00:00Z" };
  it("his settlement → «ما عليه», shown in its currency's block, counting for nothing; another rep's is not his", () => {
    const log = [...settlementDeletions([s], [], "2026-11-10T12:00:00.000Z"), ...settlementDeletions([{ ...s, id: "s2", representativeId: "r2" }], [], "2026-11-10T12:00:00.000Z")];
    const rows = repDeletedRows("r1", log, new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ account: "debt", amount: 7000, currency: "SIFA" });
    const days = buildRepDailyStatement("r1", [], [], [], [], rows);
    const st = buildRepPeriodStatement(days, {}, keepCurrency);
    expect(st.debt.closing).toEqual({});
    const table = repStatementTable(st, st, "debt", keepCurrency);
    expect(table).toHaveLength(1);
    expect(splitTableByCurrency(table, st.debt.closing)[0]!.lines).toHaveLength(1);
    expect(repRowText(table[0]!.row, () => "")).toContain("🗑️ حُذفت:");
  });

  it("before his reset → not in his statement any more", () => {
    const log = settlementDeletions([s], [], "2026-11-10T12:00:00.000Z");
    expect(repDeletedRows("r1", log, new Set(), "2026-11-11T00:00:00.000Z")).toEqual([]);
  });

  it("a payment on his customer's device → his «ما عليه»", () => {
    const log = ledgerDeletions({ d1: [pay("p1")] }, { d1: [] }, "2026-11-10T12:00:00.000Z");
    expect(repDeletedRows("r1", log, new Set(["d1"]))[0]).toMatchObject({ account: "debt" });
    expect(repDeletedRows("r1", log, new Set(["d2"]))).toEqual([]);
  });
});
