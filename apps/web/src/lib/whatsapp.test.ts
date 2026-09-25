import { describe, expect, it } from "vitest";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { LedgerEntry } from "./ledgerStore";
import { createAllocation, PaymentAllocation } from "./paymentAllocationStore";
import { Invoice } from "./invoiceStore";
import { StoreItemRegistry } from "./storeStore";
import {
  buildAccountStatementMessage,
  buildBalanceReminderMessage,
  buildDeviceInfoMessage,
  buildExpiryReminderMessage,
  buildInvoiceMessage,
  buildStoreDebtReminderMessage,
  buildWhatsAppLink,
  normalizePhoneForWhatsApp,
  buildStoreStatementMessage,
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

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    kind: "sale",
    date: "2026-09-20",
    currencyCode: "MRU",
    lines: [{ itemId: "item-1", quantity: 2, unitPrice: 5000, transactionId: "t1" }],
    discount: 0,
    paidAmount: 0,
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

function account(overrides: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id: "acc-1",
    customerId: "customer-1",
    name: "مقهى النخيل",
    deviceName: "Standard Kit",
    kitNumber: "",
    serialNumber: "",
    standbyDate: "",
    rechargeDate: "2026/10/15",
    balanceDue: "0",
    currency: "$",
    dishStatus: DeviceStatus.GREEN,
    wifiStatus: DeviceStatus.GREEN,
    alertReason: "",
    lastUpdated: "الآن",
    lastSuccessfulScanAt: null,
    planName: "Residential",
    ...overrides,
  };
}

