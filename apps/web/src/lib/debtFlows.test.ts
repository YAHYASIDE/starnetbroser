import { describe, expect, it } from "vitest";
import { debtFlowsIn } from "./debtFlows";
import type { LedgerEntry } from "./ledgerStore";
import type { Invoice } from "./invoiceStore";

const w = { from: "2026-10-16", to: "2026-10-22" };
const entry = (e: Partial<LedgerEntry>): LedgerEntry => ({ id: Math.random().toString(36), kind: "debit", amount: 0, currency: "MRU", note: "", email: "", date: "2026-10-20", createdAt: "", ...e }) as LedgerEntry;

describe("📒 debts that changed in the chosen days", () => {
  it("customers: renewals and payments in the window, per currency", () => {
    const f = debtFlowsIn(w, {
      ledgerStore: {
        d1: [
          entry({ amount: 4000, starlinkCost: { status: "settled", currencyCode: "USD", amount: 50, paidAt: "2026-10-21" } }),
          entry({ kind: "credit", amount: 1500 }),
          entry({ kind: "credit", amount: 900, date: "2026-10-01" }),
          entry({ amount: 200, currency: "SIFA", starlinkCost: { status: "pending", currencyCode: "USD", amount: 30 } }),
        ],
      },
      invoices: [{ id: "i1", kind: "sale", date: "2026-10-18", currencyCode: "MRU", lines: [{ itemId: "a", quantity: 1, unitPrice: 1000, transactionId: "t" }], discount: 0, paidAmount: 400, createdAt: "" } as Invoice],
      adjustments: [{ id: "a1", partyKind: "client", partyId: "c", direction: "weOwe", amount: 100, currencyCode: "MRU", date: "2026-10-22", createdAt: "" }],
      settlements: [{ id: "s1", representativeId: "r", kind: "cashHandover", amount: 7000, currencyCode: "MRU", date: "2026-10-19", createdAt: "" }],
    });
    expect(f.customers.added).toEqual({ MRU: 5000, SIFA: 200 });
    expect(f.customers.paid).toEqual({ MRU: 2000 });
    expect(f.starlink).toEqual({ addedUsd: 80, paidUsd: 50, addedCount: 2, paidCount: 1 });
    expect(f.reps.handedOver).toEqual({ MRU: 7000 });
  });

  it("a D paid in the window counts there even when the renewal was earlier; a burned device's D never", () => {
    const f = debtFlowsIn(w, {
      ledgerStore: {
        d1: [
          entry({ date: "2026-09-30", amount: 1, starlinkCost: { status: "settled", currencyCode: "USD", amount: 40, paidAt: "2026-10-17" } }),
          entry({ amount: 1, starlinkCost: { status: "settled", currencyCode: "USD", amount: 0, paidAt: "2026-10-20", waived: { at: "2026-10-20", amount: 40, currencyCode: "USD" } } }),
        ],
      },
      invoices: [],
      adjustments: [],
      settlements: [],
    });
    expect(f.starlink).toEqual({ addedUsd: 0, paidUsd: 40, addedCount: 0, paidCount: 1 });
  });
});
