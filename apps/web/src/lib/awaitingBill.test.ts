import { describe, expect, it } from "vitest";
import { awaitingCost, billCheckDelays, buildAwaitingCharge, devicesAwaitingBill, fillAwaitingBills, isAwaitingBill, lateAwaitingBills, parseBillAmount } from "./awaitingBill";
import type { LedgerEntry } from "./ledgerStore";

const T0 = new Date("2026-10-19T10:00:00Z");
const charge = (id: string, cost: LedgerEntry["starlinkCost"]): LedgerEntry =>
  ({ id, kind: "debit", amount: 20000, currency: "MRU", note: "", email: "", date: "2026-10-19", createdAt: T0.toISOString(), starlinkCost: cost }) as LedgerEntry;
const rates = (code: string) => ({ ARS: 1000, EUR: 0.9 })[code];
const at = (minutes: number) => T0.getTime() + minutes * 60_000;

describe("⏳ the invoice that comes down later (his Oct 19 2026 ask)", () => {
  it("a charge with the customer's price only: an empty D waiting, in the bill's currency", () => {
    const cost = awaitingCost("ars", T0);
    expect(cost).toEqual({ status: "pending", currencyCode: "ARS", awaitingBill: { since: T0.toISOString() } });
    expect(isAwaitingBill(charge("a", cost))).toBe(true);
    expect(isAwaitingBill(charge("b", { status: "pending", currencyCode: "USD", amount: 50 }))).toBe(false);
  });

  it("the first read of a new bill fills it by itself; 0 or an older read leaves it waiting", () => {
    const ledger = { d1: [charge("a", awaitingCost("USD", T0))] };
    expect(fillAwaitingBills(ledger, [{ accountId: "d1", balanceDue: "0.00", currency: "USD", at: at(15) }], rates).filled).toEqual([]);
    expect(fillAwaitingBills(ledger, [{ accountId: "d1", balanceDue: "70.50", currency: "USD", at: at(-5) }], rates).filled).toEqual([]);
    const r = fillAwaitingBills(ledger, [{ accountId: "d1", balanceDue: "$70.50", currency: "USD", at: at(60) }], rates);
    expect(r.filled).toEqual([{ accountId: "d1", entryId: "a", amount: 70.5, currencyCode: "USD", usd: 70.5 }]);
    expect(r.ledger.d1![0]!.starlinkCost).toEqual({ status: "pending", currencyCode: "USD", amount: 70.5 });
    expect(devicesAwaitingBill(r.ledger)).toEqual([]);
  });

  it("a bill in another currency locks today's rate; the D's already open are not counted twice", () => {
    const ledger = {
      d1: [charge("old", { status: "pending", currencyCode: "ARS", amount: 30000, rate: { rateFromUsd: 1000, usdValue: 30 } }), charge("new", awaitingCost("ARS", T0))],
    };
    const r = fillAwaitingBills(ledger, [{ accountId: "d1", balanceDue: "ARS 95,000.00", currency: "ARS", at: at(20) }], rates);
    expect(r.filled).toEqual([{ accountId: "d1", entryId: "new", amount: 65000, currencyCode: "ARS", usd: 65 }]);
    expect(r.ledger.d1![1]!.starlinkCost).toMatchObject({ amount: 65000, rate: { rateFromUsd: 1000, usdValue: 65 } });
    // only the open D on the bill → nothing new
    expect(fillAwaitingBills(ledger, [{ accountId: "d1", balanceDue: "30000", currency: "ARS", at: at(20) }], rates).filled).toEqual([]);
  });

  it("no rate for the bill's currency: left waiting and reported", () => {
    const ledger = { d1: [charge("a", awaitingCost("HNL", T0))] };
    const r = fillAwaitingBills(ledger, [{ accountId: "d1", balanceDue: "1500", currency: "HNL", at: at(30) }], rates);
    expect(r.filled).toEqual([]);
    expect(r.noRate).toEqual([{ accountId: "d1", currencyCode: "HNL" }]);
  });

  it("still waiting after a day → «خطة اليوم»", () => {
    const ledger = { d1: [charge("a", awaitingCost("USD", T0))] };
    expect(lateAwaitingBills(ledger, new Date(at(60)))).toEqual([]);
    expect(lateAwaitingBills(ledger, new Date(at(24 * 60)))).toEqual([{ accountId: "d1", entryId: "a", since: T0.toISOString() }]);
  });

  it("⏳ the charge typed in the device's browser: his price at today's rate, the rep locked, D waiting", () => {
    const store = { MRU: { code: "MRU", name: "أوقية", symbol: "MRU", rateFromUsd: 400 } } as never;
    const r = buildAwaitingCharge({ amount: 20000, currency: "MRU", at: T0, billCurrency: "USD", currencyStore: store, representative: { id: "r1", commissionPercent: 30 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry).toMatchObject({ kind: "debit", amount: 20000, currency: "MRU", saleRate: { rateFromUsd: 400, usdValue: 50 }, representativeId: "r1", representativeCommissionPercent: 30 });
    expect(isAwaitingBill(r.entry)).toBe(true);
    expect(buildAwaitingCharge({ amount: 50, currency: "SIFA", at: T0, currencyStore: store })).toEqual({ ok: false, message: "سعر صرف SIFA غير مسجّل في العملات" });
    expect(buildAwaitingCharge({ amount: 0, currency: "USD", at: T0, currencyStore: store }).ok).toBe(false);
  });

  it("the background checks still ahead: 30 min, 1 h, 2 h, 6 h, 12 h after the charge", () => {
    const h = 60 * 60_000;
    expect(billCheckDelays(T0.toISOString(), T0)).toEqual([h / 2, h, 2 * h, 6 * h, 12 * h]);
    expect(billCheckDelays(T0.toISOString(), new Date(at(90)))).toEqual([h / 2, 4.5 * h, 10.5 * h]);
    expect(billCheckDelays(T0.toISOString(), new Date(at(13 * 60)))).toEqual([]);
  });

  it("reads Starlink's amounts", () => {
    expect(parseBillAmount("USD 1,234.50")).toBe(1234.5);
    expect(parseBillAmount("")).toBeNaN();
  });
});
