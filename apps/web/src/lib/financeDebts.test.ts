import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeClientCombinedTotals } from "./clientAccount";
import { computeDebtAging } from "./debtAging";
import { buildCustomerDebts, buildSupplierDebts, fineBuckets } from "./financeDebts";
import type { Invoice } from "./invoiceStore";
import type { LedgerEntry } from "./ledgerStore";
import type { PartyAdjustment } from "./partyBalanceStore";
import type { PaymentPromise } from "./paymentPromises";

const T = "2026-10-09";
const rates = { USD: 1, MRU: 40, SIFA: 600 };
const e = (o: Partial<LedgerEntry>): LedgerEntry => ({ id: "x", kind: "debit", amount: 1000, currency: "MRU", note: "", email: "", date: T, createdAt: "x", ...o });
const accounts = [
  { id: "d1", name: "جهاز 1", clientId: "c1" },
  { id: "d2", name: "جهاز 2", clientId: "c1" },
  { id: "d3", name: "جهاز 3", clientId: "c2" },
  { id: "d4", name: "جهاز بلا زبون" },
] as StarlinkAccountSummary[];
const clients = [
  { id: "c1", name: "زبون أ" },
  { id: "c2", name: "زبون ب" },
];
const ledgerStore = {
  d1: [e({ id: "r1", amount: 4000, date: "2026-10-05" }), e({ id: "r2", amount: 3000, date: "2026-09-20" })],
  d2: [e({ id: "r3", amount: 2000, date: "2026-07-01" }), e({ id: "p1", kind: "credit", amount: 1000, date: "2026-08-01" })],
  d3: [e({ id: "r4", amount: 1000, date: "2026-10-01" }), e({ id: "p2", kind: "credit", amount: 1500, date: "2026-10-02" })],
  d4: [e({ id: "r5", amount: 100, currency: "USD", date: "2026-08-20" })],
};

describe("customers' debts", () => {
  const debtors = computeDebtAging({ clients, accounts, invoices: [], adjustments: [], ledgerStore, today: T, includeCredit: true });

  it("11: each debtor's total equals his statement's balance (computeClientCombinedTotals)", () => {
    const c1 = computeClientCombinedTotals([], [], "c1", accounts.filter((a) => a.clientId === "c1"), ledgerStore);
    const row = debtors.find((d) => d.id === "c1")!;
    expect(row.total).toBe(c1.MRU!.remaining);
    expect(row.total).toBe(8000);
  });

  it("ages into 0-7 / 8-30 / 31-60 / 60+ and never calls a debt late without a promised day", () => {
    const book = buildCustomerDebts(debtors, [], rates, T);
    const c1 = book.rows.find((r) => r.id === "c1")!;
    // The 1,000 paid on Aug 1 settled 1,000 of the July renewal (FIFO).
    expect(c1.buckets).toEqual({ d0_7: 4000, d8_30: 3000, d31_60: 0, d60p: 1000 });
    expect(book.noDueDates).toBe(true);
    expect(book.overdueMru).toBe(0);
    expect(book.debtorCount).toBe(2); // c1 + the device without a customer
    expect(book.totalMru).toBe(8000 + 4000);
    expect(book.avgMru).toBe(6000);
    // c2 paid 500 more than he owed: a credit kept for him, not a debt.
    expect(book.credits).toEqual([expect.objectContaining({ name: "زبون ب", amount: 500, mru: 500 })]);
    expect(c1.daysSincePayment).toBe(69);
  });

  it("a promise past its day makes that part late; a future one is «not due yet»", () => {
    const promises = [
      { id: "1", clientId: "c1", name: "زبون أ", amount: 2000, currency: "MRU", dueDate: "2026-10-01", status: "open", createdAt: "" },
      { id: "2", clientId: "c1", name: "زبون أ", amount: 9000, currency: "MRU", dueDate: "2026-10-20", status: "open", createdAt: "" },
      { id: "3", clientId: "c1", name: "زبون أ", amount: 500, currency: "MRU", dueDate: "2026-09-01", status: "kept", createdAt: "" },
    ] as PaymentPromise[];
    const c1 = buildCustomerDebts(debtors, promises, rates, T).rows.find((r) => r.id === "c1")!;
    expect(c1).toMatchObject({ overdue: 2000, upcoming: 6000, nextDue: "2026-10-20" });
  });

  it("fineBuckets edges", () => {
    expect(fineBuckets([{ date: "2026-10-02", amount: 1 }, { date: "2026-10-01", amount: 2 }, { date: "2026-08-10", amount: 4 }, { date: "2026-08-09", amount: 8 }], T)).toEqual({ d0_7: 1, d8_30: 2, d31_60: 4, d60p: 8 });
  });
});

describe("suppliers' debts", () => {
  const invoices = [
    { id: "b1", kind: "purchase", supplierId: "s1", date: "2026-09-10", currencyCode: "MRU", lines: [{ itemId: "i", quantity: 1, unitPrice: 10000, transactionId: "t" }], discount: 0, paidAmount: 4000, createdAt: "" },
    { id: "b2", kind: "purchase", supplierId: "s1", date: "2026-10-03", currencyCode: "MRU", lines: [{ itemId: "i", quantity: 1, unitPrice: 5000, transactionId: "t" }], discount: 0, paidAmount: 0, createdAt: "" },
  ] as unknown as Invoice[];
  const adjustments = [{ id: "a1", partyKind: "supplier", partyId: "s1", direction: "owesUs", amount: 3000, currencyCode: "MRU", date: "2026-10-05", cashMoved: true, createdAt: "" }] as PartyAdjustment[];

  it("paying a supplier lowers what's owed by the payment only - no new cost", () => {
    const book = buildSupplierDebts({ suppliers: [{ id: "s1", name: "مورد" }], invoices, adjustments, ledger: {}, previousDebts: [], accounts: [], rates, range: { from: "2026-10-01", to: T }, previous: { from: "2026-09-01", to: "2026-09-30" }, today: T });
    expect(book.suppliers[0]).toMatchObject({ owedMru: 8000, owedBeforeMru: 6000, paidMru: 3000, newMru: 5000 });
  });

  it("Starlink: what is owed now vs at the end of the compared period, and what comes due within 7 days", () => {
    const ledger = {
      d1: [
        e({ id: "s1", date: "2026-09-25", starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-10-04" } }),
        e({ id: "s2", date: "2026-10-03", starlinkCost: { status: "pending", currencyCode: "USD", amount: 50 } }),
      ],
    };
    const soon = [{ id: "d1", name: "جهاز 1", rechargeDate: "2026-10-12", renewalPlan: { saleAmount: 4000, saleCurrency: "MRU", costAmount: 55, costCurrency: "USD" } }] as unknown as StarlinkAccountSummary[];
    const book = buildSupplierDebts({ suppliers: [], invoices: [], adjustments: [], ledger, previousDebts: [{ id: "pd", accountId: "d1", date: "2026-09-01", amountUsd: 20, createdAt: "" }], accounts: soon, rates, range: { from: "2026-10-01", to: T }, previous: { from: "2026-09-01", to: "2026-09-30" }, today: T });
    expect(book).toMatchObject({ starlinkUsd: 70, starlinkBeforeUsd: 80, starlinkPaidUsd: 60, starlinkPaidCount: 1, upcomingUsd: 55 });
    expect(book.starlink.map((r) => r.previous ?? false)).toEqual([true, false]);
  });
});
