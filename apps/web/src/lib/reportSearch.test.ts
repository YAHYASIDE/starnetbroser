import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntry } from "./cashStore";
import type { LedgerEntry } from "./ledgerStore";
import { searchReports, type ReportSearchSources } from "./reportSearch";

const sources: ReportSearchSources = {
  sections: [
    { id: "kpis", title: "المؤشرات الرئيسية", keywords: "ربح ايرادات" },
    { id: "debts", title: "الديون", tab: "debts" },
  ],
  accounts: [{ id: "a1", name: "فيلا الياسمين", kitNumber: "KIT-3040-12", serialNumber: "SN-9", expectedEmail: "demo@example.com", clientId: "c1" } as StarlinkAccountSummary],
  clients: [{ id: "c1", name: "محمد التجربة", phone: "22200000000" }],
  reps: [{ id: "r1", name: "مندوب أ" }],
  suppliers: [],
  items: [{ id: "i1", name: "راوتر", code: "R-1" }],
  ledger: { a1: [{ id: "p1", kind: "credit", amount: 15000, currency: "MRU", note: "دفعة أكتوبر", email: "", date: "2026-10-09", createdAt: "x", paymentMethod: "bankily" } as LedgerEntry] },
  cash: [
    { id: "e1", kind: "out", amount: 3000, currencyCode: "MRU", category: "إيجار", date: "2026-10-01", createdAt: "x" } as CashEntry,
    { id: "e2", kind: "out", amount: 3000, currencyCode: "MRU", category: "x", date: "2026-10-01", createdAt: "x", sourceKind: "card-topup" } as CashEntry,
  ],
};

describe("🔎 «ابحث عن أي شيء في STAR NET»", () => {
  it("finds a device by KIT with dashes or not, by email, and by its customer", () => {
    expect(searchReports("3040", sources).map((h) => [h.kind, h.id])).toEqual([["device", "a1"]]);
    expect(searchReports("demo@example", sources)[0]).toMatchObject({ kind: "device", href: "/?q=%D9%81%D9%8A%D9%84%D8%A7%20%D8%A7%D9%84%D9%8A%D8%A7%D8%B3%D9%85%D9%8A%D9%86" });
    expect(searchReports("محمد", sources).map((h) => h.kind)).toEqual(["device", "client"]);
  });

  it("finds a payment by its amount (15000 / 15,000) or method, and an expense by its category - never a card top-up", () => {
    expect(searchReports("15,000", sources).map((h) => h.kind)).toEqual(["payment"]);
    expect(searchReports("بنكيلي", sources)[0]).toMatchObject({ kind: "payment", title: "15,000 أوقية · فيلا الياسمين" });
    expect(searchReports("ايجار", sources).map((h) => [h.kind, h.id, h.tab])).toEqual([["expense", "e1", "net"]]);
    expect(searchReports("3000", sources).map((h) => h.id)).toEqual(["e1"]);
  });

  it("finds a section by its name or a keyword; nothing for an empty box", () => {
    expect(searchReports("ربح", sources)[0]).toMatchObject({ kind: "section", section: "kpis" });
    expect(searchReports("الديون", sources)[0]).toMatchObject({ kind: "section", tab: "debts" });
    expect(searchReports("  ", sources)).toEqual([]);
  });
});
