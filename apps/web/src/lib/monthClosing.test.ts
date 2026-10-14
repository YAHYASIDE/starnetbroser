import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import {
  buildMonthReport,
  buildMonthReportPdf,
  closedMonthQuestion,
  closedMonthsAmong,
  closeMonth,
  ledgerEntryMonthDates,
  monthLabel,
  recentMonths,
  reopenMonth,
} from "./monthClosing";

function shipment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 100,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-20" },
    ...overrides,
  };
}

describe("month closings", () => {
  const now = new Date("2026-10-01T09:00:00.000Z");

  it("closes and reopens a month", () => {
    const closed = closeMonth({}, "2026-09", now);
    expect(closed["2026-09"]).toEqual({ month: "2026-09", closedAt: now.toISOString() });
    expect(reopenMonth(closed, "2026-09")).toEqual({});
  });

  it("finds the closed months an operation touches", () => {
    const closings = closeMonth(closeMonth({}, "2026-08", now), "2026-09", now);
    expect(closedMonthsAmong(closings, ["2026-09-30", "2026-10-02", undefined, "2026-09-01", "2026-08-15"])).toEqual(["2026-08", "2026-09"]);
    expect(closedMonthQuestion(closings, ["2026-10-02"])).toBeNull();
    expect(closedMonthQuestion(closings, ["2026-09-12"])).toContain("سبتمبر 2026");
  });

  it("places a shipment in the month it was sold and the month Starlink was paid", () => {
    const paidLater = shipment({ starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-10-04" } });
    expect(ledgerEntryMonthDates(paidLater)).toEqual(["2026-09-20", "2026-10-04"]);
    expect(ledgerEntryMonthDates(shipment({ starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } }))).toEqual(["2026-09-20"]);
  });

  it("labels and lists months", () => {
    expect(monthLabel("2026-09")).toBe("سبتمبر 2026");
    expect(recentMonths("2026-02-10", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
  });
});

describe("buildMonthReport", () => {
  const ledger = {
    d1: [
      // Sold in September, Starlink paid in September: rep r1 at 50%, MRU rate locked at 40.
      shipment({ id: "a", representativeId: "r1", representativeCommissionPercent: 50, profitCurrencyRates: { MRU: 40 } }),
      // Sold in September, paid on 4 October - October's profit.
      shipment({ id: "b", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-10-04" } }),
      // Still D.
      shipment({ id: "c", starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } }),
      shipment({ id: "pay", kind: "credit", starlinkCost: undefined }),
    ],
    d2: [
      // No locked rate: today's (41) is used and the report is marked approximate.
      shipment({ id: "d", date: "2026-09-02", amount: 50, starlinkCost: { status: "settled", currencyCode: "USD", amount: 70, paidAt: "2026-09-02" } }),
    ],
  };

  it("counts the profit on the day Starlink was paid, each shipment at its own rate", () => {
    const report = buildMonthReport(ledger, "2026-09", 41);
    expect(report.rows.map((r) => r.entry.id)).toEqual(["d", "a"]);
    expect(report.rows[1]).toMatchObject({ profitUsd: 40, profitMru: 1600, repShareMru: 800, exact: true });
    expect(report.rows[0]).toMatchObject({ profitUsd: -20, profitMru: -820, repShareMru: 0, exact: false });
    expect(report.profitMru).toBe(780);
    expect(report.repSharesMru).toBe(800);
    expect(report.netMru).toBe(-20);
    expect(report.exact).toBe(false);
    expect(report.reps).toEqual([{ representativeId: "r1", shipmentCount: 1, profitMru: 1600, repShareMru: 800, ourShareMru: 800 }]);
  });

  it("puts a shipment paid next month into next month's report", () => {
    expect(buildMonthReport(ledger, "2026-10", 41).rows.map((r) => r.entry.id)).toEqual(["b"]);
  });

  it("builds the owner's PDF with each rep's share and every shipment", () => {
    const report = buildMonthReport(ledger, "2026-09", 41);
    const doc = buildMonthReportPdf(report, {
      accountName: (id) => (id === "d1" ? "منزل" : "مقهى"),
      clientName: () => undefined,
      repName: () => "سالم",
    });
    expect(doc.partyName).toBe("شهر سبتمبر 2026");
    expect(doc.summary.map((s) => s.label)).toEqual(["ربح الشهر", "حصص المندوبين", "صافي ربحي", "حصة سالم (1 شحنة)"]);
    expect(doc.summary[0]!.value).toBe("780 أوقية");
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows[0]![4]).toBe("≈ -820 أوقية");
    expect(doc.rows[1]!.slice(1, 6)).toEqual(["منزل", "—", "سالم", "1,600 أوقية", "800 أوقية"]);
    expect(doc.footerNote).toContain("≈");
  });
});
