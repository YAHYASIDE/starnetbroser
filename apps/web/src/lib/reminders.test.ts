import { describe, expect, it } from "vitest";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import {
  computeDeviceDebtReminders,
  computeLowStockReminders,
  computeRenewalReminders,
  computeStoreDebtReminders,
  isBackupOverdue,
} from "./reminders";
import { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { ClientStore, createClient } from "./clientStore";
import { Invoice, InvoiceList } from "./invoiceStore";
import { StoreItemRegistry, StoreTransactionList } from "./storeStore";

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
    rechargeDate: todayPlusDays(10),
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
    lines: [{ itemId: "a", quantity: 2, unitPrice: 100, transactionId: "t1" }],
    discount: 0,
    paidAmount: 0,
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("computeRenewalReminders", () => {
  it("includes an account due tomorrow at the default 1-day threshold", () => {
    const reminders = computeRenewalReminders([account({ rechargeDate: todayPlusDays(1) })]);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.daysRemaining).toBe(1);
  });

  it("includes an account due today and an overdue one", () => {
    const reminders = computeRenewalReminders([
      account({ id: "a1", rechargeDate: todayPlusDays(0) }),
      account({ id: "a2", rechargeDate: todayPlusDays(-3) }),
    ]);
    expect(reminders.map((r) => r.account.id)).toEqual(["a2", "a1"]); // most overdue first
  });

  it("excludes an account due further out than the threshold", () => {
    const reminders = computeRenewalReminders([account({ rechargeDate: todayPlusDays(5) })]);
    expect(reminders).toHaveLength(0);
  });

  it("excludes an archived or deleted account even if its date is due", () => {
    const reminders = computeRenewalReminders([
      account({ id: "a1", rechargeDate: todayPlusDays(0), archivedAt: "2026-09-01T00:00:00.000Z" }),
      account({ id: "a2", rechargeDate: todayPlusDays(0), deletedAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(reminders).toHaveLength(0);
  });

  it("respects a custom threshold", () => {
    const reminders = computeRenewalReminders([account({ rechargeDate: todayPlusDays(3) })], 3);
    expect(reminders).toHaveLength(1);
  });
});

describe("computeDeviceDebtReminders", () => {
  it("includes an account with a positive ledger balance", () => {
    const ledgerStore: LedgerByAccount = { "acc-1": [ledgerEntry({ kind: "debit", amount: 50, currency: "USD" })] };
    const reminders = computeDeviceDebtReminders([account()], ledgerStore);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.balances.USD).toBe(50);
  });

  it("excludes an account with a zero or negative (credit) balance", () => {
    const ledgerStore: LedgerByAccount = {
      "acc-1": [ledgerEntry({ kind: "credit", amount: 50, currency: "USD" })], // paid more than owed -> credit
    };
    const reminders = computeDeviceDebtReminders([account()], ledgerStore);
    expect(reminders).toHaveLength(0);
  });

  it("excludes an account with no ledger entries at all", () => {
    expect(computeDeviceDebtReminders([account()], {})).toHaveLength(0);
  });
});

describe("computeStoreDebtReminders", () => {
  it("includes a client with a positive store balance", () => {
    let clientStore: ClientStore = {};
    const { store, client } = createClient(clientStore, { name: "زبون تجريبي" });
    clientStore = store;
    const invoices: InvoiceList = [invoice({ clientId: client.id, paidAmount: 0 })]; // total 200, due 200

    const reminders = computeStoreDebtReminders(clientStore, invoices);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.balances.MRU).toBe(200);
  });

  it("excludes a client who overpaid (negative balance/credit)", () => {
    let clientStore: ClientStore = {};
    const { store, client } = createClient(clientStore, { name: "زبون تجريبي" });
    clientStore = store;
    const invoices: InvoiceList = [invoice({ clientId: client.id, paidAmount: 300 })]; // overpaid

    expect(computeStoreDebtReminders(clientStore, invoices)).toHaveLength(0);
  });

  it("excludes a client with no invoices", () => {
    let clientStore: ClientStore = {};
    const { store } = createClient(clientStore, { name: "زبون بلا فواتير" });
    clientStore = store;
    expect(computeStoreDebtReminders(clientStore, [])).toHaveLength(0);
  });
});

describe("computeLowStockReminders", () => {
  it("includes an item at or below its own threshold", () => {
    const items: StoreItemRegistry = {
      a: { id: "a", name: "مادة", unit: "قطعة", lowStockThreshold: 5, createdAt: "t", updatedAt: "t" },
    };
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 5, unitPrice: 10, currencyCode: "MRU", date: "2026-09-01", createdAt: "t1" },
      { id: "2", itemId: "a", kind: "sell", quantity: 3, unitPrice: 20, currencyCode: "MRU", date: "2026-09-02", createdAt: "t2" },
    ];
    // stock = 5 - 3 = 2, <= threshold 5
    const reminders = computeLowStockReminders(items, transactions);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.stock).toBe(2);
  });

  it("excludes an item with plenty of stock", () => {
    const items: StoreItemRegistry = {
      a: { id: "a", name: "مادة", unit: "قطعة", lowStockThreshold: 5, createdAt: "t", updatedAt: "t" },
    };
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 50, unitPrice: 10, currencyCode: "MRU", date: "2026-09-01", createdAt: "t1" },
    ];
    expect(computeLowStockReminders(items, transactions)).toHaveLength(0);
  });

  it("excludes an item with no threshold configured at all", () => {
    const items: StoreItemRegistry = {
      a: { id: "a", name: "مادة", unit: "قطعة", createdAt: "t", updatedAt: "t" },
    };
    expect(computeLowStockReminders(items, [])).toHaveLength(0);
  });
});

describe("isBackupOverdue", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");

  it("is overdue when a backup was never taken at all", () => {
    expect(isBackupOverdue(null, 7, now)).toBe(true);
  });

  it("is not overdue right after a backup within the threshold", () => {
    expect(isBackupOverdue(new Date("2026-09-20T12:00:00.000Z").toISOString(), 7, now)).toBe(false);
  });

  it("is overdue once the threshold has passed", () => {
    expect(isBackupOverdue(new Date("2026-09-16T12:00:00.000Z").toISOString(), 7, now)).toBe(true);
  });

  it("respects a custom threshold", () => {
    expect(isBackupOverdue(new Date("2026-09-23T12:00:00.000Z").toISOString(), 1, now)).toBe(true);
  });
});