const items: StoreItemRegistry = {
  "item-1": {
    id: "item-1",
    name: "راوتر Starlink Mini",
    unit: "قطعة",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
};

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

describe("buildStoreDebtReminderMessage", () => {
  it("mentions the client name, the balance/currency and the payment numbers", () => {
    const message = buildStoreDebtReminderMessage("زبون تجريبي", { MRU: 15000 });
    expect(message).toContain("زبون تجريبي");
    expect(message).toContain("15,000 أوقية");
    expect(message).toContain("22227268");
    expect(message).toContain("74646158");
  });

  it("says there is no balance due when the client owes nothing", () => {
    const message = buildStoreDebtReminderMessage("زبون تجريبي", {});
    expect(message).toContain("لا يوجد لديك أي رصيد مستحق حاليًا");
    expect(message).not.toContain("22227268");
  });

  it("ignores a zero/negative (credit) entry rather than treating it as owed", () => {
    const message = buildStoreDebtReminderMessage("زبون تجريبي", { MRU: -500 });
    expect(message).toContain("لا يوجد لديك أي رصيد مستحق حاليًا");
  });

  it("lists every currency owed, never summing them together", () => {
    const message = buildStoreDebtReminderMessage("زبون تجريبي", { MRU: 15000, USD: 20 });
    expect(message).toContain("15,000 أوقية");
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

describe("buildInvoiceMessage", () => {
  it("lists each line with item name, quantity, unit price and line total", () => {
    const message = buildInvoiceMessage(invoice(), items, "زبون تجريبي");
    expect(message).toContain("راوتر Starlink Mini");
    expect(message).toContain("2");
    expect(message).toContain("5,000");
    expect(message).toContain("10,000"); // line total: 2 * 5000
  });

  it("falls back to a generic name for an item that no longer exists", () => {
    const message = buildInvoiceMessage(invoice({ lines: [{ itemId: "gone", quantity: 1, unitPrice: 100, transactionId: "t1" }] }), {}, "زبون");
    expect(message).toContain("مادة");
  });

  it("shows subtotal + discount lines only when there is a discount", () => {
    const withDiscount = buildInvoiceMessage(invoice({ discount: 1000 }), items, "زبون");
    expect(withDiscount).toContain("المجموع الفرعي");
    expect(withDiscount).toContain("الخصم");
    expect(withDiscount).toContain("9,000"); // 10000 - 1000

    const withoutDiscount = buildInvoiceMessage(invoice(), items, "زبون");
    expect(withoutDiscount).not.toContain("المجموع الفرعي");
  });

  it("marks a fully unpaid invoice as credit/debt", () => {
    const message = buildInvoiceMessage(invoice({ paidAmount: 0 }), items, "زبون");
    expect(message).toContain("غير مدفوعة");
  });

  it("marks a partially-paid invoice with the remaining balance", () => {
    const message = buildInvoiceMessage(invoice({ paidAmount: 4000 }), items, "زبون");
    expect(message).toContain("مدفوعة جزئيًا");
    expect(message).toContain("6,000"); // 10000 - 4000
  });

  it("marks a fully-paid invoice", () => {
    const message = buildInvoiceMessage(invoice({ paidAmount: 10000 }), items, "زبون");
    expect(message).toContain("مدفوعة بالكامل");
  });

  it("shows a shipping line under a line that has one, and folds its charge into the subtotal", () => {
    const withShipping = buildInvoiceMessage(
      invoice({
        lines: [{ itemId: "item-1", quantity: 1, unitPrice: 5000, shippingCost: 300, shippingCharge: 500, transactionId: "t1" }],
        discount: 1, // forces the subtotal line to render so we can assert its value
      }),
      items,
      "زبون",
    );
    expect(withShipping).toContain("🚚 شحن: 500");
    expect(withShipping).toContain("5,500"); // subtotal: 5000 (item) + 500 (shipping)
  });

  it("labels a purchase invoice and a return invoice distinctly", () => {
    const purchase = buildInvoiceMessage(invoice({ kind: "purchase" }), items, "مورّد");
    expect(purchase).toContain("فاتورة شراء");

    const ret = buildInvoiceMessage(invoice({ returnOfInvoiceId: "orig" }), items, "زبون");
    expect(ret).toContain("مرتجع");
  });

  it("includes the note only when present", () => {
    const withNote = buildInvoiceMessage(invoice({ note: "توصيل مجاني" }), items, "زبون");
    expect(withNote).toContain("توصيل مجاني");

    const withoutNote = buildInvoiceMessage(invoice(), items, "زبون");
    expect(withoutNote).not.toContain("ملاحظة");
  });
});

describe("buildDeviceInfoMessage", () => {
  it("includes KIT, serial, subscription id, Wi-Fi password and the primary email with its password", () => {
    const message = buildDeviceInfoMessage(
      account({
        kitNumber: "KIT400744662",
        serialNumber: "4PBA00672626",
        subscriptionId: "SL-DF-12799315-82042-9",
        wifiPassword: "wifi-secret",
        expectedEmail: "etssadaga6@outlook.com",
        expectedEmailPassword: "email-secret",
      }),
    );
    expect(message).toContain("مقهى النخيل");
    expect(message).toContain("KIT: KIT400744662");
    expect(message).toContain("Serial: 4PBA00672626");
    expect(message).toContain("رقم الاشتراك: SL-DF-12799315-82042-9");
    expect(message).toContain("كلمة سر Wi-Fi: wifi-secret");
    expect(message).toContain("البريد الرئيسي: etssadaga6@outlook.com - كلمة السر: email-secret");
  });

  it("lists extra emails, each with its own optional password, alongside the primary one", () => {
    const message = buildDeviceInfoMessage(
      account({
        expectedEmail: "main@example.com",
        extraEmails: [
          { address: "backup1@example.com", password: "pw1" },
          { address: "backup2@example.com" },
        ],
      }),
    );
    expect(message).toContain("البريد الرئيسي: main@example.com");
    expect(message).toContain("بريد إضافي 1: backup1@example.com - كلمة السر: pw1");
    expect(message).toContain("بريد إضافي 2: backup2@example.com");
    expect(message).not.toContain("backup2@example.com - كلمة السر");
  });

  it("omits any section whose fields were never entered", () => {
    const message = buildDeviceInfoMessage(account({ kitNumber: "", serialNumber: "", subscriptionId: undefined }));
    expect(message).not.toContain("KIT:");
    expect(message).not.toContain("Serial:");
    expect(message).not.toContain("كلمة سر Wi-Fi");
    expect(message).not.toContain("البريد الإلكتروني:");
  });

  it("says there is no extra info recorded when nothing was ever entered", () => {
    const message = buildDeviceInfoMessage(account());
    expect(message).toContain("لا توجد معلومات إضافية مسجلة لهذا الجهاز");
  });

  it("never mentions Starlink's own synced account fields - this message is only about what the operator entered", () => {
    const message = buildDeviceInfoMessage(
      account({ starlinkAccountEmail: "synced@starlink.example", starlinkAccountHolderName: "Someone Else" }),
    );
    expect(message).not.toContain("synced@starlink.example");
    expect(message).not.toContain("Someone Else");
  });
});

describe("buildStoreStatementMessage", () => {
  it("lists each currency separately with the client's remaining debt", () => {
    const message = buildStoreStatementMessage(
      "محمد",
      {
        MRU: { total: 12000, paid: 5000, returned: 1000, adjusted: 0, remaining: 6000 },
        USD: { total: 600, paid: 600, returned: 0, adjusted: 0, remaining: 0 },
      },
      "client",
    );
    expect(message).toContain("مرحبًا محمد");
    expect(message).toContain("أوقية");
    expect(message).toContain("المرتجع: 1,000");
    expect(message).toContain("المتبقي عليكم: 6,000");
    expect(message).toContain("دولار");
  });

  it("words a supplier's balance from their side and shows manual entries", () => {
    const message = buildStoreStatementMessage(
      "شركة النور",
      { USD: { total: 5000, paid: 2000, returned: 0, adjusted: 500, remaining: 3500 } },
      "supplier",
    );
    expect(message).toContain("مجموع المشتريات: 5,000");
    expect(message).toContain("رصيد إضافي: +500");
    expect(message).toContain("المتبقي لكم: 3,500");
  });

  it("says so when there is nothing recorded", () => {
    expect(buildStoreStatementMessage("علي", {}, "client")).toContain("لا توجد حركات مسجلة بعد");
  });
});
