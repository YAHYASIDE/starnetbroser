import { describe, expect, it } from "vitest";
import { normalizeReceipt } from "./aiReceipt";

describe("normalizeReceipt", () => {
  it("maps a Bankily transfer to a payment in MRU", () => {
    expect(normalizeReceipt({ kind: "payment", amount: 4500, currency: "MRU", date: "2026-09-25", method: "bankily", note: "من محمد - رقم 123", oldOuguiya: false })).toEqual({
      kind: "credit",
      amount: 4500,
      currency: "MRU",
      date: "2026-09-25",
      paymentMethod: "bankily",
      note: "من محمد - رقم 123",
    });
  });

  it("recognises currency spellings", () => {
    expect(normalizeReceipt({ amount: 10, currency: "أوقية جديدة" }).currency).toBe("MRU");
    expect(normalizeReceipt({ amount: 10, currency: "$" }).currency).toBe("USD");
    expect(normalizeReceipt({ amount: 10, currency: "FCFA" }).currency).toBe("SIFA");
  });

  it("converts old ouguiya and says so", () => {
    const fields = normalizeReceipt({ amount: 45000, currency: "MRO", oldOuguiya: true });
    expect(fields).toMatchObject({ amount: 4500, currency: "MRU" });
    expect(fields.warning).toContain("القديمة");
  });

  it("drops anything unreadable or invented", () => {
    const fields = normalizeReceipt({ kind: "other", amount: -5, currency: "EUR", date: "26/09/2026", method: "paypal", note: "  " });
    expect(fields.kind).toBeUndefined();
    expect(fields.amount).toBeUndefined();
    expect(fields.currency).toBeUndefined();
    expect(fields.date).toBeUndefined();
    expect(fields.paymentMethod).toBeUndefined();
    expect(fields.note).toBeUndefined();
    expect(fields.warning).toContain("EUR");
    expect(normalizeReceipt(null)).toEqual({});
  });
});
