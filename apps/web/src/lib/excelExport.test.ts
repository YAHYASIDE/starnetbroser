import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerEntry } from "./ledgerStore";
import { buildBusinessWorkbook, xlsxFileName } from "./excelExport";

const shipment: LedgerEntry = {
  id: "s1",
  kind: "debit",
  amount: 100,
  currency: "USD",
  note: "",
  email: "",
  date: "2026-09-10",
  createdAt: "2026-09-10T10:00:00.000Z",
  starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-12" },
  profitCurrencyRates: { MRU: 40 },
  representativeId: "r1",
  representativeCommissionPercent: 50,
};
const account = { id: "d1", name: "منزل", clientId: "c1", kitNumber: "KIT1", serialNumber: "SN1", balanceDue: "97", currency: "USD", rechargeDate: "2026/10/20" } as StarlinkAccountSummary;

describe("buildBusinessWorkbook", () => {
  const sheets = buildBusinessWorkbook({
    periodLabel: "شهر",
    exportedAt: new Date("2026-09-26T12:00:00.000Z"),
    accounts: [account],
    clientName: (id) => (id === "c1" ? "محمد" : undefined),
    clientPhone: () => "22212345",
    repName: (id) => (id === "r1" ? "سالم" : undefined),
    ledgerStore: { d1: [shipment] },
    profitByAccount: { d1: [shipment] },
    mruRate: 40,
    openDUsdByAccount: { d1: 70 },
    previousDebtUsdByAccount: {},
    debtors: [{ name: "محمد", byCurrency: { USD: 100, EUR: 5 }, mru: 4000, oldestDays: 16 }],
    repBalances: [{ rep: { id: "r1", name: "سالم", commissionPercent: 50 } as never, balanceMru: -800 }],
    totals: { profitMru: 1600, repSharesMru: 800, expectedMru: 0, debtorsMru: 4000, starlinkUsd: 70, cardUsd: 30 },
  });

  it("has the five sheets", () => {
    expect(sheets.map((s) => s.name)).toEqual(["ملخص", "الأرباح", "الأجهزة", "الديون", "المندوبون"]);
  });

  it("summarises the period with my net after the reps", () => {
    const rows = sheets[0]!.rows;
    expect(rows.find((r) => r[0] === "صافي ربحي")![1]).toBe(800);
    expect(rows.find((r) => r[0] === "عليّ لستارلينك")![1]).toBe(70);
  });

  it("lists each shipment's profit on the day Starlink was paid, with the rep's share", () => {
    expect(sheets[1]!.rows[1]).toEqual(["2026-09-12", "2026-09-10", "منزل", "محمد", "سالم", 100, "دولار", 60, 40, 1600, 800]);
  });

  it("lists devices with their identifiers and the customer's balance per currency", () => {
    const row = sheets[2]!.rows[1]!;
    expect(row.slice(0, 6)).toEqual(["منزل", "محمد", "22212345", undefined, "KIT1", "SN1"]);
    expect(row.slice(11, 15)).toEqual([97, "USD", 70, undefined]);
    expect(row.slice(15)).toEqual([undefined, 100, undefined]);
  });

  it("keeps every debt currency in its own column and marks what a rep owes", () => {
    expect(sheets[3]!.rows[0]!.slice(1, 5)).toEqual(["أوقية", "دولار", "سيفا", "EUR"]);
    expect(sheets[3]!.rows[1]).toEqual(["محمد", undefined, 100, undefined, 5, 4000, 16]);
    expect(sheets[4]!.rows[1]).toEqual(["سالم", undefined, 50, 800, "عليه"]);
  });

  it("names the file in ASCII", () => {
    expect(xlsxFileName(new Date("2026-09-26T12:00:00.000Z"))).toMatch(/^starnet-report-2026-09-26-\d{4}\.xlsx$/);
  });
});
