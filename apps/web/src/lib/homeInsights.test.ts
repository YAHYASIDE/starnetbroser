import { describe, expect, it } from "vitest";
import { computeTodaySummary, deviceMatchesQuery, editDistance, listTodayLines, normalizeSearchText, searchEverything, searchTermOf } from "./homeInsights";
import type { LedgerEntry } from "./ledgerStore";
import type { CashEntry } from "./cashStore";

function entry(o: Partial<LedgerEntry>): LedgerEntry {
  return { id: "e", kind: "debit", amount: 100, currency: "MRU", note: "", email: "", date: "2026-09-25", createdAt: "x", ...o };
}
function cash(o: Partial<CashEntry>): CashEntry {
  return { id: "c", kind: "in", amount: 10, currencyCode: "MRU", date: "2026-09-25", createdAt: "x", ...o };
}

describe("computeTodaySummary", () => {
  it("sums only today's device operations and cash, per currency", () => {
    const ledger = {
      d1: [entry({ id: "1" }), entry({ id: "2", kind: "credit", amount: 40 }), entry({ id: "3", date: "2026-09-24" })],
      d2: [entry({ id: "4", kind: "credit", amount: 5, currency: "USD" })],
    };
    const summary = computeTodaySummary(ledger, [cash({}), cash({ kind: "out", amount: 3 }), cash({ date: "2026-09-01" })], "2026-09-25");
    expect(summary).toEqual({
      collected: { MRU: 40, USD: 5 },
      charged: { MRU: 100 },
      cashIn: { MRU: 10 },
      cashOut: { MRU: 3 },
      operations: 3,
    });
  });
});

describe("search", () => {
  const sources = {
    clients: [{ id: "c1", name: "محمد أحمد", phone: "+222 12345678" }, { id: "c2", name: "سالم" }],
    suppliers: [{ id: "s1", name: "شركة الأمل" }],
    representatives: [{ id: "r1", name: "أحمد المندوب" }],
    items: [{ id: "i1", name: "كابل", code: "CBL-01" }],
  };

  it("folds Arabic letter variants", () => {
    expect(normalizeSearchText("أحمد إبراهيم ليلى فاطمة")).toBe("احمد ابراهيم ليلي فاطمه");
  });

  it("finds clients, reps, suppliers and items by name, phone digits or code", () => {
    expect(searchEverything("احمد", sources).map((r) => [r.kind, r.id])).toEqual([
      ["client", "c1"],
      ["representative", "r1"],
    ]);
    expect(searchEverything("1234", sources).map((r) => r.id)).toEqual(["c1"]);
    expect(searchEverything("cbl", sources).map((r) => r.id)).toEqual(["i1"]);
    expect(searchEverything("الامل", sources).map((r) => r.id)).toEqual(["s1"]);
    expect(searchEverything("  ", sources)).toEqual([]);
  });

  it("matches a device by its linked client's name or phone", () => {
    const device = { name: "منزل", kitNumber: "KIT1", serialNumber: "SN" };
    expect(deviceMatchesQuery("محمد", device, { name: "محمد أحمد" })).toBe(true);
    expect(deviceMatchesQuery("kit1", device)).toBe(true);
    expect(deviceMatchesQuery("سالم", device, { name: "محمد" })).toBe(false);
  });

  it("finds a device by any Starlink identifier, ignoring spaces, dashes and case", () => {
    const d = {
      name: "x",
      kitNumber: "KIT304012345",
      serialNumber: "2DWC-2401-0012",
      subscriptionId: "SL-DF-12201133-43672-91",
      accountNumber: "ACC-2877-1123-44",
    };
    expect(deviceMatchesQuery("kit 3040 12345", d)).toBe(true);
    expect(deviceMatchesQuery("2dwc24010012", d)).toBe(true);
    expect(deviceMatchesQuery("12201133", d)).toBe(true);
    expect(deviceMatchesQuery("sl df 1220", d)).toBe(true);
    expect(deviceMatchesQuery("ACC28771123", d)).toBe(true);
    expect(deviceMatchesQuery("KIT9999", d)).toBe(false);
  });
});

