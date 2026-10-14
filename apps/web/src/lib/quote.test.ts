import { describe, expect, it } from "vitest";
import { buildQuoteMessage, buildQuotePdf, quoteTotals } from "./quote";

describe("quote", () => {
  it("totals per currency with discounts and builds the message", () => {
    const quote = {
      customerName: "محمد",
      lines: [
        { label: "جهاز Starlink Mini", qty: 1, unitPrice: 250, currency: "USD" },
        { label: "اشتراك شهري", qty: 2, unitPrice: 4000, currency: "MRU" },
        { label: "", qty: 1, unitPrice: 99, currency: "USD" },
      ],
      discount: { MRU: 500 },
      validDays: 3,
    };
    expect(quoteTotals(quote)).toEqual({ USD: 250, MRU: 7500 });
    const text = buildQuoteMessage(quote, (c) => (c === "MRU" ? "أوقية" : "دولار"), new Date(2026, 8, 28));
    expect(text).toContain("• اشتراك شهري × 2: 8,000 أوقية");
    expect(text).toContain("🎁 خصم: 500 أوقية");
    expect(text).toContain("💰 المجموع: 250 دولار + 7,500 أوقية");
    expect(text).toContain("صالح حتى 01/10/2026");
    const pdf = buildQuotePdf(quote, (c) => (c === "MRU" ? "أوقية" : "دولار"), new Date(2026, 8, 28), "222");
    expect(pdf).toMatchObject({ title: "عرض سعر", partyName: "محمد", partyPhone: "222", subtitle: "صالح حتى 01/10/2026" });
    expect(pdf.rows).toEqual([
      ["جهاز Starlink Mini", "1", "250 دولار", "250 دولار"],
      ["اشتراك شهري", "2", "4,000 أوقية", "8,000 أوقية"],
      ["خصم", "", "", "-500 أوقية"],
    ]);
    expect(pdf.summary.map((s) => s.value)).toEqual(["250 دولار", "7,500 أوقية"]);
  });
});
