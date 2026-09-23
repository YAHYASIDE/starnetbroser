import { describe, expect, it } from "vitest";
import { LedgerEntry } from "./ledgerStore";
import { createAllocation, PaymentAllocation } from "./paymentAllocationStore";
import {
  buildAccountStatementMessage,
  buildBalanceReminderMessage,
  buildExpiryReminderMessage,
  buildWhatsAppLink,
  normalizePhoneForWhatsApp,
} from "./whatsapp";

function ledgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 10,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-20",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("normalizePhoneForWhatsApp", () => {
  it("strips spaces, dashes and a leading + from a full international number", () => {
    expect(normalizePhoneForWhatsApp("+222 12 34 56 78")).toBe("22212345678");
  });

  it("strips a leading 00 international-dialing prefix", () => {
    expect(normalizePhoneForWhatsApp("0022212345678")).toBe("22212345678");
  });

  it("returns null for an empty or missing phone", () => {
    expect(normalizePhoneForWhatsApp("")).toBeNull();
    expect(normalizePhoneForWhatsApp(undefined)).toBeNull();
  });

  it("returns null for a string too short to plausibly be a real number", () => {
    expect(normalizePhoneForWhatsApp("123")).toBeNull();
  });
});

describe("buildWhatsAppLink", () => {
  it("returns a plain wa.me link with no message", () => {
    expect(buildWhatsAppLink("22212345678")).toBe("https://wa.me/22212345678");
  });

  it("url-encodes a pre-filled message", () => {
    const link = buildWhatsAppLink("22212345678", "مرحبًا");
    expect(link).toBe(`https://wa.me/22212345678?text=${encodeURIComponent("مرحبًا")}`);
  });

  it("returns null when the phone doesn't normalize to a usable number", () => {
    expect(buildWhatsAppLink(undefined, "hello")).toBeNull();
    expect(buildWhatsAppLink("", "hello")).toBeNull();
  });
});

describe("reminder message builders", () => {
  it("mentions the account name and 'tonight' in the expiry reminder", () => {
    const message = buildExpiryReminderMessage("مقهى النخيل");
    expect(message).toContain("مقهى النخيل");
    expect(message).toContain("الليلة");
  });

  it("mentions the account name, the ledger balance/currency and the payment numbers in the balance reminder", () => {
    const message = buildBalanceReminderMessage("مقهى النخيل", [
      ledgerEntry({ kind: "debit", amount: 45000, currency: "MRU" }),
    ]);
    expect(message).toContain("مقهى النخيل");
    expect(message).toContain("45,000 أوقية");
    expect(message).toContain("22227268");
    expect(message).toContain("74646158");
  });

  it("never mentions Starlink's own subscription balance in the balance reminder - a separate concern", () => {
    const message = buildBalanceReminderMessage("مقهى النخيل", [
      ledgerEntry({ kind: "debit", amount: 45000, currency: "MRU" }),
    ]);
    expect(message).not.toContain("Starlink");
  });

  it("says there is no balance due in the reminder when the customer owes nothing", () => {
    const message = buildBalanceReminderMessage("مقهى النخيل", []);
    expect(message).toContain("لا يوجد لديك أي رصيد مستحق حاليًا");
    expect(message).not.toContain("22227268");
  });

  it("lists every currency owed in the balance reminder, never summing them together", () => {
    const message = buildBalanceReminderMessage("مقهى النخيل", [
      ledgerEntry({ kind: "debit", amount: 45000, currency: "MRU" }),
      ledgerEntry({ kind: "debit", amount: 20, currency: "USD" }),
    ]);
    expect(message).toContain("45,000 أوقية");
    expect(message).toContain("20 دولار");
  });
});

describe("buildAccountStatementMessage", () => {
  it("says there is no balance due when there are no entries", () => {
    const message = buildAccountStatementMessage("مقهى النخيل", []);
    expect(message).toContain("مقهى النخيل");
    expect(message).toContain("لا يوجد رصيد مستحق حاليًا");
  });

  it("lists the balance per currency, never summing different currencies together", () => {
    const message = buildAccountStatementMessage("مقهى النخيل", [
      ledgerEntry({ kind: "debit", amount: 45000, currency: "MRU" }),
      ledgerEntry({ kind: "credit", amount: 20, currency: "USD" }),
    ]);
    expect(message).toContain("عليه 45,000 أوقية");
    expect(message).toContain("له 20 دولار");
  });

  it("lists every transaction with its date, direction, amount, payment method and note", () => {
    const message = buildAccountStatementMessage("مقهى النخيل", [
      ledgerEntry({
        kind: "credit",
        amount: 20,
        currency: "USD",
        date: "2026-09-21",
        paymentMethod: "bankily",
        note: "دفعة نقدية",
      }),
    ]);
    expect(message).toContain("2026-09-21: له 20 دولار (بنكيلي) - دفعة نقدية");
  });

  it("orders transactions newest first", () => {
    const message = buildAccountStatementMessage("مقهى النخيل", [
      ledgerEntry({ id: "old", date: "2026-09-01", note: "قديمة" }),
      ledgerEntry({ id: "new", date: "2026-09-20", note: "جديدة" }),
    ]);
    expect(message.indexOf("جديدة")).toBeLessThan(message.indexOf("قديمة"));
  });

  it("never mentions Starlink's own subscription balance - this is a separate concern", () => {
    const message = buildAccountStatementMessage("مقهى النخيل", []);
    expect(message).not.toContain("Starlink");
  });

  it("marks a fully-paid shipment without exposing Starlink cost or profit to the customer", () => {
    const shipment = ledgerEntry({
      id: "s1",
      kind: "debit",
      amount: 100,
      currency: "USD",
      starlinkCost: { status: "settled", currencyCode: "USD", amount: 70, paidAt: "2026-09-21" },
    });
    const allocations: PaymentAllocation[] = [createAllocation("p1", "s1", 100, "USD")];
    const message = buildAccountStatementMessage("مقهى النخيل", [shipment], allocations);
    expect(message).toContain("مدفوعة بالكامل");
    expect(message).not.toContain("Starlink");
    expect(message).not.toContain("70");
    expect(message).not.toContain("ربح");
  });

  it("marks a partially-paid shipment and leaves an unpaid one unmarked", () => {
    const shipment = ledgerEntry({ id: "s1", kind: "debit", amount: 100, currency: "USD" });
    const allocations: PaymentAllocation[] = [createAllocation("p1", "s1", 40, "USD")];
    const message = buildAccountStatementMessage("مقهى النخيل", [shipment], allocations);
    expect(message).toContain("مدفوعة جزئيًا");
  });

  it("defaults to no payment-status marks when allocations aren't passed", () => {
    const message = buildAccountStatementMessage("مقهى النخيل", [ledgerEntry({ kind: "debit", amount: 10 })]);
    expect(message).not.toContain("مدفوعة");
  });
});