describe("listTodayLines", () => {
  it("lists what makes each tile: payments, shipments (with D), cash in before out", () => {
    const today = "2026-10-02";
    const ledger = {
      a1: [
        { id: "p1", kind: "credit" as const, amount: 5000, currency: "MRU" as const, note: "دفعة", email: "", date: today, createdAt: "" },
        { id: "s1", kind: "debit" as const, amount: 16000, currency: "MRU" as const, note: "", email: "", date: today, createdAt: "", starlinkCost: { status: "pending" as const, currencyCode: "USD", amount: 30 } },
        { id: "old", kind: "debit" as const, amount: 9000, currency: "MRU" as const, note: "", email: "", date: "2026-10-01", createdAt: "" },
      ],
    };
    const cash = [
      { id: "c1", kind: "out" as const, amount: 300, currencyCode: "MRU", date: today, category: "نقل", createdAt: "" },
      { id: "c2", kind: "in" as const, amount: 100, currencyCode: "MRU", date: today, note: "إيداع", createdAt: "" },
    ];
    const lines = listTodayLines(ledger, cash, today);
    expect(lines.collected.map((l) => [l.id, l.accountId, l.amount])).toEqual([["p1", "a1", 5000]]);
    expect(lines.charged.map((l) => [l.id, l.pendingD])).toEqual([["s1", true]]);
    expect(lines.cash.map((l) => [l.id, l.label, l.kind])).toEqual([["c2", "إيداع", "in"], ["c1", "نقل", "out"]]);
  });
});

describe("🔍 his Oct 18 2026 search: any part of the name, typos, a pasted email", () => {
  const device = { name: "أحمد ولد سالم", kitNumber: "KIT304012345", serialNumber: "", expectedEmail: "salehstarlink@outlook.com" };

  it("words in any order, any part of the name", () => {
    expect(deviceMatchesQuery("سالم أحمد", device)).toBe(true);
    expect(deviceMatchesQuery("ولد", device)).toBe(true);
    expect(deviceMatchesQuery("سالم 3040", device)).toBe(true);
    expect(deviceMatchesQuery("سالم محمد", device)).toBe(false);
    expect(deviceMatchesQuery("أَحْمَد", device)).toBe(true); // diacritics
  });

  it("typos are found only when asked (the fallback), never in numbers", () => {
    expect(deviceMatchesQuery("احمض", device)).toBe(false);
    expect(deviceMatchesQuery("احمض", device, undefined, true)).toBe(true);
    expect(deviceMatchesQuery("سلام", device, undefined, true)).toBe(true); // swapped letters
    expect(deviceMatchesQuery("salehstarlnk", device, undefined, true)).toBe(true);
    expect(deviceMatchesQuery("salehst", device, undefined, true)).toBe(true); // still typing
    expect(deviceMatchesQuery("زيد", device, undefined, true)).toBe(false); // too short to guess
    expect(deviceMatchesQuery("304099", device, undefined, true)).toBe(false);
    expect(deviceMatchesQuery("خالد", device, undefined, true)).toBe(false);
    // the first letter must be right
    expect(deviceMatchesQuery("سلام", { name: "سوبر ماركت الأمل", kitNumber: "", serialNumber: "" }, undefined, true)).toBe(false);
    expect(deviceMatchesQuery("محمض", { name: "احمد", kitNumber: "", serialNumber: "" }, undefined, true)).toBe(false);
  });

  it("a pasted line with an email searches the email alone", () => {
    expect(searchTermOf("salehstarlink@outlook.com يحتاج كذا")).toBe("salehstarlink@outlook.com");
    expect(searchTermOf("الإيميل: SalehStarlink@Outlook.com، شكرًا")).toBe("salehstarlink@outlook.com");
    expect(searchTermOf("salehstarlink@outlook.com")).toBe("salehstarlink@outlook.com");
    expect(searchTermOf("أحمد سالم")).toBe("أحمد سالم");
    expect(searchTermOf("saleh@")).toBe("saleh@");
  });

  it("edit distance counts a swap as one", () => {
    expect(editDistance("سالم", "سلام")).toBe(1);
    expect(editDistance("محمد", "مخمد")).toBe(1);
    expect(editDistance("abc", "xyz", 2)).toBe(3);
  });
});
