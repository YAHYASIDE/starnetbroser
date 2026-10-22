import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntry } from "./cashStore";
import type { LedgerEntry } from "./ledgerStore";
import { auditRep, repAuditReport, type RepAuditInput } from "./repAudit";
import type { RepRequest } from "./repRequests";
import type { RepSettlement } from "./repStore";

const T = "2026-10-22T10:00:00.000Z";
const later = (ms: number) => new Date(Date.parse(T) + ms).toISOString();

function settlement(patch: Partial<RepSettlement>): RepSettlement {
  return { id: `s${Math.random()}`, representativeId: "r1", kind: "cashHandover", amount: 10000, currencyCode: "SIFA", date: "2026-10-22", createdAt: T, ...patch };
}

function entry(patch: Partial<LedgerEntry>): LedgerEntry {
  return { id: `e${Math.random()}`, kind: "debit", amount: 5000, currency: "SIFA", note: "", email: "", date: "2026-10-01", createdAt: T, ...patch } as LedgerEntry;
}

const base = (patch: Partial<RepAuditInput> = {}): RepAuditInput => ({
  repId: "r1",
  repName: "مندوب تجريبي",
  settlements: [],
  ledger: {},
  accounts: [],
  ledgerBook: { ledgers: [], entries: [] },
  requests: [],
  cash: [],
  ...patch,
});

describe("auditRep", () => {
  it("a clean account has nothing", () => {
    const s = settlement({ id: "s1", accountId: "bank" });
    expect(auditRep(base({ settlements: [s] }))).toEqual([]);
    expect(repAuditReport([], "2026-10-22")).toContain("لا مشاكل");
  });

  it("finds one bot message recorded twice", () => {
    const a = settlement({ id: "a", botId: "b1", handoverId: "h1", accountId: "bank" });
    const b = settlement({ id: "b", botId: "b1", handoverId: "h2", accountId: "bank", createdAt: later(3_600_000) });
    const found = auditRep(base({ settlements: [a, b] }));
    expect(found.map((f) => f.kind)).toEqual(["duplicateBot"]);
    expect(found[0]!.text).toContain("سُجّلت 2 مرات");
  });

  it("flags the same operation twice within minutes, but not the parts of one handover", () => {
    const a = settlement({ id: "a", accountId: "bank" });
    const b = settlement({ id: "b", accountId: "bank", createdAt: later(60_000) });
    expect(auditRep(base({ settlements: [a, b] })).map((f) => f.kind)).toEqual(["maybeDuplicate"]);
    const c = settlement({ id: "c", accountId: "bank", createdAt: later(10 * 60_000) });
    expect(auditRep(base({ settlements: [a, c] }))).toEqual([]);
  });

  it("finds a bot handover whose parts were partly deleted", () => {
    const request = { id: "q", repId: "r1", kind: "handover", status: "approved", botId: "b9", amount: 10000, currency: "SIFA", text: "", createdAt: T } as RepRequest;
    const device = entry({ id: "d", kind: "credit", amount: 4000, heldByRepId: "r1", handoverId: "h", botId: "b9" });
    const rest = settlement({ id: "rest", amount: 6000, handoverId: "h", botId: "b9", accountId: "bank" });
    expect(auditRep(base({ requests: [request], ledger: { dev: [device] }, settlements: [rest] }))).toEqual([]);
    const found = auditRep(base({ requests: [request], ledger: { dev: [device] } }));
    expect(found.map((f) => f.kind)).toEqual(["handoverMismatch"]);
    expect(found[0]!.text).toContain("4,000 سيفا");
  });

  it("finds a 💱 swap missing one of its three records", () => {
    const swap = { toAmount: 1000, toCurrency: "SIFA", rate: 3600 };
    const moneyRec = settlement({ id: "m", currencyCode: "MRU", amount: 3600, handoverId: "x", swap, accountId: "bank" });
    const out = settlement({ id: "o", kind: "manualDebit", currencyCode: "MRU", amount: 3600, handoverId: "x", note: "💱 حُوّلت" });
    const into = settlement({ id: "i", kind: "manualCredit", amount: 1000, handoverId: "x", note: "💱 من دفعة" });
    expect(auditRep(base({ settlements: [moneyRec, out, into] }))).toEqual([]);
    const found = auditRep(base({ settlements: [out, into] }));
    expect(found.map((f) => f.kind)).toEqual(["swapIncomplete"]);
    expect(found[0]!.text).toContain("المبلغ المدفوع");
  });

  it("finds الكاش left after a deleted rep record, and a cash handover never in الكاش", () => {
    const orphan = { id: "c1", kind: "in", amount: 5000, currencyCode: "MRU", date: "2026-10-20", category: "تسليم مندوب", note: "مندوب تجريبي - x", sourceId: "gone", sourceKind: "rep-settlement", createdAt: T } as CashEntry;
    const s = settlement({ id: "s1" });
    const found = auditRep(base({ cash: [orphan], settlements: [s] }));
    expect(found.map((f) => f.kind).sort()).toEqual(["missingCash", "orphanCash"]);
    expect(found.find((f) => f.kind === "orphanCash")!.anon).not.toContain("مندوب تجريبي");
  });

  it("explains debt that moved: a device now held by someone else or in the trash", () => {
    const moved = { id: "dev1", name: "جهاز الزبون", representativeId: "r2" } as StarlinkAccountSummary;
    const trashed = { id: "dev2", name: "جهاز آخر", representativeId: "r1", deletedAt: T } as StarlinkAccountSummary;
    const found = auditRep(
      base({
        accounts: [moved, trashed],
        ledger: { dev1: [entry({ representativeId: "r1" })], dev2: [entry({ representativeId: "r1", amount: 7000 })] },
      }),
    );
    expect(found.map((f) => f.kind).sort()).toEqual(["deletedDevice", "movedDevice"]);
    const trash = found.find((f) => f.kind === "deletedDevice")!;
    expect(trash.text).toContain("«جهاز آخر»");
    expect(trash.anon).not.toContain("جهاز آخر");
    expect(trash.text).toContain("7,000 سيفا");
    expect(repAuditReport(found, "2026-10-22")).not.toContain("جهاز الزبون");
  });
});
