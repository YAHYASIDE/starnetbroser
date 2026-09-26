import { describe, expect, it } from "vitest";
import { computeTodaySummary, deviceMatchesQuery, normalizeSearchText, searchEverything } from "./homeInsights";
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
