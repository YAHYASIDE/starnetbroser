import { describe, expect, it } from "vitest";
import { buildReportsPdf } from "./reportsPdf";
import type { MonthNet } from "./netProfit";
import type { ProfitRow } from "./profitStatement";

const net: MonthNet = {
  month: "x", starlinkSalesMru: 0, starlinkCostMru: 0, starlinkShipments: 1, starlinkProfitMru: 2000, starlinkRepSharesMru: 500,
  storeSalesMru: 3000, storeCogsMru: 1000, storeShippingMru: 0, storeRepCommissionMru: 0, storeNetMru: 2000, storeUnknownCostLines: 1,
  expensesMru: 700, expenses: [{ category: "نقل", mru: 700, count: 2 }], netMru: 2800, missingCurrencies: [], exact: true,
};
const row = { entryId: "e", accountId: "d1", date: "2026-10-21", saleDate: "2026-10-20", status: "confirmed", sale: { amount: 4000, currency: "MRU" }, cost: { amount: 50, currency: "USD", viaCard: false, waived: false }, profitUsd: 50, profitMru: 2000, mruExact: true, clientPayment: "paid", note: "" } as ProfitRow;

describe("📄 the reports statement", () => {
  it("totals in his order, then the shipments and the sections", () => {
    const doc = buildReportsPdf({
      label: "16 - 22 أكتوبر",
      window: { from: "2026-10-16", to: "2026-10-22" },
      net,
      personalMru: 300,
      shipments: [row],
      invoices: [{ id: "i", kind: "sale", date: "2026-10-18", currencyCode: "MRU", lines: [{ itemId: "a", quantity: 2, unitPrice: 1500, transactionId: "t" }], discount: 0, paidAmount: 3000, createdAt: "" }],
      debts: { customers: { added: { MRU: 4000 }, paid: { MRU: 1000, SIFA: 50 } }, starlink: { addedUsd: 50, paidUsd: 50, addedCount: 1, paidCount: 1 }, reps: { handedOver: {} } },
      names: { device: () => "جهاز 1", client: () => "زبون", clientById: () => "زبون", item: () => "راوتر" },
    });
    expect(doc.summary.map((s) => s.label)).toEqual(["ربح ستارلينك (1 شحنة)", "حصص المندوبين", "ربح المتجر", "المصروفات", "الصافي", "مصروفاتك الشخصية", "يبقى لك"]);
    expect(doc.summary[4]).toMatchObject({ value: "2,800 أوقية", tone: "clear" });
    expect(doc.summary[6]!.value).toBe("2,500 أوقية");
    expect(doc.subtitle).toBe("من 2026-10-16 إلى 2026-10-22");
    expect(doc.rows[0]).toEqual(["2026-10-21", "جهاز 1", "زبون", "4,000 أوقية", "50 دولار", "2,000 أوقية"]);
    expect(doc.sections![0]!.rows[0]![2]).toBe("راوتر ×2");
    expect(doc.sections![0]!.note).toContain("1 صنف بلا تكلفة");
    expect(doc.sections![2]!.rows[1]![1]).toBe("1,000 أوقية + 50 سيفا");
  });
});
