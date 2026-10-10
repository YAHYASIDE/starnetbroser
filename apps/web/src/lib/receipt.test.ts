import { describe, expect, it } from "vitest";
import { balanceAfterPayment, buildPaymentReceipt, buildReceiptWhatsAppMessage, receiptNumber } from "./receipt";
import type { LedgerEntry } from "./ledgerStore";

function e(o: Partial<LedgerEntry>): LedgerEntry {
  return { id: "x", kind: "debit", amount: 100, currency: "MRU", note: "", email: "", date: "2026-09-20", createdAt: "2026-09-20T10:00:00Z", ...o };
}

const entries = [
  e({ id: "c1", amount: 3000 }),
  e({ id: "p1-abcd", kind: "credit", amount: 1000, date: "2026-09-21", paymentMethod: "nita" }),
  e({ id: "c2", amount: 500, date: "2026-09-22" }),
  e({ id: "u", amount: 50, currency: "USD" }),
];

describe("receipt", () => {
  it("numbers a receipt from its date and id", () => {
    expect(receiptNumber(entries[1]!)).toBe("R-20260921-P1AB");
  });

  it("shows the balance right after the payment, ignoring later entries and other currencies", () => {
    expect(balanceAfterPayment(entries, entries[1]!)).toBe(2000);
  });

  it("builds a receipt document", () => {
    const doc = buildPaymentReceipt({ payment: entries[1]!, entries, deviceName: "منزل", clientName: "محمد" });
    expect(doc.title).toBe("سند قبض");
    expect(doc.partyName).toBe("محمد");
    expect(doc.summary[0]!.value).toBe("1,000 أوقية");
    expect(doc.summary[1]).toMatchObject({ label: "المتبقي عليه بعد الدفعة", value: "2,000 أوقية", tone: "due" });
    expect(doc.rows[0]![1]).toBe("منزل");
  });
});

describe("buildReceiptWhatsAppMessage", () => {
  it("carries the receipt number, amount with method, and what is left in that currency", () => {
    const msg = buildReceiptWhatsAppMessage({ payment: entries[1]!, entries, deviceName: "منزل", clientName: "محمد" });
    expect(msg).toContain("رقم السند: R-20260921-P1AB");
    expect(msg).toContain("استلمنا من: محمد");
    expect(msg).toMatch(/المبلغ: 1,000 .+ \(.+\)/);
    expect(msg).toMatch(/المتبقي عليك: 2,000 /);
  });

  it("says nothing is left when the payment clears the balance", () => {
    const paid = [e({ id: "c1", amount: 1000 }), e({ id: "p", kind: "credit", amount: 1000, date: "2026-09-21" })];
    const msg = buildReceiptWhatsAppMessage({ payment: paid[1]!, entries: paid, deviceName: "منزل" });
    expect(msg).toContain("استلمنا من: منزل");
    expect(msg).toContain("لا يوجد عليك أي مبلغ متبقٍّ ✓");
  });
});

describe("أورانج / نيتا on the receipt", () => {
  it("shows the فرانك sent beside the سيفا received", () => {
    const entries = [
      { id: "d", kind: "debit", amount: 10000, currency: "SIFA", note: "", email: "", date: "2026-10-01", createdAt: "2026-10-01T10:00:00.000Z" },
      { id: "p", kind: "credit", amount: 2000, currency: "SIFA", paymentMethod: "orange", note: "", email: "", date: "2026-10-02", createdAt: "2026-10-02T10:00:00.000Z" },
    ] as LedgerEntry[];
    expect(buildReceiptWhatsAppMessage({ payment: entries[1]!, entries, deviceName: "منزل" })).toContain("المبلغ: 2,000 سيفا (أورانج موني · 🟠 10,000 فرانك)");
  });
});
