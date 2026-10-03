import { describe, expect, it } from "vitest";
import { buildMonthNet, monthChange } from "./netProfit";
import type { LedgerEntry } from "./ledgerStore";
import type { CashEntry } from "./cashStore";
import type { Invoice } from "./invoiceStore";

function shipment(o: Partial<LedgerEntry>): LedgerEntry {
  return { id: "s", kind: "debit", amount: 100, currency: "USD", note: "", email: "", date: "2026-09-02", createdAt: "2026-09-02T10:00:00.000Z", ...o };
}

function cash(o: Partial<CashEntry>): CashEntry {
  return { id: "c", kind: "out", amount: 1000, currencyCode: "MRU", date: "2026-09-10", createdAt: "2026-09-10T10:00:00.000Z", ...o } as CashEntry;
}

const rates = { USD: 1, MRU: 40 };

describe("buildMonthNet", () => {
  const ledgerStore = {
    d1: [
      // 100 sold, 60 paid to Starlink on 2026-09-05 -> 40 USD = 1600 MRU (locked 40); rep 50% -> 800
      shipment({ id: "a", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-05" }, profitCurrencyRates: { MRU: 40 }, representativeId: "r1", representativeCommissionPercent: 50 }),
      // paid in October -> not September's profit
      shipment({ id: "b", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-10-01" }, profitCurrencyRates: { MRU: 40 } }),
      // still D -> no profit yet
      shipment({ id: "c", starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } }),
    ],
  };
  const invoices = [
    { id: "i1", kind: "sale", date: "2026-09-12", currencyCode: "MRU", lines: [{ itemId: "x", quantity: 2, unitPrice: 500, transactionId: "t2", shippingCost: 100 }], discount: 0, paidAmount: 0, representativeId: "r1", representativeCommissionPercent: 10, createdAt: "" },
    { id: "i0", kind: "purchase", date: "2026-08-01", currencyCode: "MRU", lines: [{ itemId: "x", quantity: 10, unitPrice: 300, transactionId: "t1" }], discount: 0, paidAmount: 0, createdAt: "" },
  ] as unknown as Invoice[];
  const transactions = [
    { id: "t1", itemId: "x", kind: "buy", quantity: 10, unitPrice: 300, currencyCode: "MRU", date: "2026-08-01", createdAt: "" },
    { id: "t2", itemId: "x", kind: "sell", quantity: 2, unitPrice: 500, currencyCode: "MRU", date: "2026-09-12", createdAt: "" },
  ] as never;
  const cashEntries = [
    cash({ id: "rent", category: "إيجار", amount: 3000 }),
    cash({ id: "fuel", category: "نقل", amount: 5, currencyCode: "USD" }),
    cash({ id: "misc", category: "", amount: 100 }),
    cash({ id: "topup", amount: 20000, sourceId: "t", sourceKind: "card-topup" }),
    cash({ id: "in", kind: "in", amount: 9999 }),
    cash({ id: "aug", category: "إيجار", amount: 3000, date: "2026-08-10" }),
  ];

  it("adds Starlink, store and expenses into one monthly net", () => {
    const net = buildMonthNet({ month: "2026-09", ledgerStore, invoices, transactions, cash: cashEntries, rates });
    expect(net.starlinkProfitMru).toBe(1600);
    expect(net.starlinkRepSharesMru).toBe(800);
    expect(net.storeSalesMru).toBe(1000);
    expect(net.storeCogsMru).toBe(600);
    expect(net.storeShippingMru).toBe(100);
    expect(net.storeRepCommissionMru).toBe(100);
    expect(net.storeNetMru).toBe(200);
    // 3000 rent + 5 USD (200 MRU) transport + 100 uncategorised; top-up, cash-in and August left out
    expect(net.expensesMru).toBe(3300);
    expect(net.expenses.map((e) => e.category)).toEqual(["إيجار", "نقل", "بدون تصنيف"]);
    expect(net.netMru).toBe(1600 - 800 + 200 - 3300);
    expect(net.missingCurrencies).toEqual([]);
    expect(net.exact).toBe(true);
  });

  it("lists a currency without a rate instead of guessing it", () => {
    const net = buildMonthNet({ month: "2026-09", ledgerStore: {}, invoices: [], transactions: [], cash: [cash({ currencyCode: "EUR", amount: 10 })], rates });
    expect(net.expensesMru).toBe(0);
    expect(net.missingCurrencies).toEqual(["EUR"]);
  });

  it("respects a fresh start (profit reset) inside the month", () => {
    const net = buildMonthNet({
      month: "2026-09",
      ledgerStore,
      invoices: [],
      transactions: [],
      cash: [],
      rates,
      profitReset: { date: "2026-09-20", at: "2026-09-20T00:00:00.000Z" } as never,
    });
    expect(net.starlinkProfitMru).toBe(0);
  });
});

describe("monthChange", () => {
  it("gives the difference and the percent", () => {
    expect(monthChange(1500, 1000)).toEqual({ diffMru: 500, percent: 50 });
    expect(monthChange(500, 1000)).toEqual({ diffMru: -500, percent: -50 });
    expect(monthChange(-500, 1000)).toEqual({ diffMru: -1500, percent: null });
    expect(monthChange(800, -200)).toEqual({ diffMru: 1000, percent: null });
    expect(monthChange(700, 0)).toEqual({ diffMru: 700, percent: null });
  });
});
