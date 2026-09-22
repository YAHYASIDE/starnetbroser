import { describe, expect, it } from "vitest";
import { LedgerEntry } from "./ledgerStore";
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

  it("mentions the account name, the exact balance/currency and the payment numbers in the balance reminder", () => {
    const message = buildBalanceReminderMessage("مقهى النخيل", "12.50", "$");
    expect(message).toContain("مقهى النخيل");
    expect(message).toContain("$12.50");
    expect(message).toContain("22227268");
    expect(message).toContain("74646158");
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
    expect(message).toContain("عليه 45000.00 أوقية");
    expect(message).toContain("له 20.00 دولار");
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
    expect(message).toContain("2026-09-21: له 20.00 دولار (بنكيلي) - دفعة نقدية");
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
});
