import { describe, expect, it } from "vitest";
import { balanceAfterPayment, buildPaymentReceipt, receiptNumber } from "./receipt";
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
