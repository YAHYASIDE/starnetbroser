import { describe, expect, it } from "vitest";
import type { PartyStatementRow } from "./invoiceStore";
import type { LedgerEntry } from "./ledgerStore";
import { arabicDate, filterMovements, movementTime, movementView } from "./partyMovements";

const row = (over: Partial<PartyStatementRow>): PartyStatementRow => ({
  id: "e1",
  type: "device-charge",
  date: "2026-10-19",
  createdAt: "2026-10-19T14:05:00.000Z",
  currencyCode: "MRU",
  deviceName: "demo-a@outlook.sa",
  accountId: "acc-1",
  amount: 25000,
  paid: 0,
  delta: 25000,
  balanceAfter: 225700,
  ...over,
});

describe("📄 a statement movement as he designed it (Oct 19 2026)", () => {
  it("«19 أكتوبر 2026» and the time apart", () => {
    expect(arabicDate("2026-10-19")).toBe("19 أكتوبر 2026");
    expect(arabicDate("2026-01-05")).toBe("5 يناير 2026");
    expect(arabicDate("x")).toBe("x");
    expect(movementTime("2026-10-19T14:05:00.000Z", 0)).toBe("14:05");
    expect(movementTime("2026-10-19", 0)).toBeUndefined();
  });

  it("a shipment: before · added to the debt · after, the email on its own, profit not computable yet", () => {
    const v = movementView(row({}), { isClient: true, timeZoneOffsetMinutes: 0 });
    expect(v).toMatchObject({ title: "شحن ستارلينك", email: "demo-a@outlook.sa", before: 200700, middle: 25000, middleLabel: "المضاف للدين", after: 225700, tone: "debt", profit: "uncomputed", dateLabel: "19 أكتوبر 2026", time: "14:05" });
    expect(v.device).toBeUndefined(); // the name IS the email
  });

  it("a payment: «المسدَّد» in green - 225,700 → 25,000 → 200,700", () => {
    const v = movementView(row({ type: "device-payment", delta: -25000, balanceAfter: 200700 }), { isClient: true });
    expect(v).toMatchObject({ title: "تسديد رصيد", before: 225700, middle: 25000, middleLabel: "المسدَّد", after: 200700, tone: "pay" });
    expect(v.profit).toBeUndefined();
  });

  it("the profit of a settled shipment, in the row's currency", () => {
    const entry = {
      id: "e1", kind: "debit", amount: 25000, currency: "MRU", date: "2026-10-19", createdAt: "",
      saleRate: { usdValue: 62.5 } as never,
      starlinkCost: { status: "settled", currencyCode: "USD", amount: 56.25 } as never,
      profitCurrencyRates: { MRU: 400 },
    } as unknown as LedgerEntry;
    const v = movementView(row({}), { isClient: true, entryOf: () => entry, emailOf: () => "demo-a@outlook.sa" });
    expect(v.profit).toEqual({ amount: 2500 });
  });

  it("🅳 a D not paid yet: the expected profit at the sale's locked rate; an invoice not yet down: not computed", () => {
    const entry = {
      id: "e1", kind: "debit", amount: 25000, currency: "MRU", date: "2026-10-19", createdAt: "",
      saleRate: { rateFromUsd: 400, usdValue: 62.5 },
      starlinkCost: { status: "pending", currencyCode: "USD", amount: 50 },
    } as unknown as LedgerEntry;
    expect(movementView(row({}), { isClient: true, entryOf: () => entry }).profit).toEqual({ amount: 5000, expected: true });
    const waiting = { ...entry, starlinkCost: { status: "pending", currencyCode: "USD", awaitingBill: { since: "" } } } as unknown as LedgerEntry;
    expect(movementView(row({}), { isClient: true, entryOf: () => waiting }).profit).toBe("uncomputed");
  });

  it("a balance adjustment is «تسوية رصيد», and the filters / search", () => {
    const adj = movementView(row({ type: "adjustment", deviceName: undefined, accountId: undefined, delta: -50000, balanceAfter: 0 }), { isClient: true });
    expect(adj).toMatchObject({ filter: "adjust", title: "تسوية رصيد · له", middleLabel: "المخصوم", tone: "pay" });
    const views = [movementView(row({}), { isClient: true }), movementView(row({ id: "p", type: "device-payment", delta: -1, deviceName: "Other Kit" }), { isClient: true }), adj];
    expect(filterMovements(views, "charge").map((v) => v.id)).toEqual(["e1"]);
    expect(filterMovements(views, "payment").map((v) => v.id)).toEqual(["p"]);
    expect(filterMovements(views, "adjust")).toHaveLength(1);
    expect(filterMovements(views, "all", "OUTLOOK.SA").map((v) => v.id)).toEqual(["e1"]);
    expect(filterMovements(views, "all", "other").map((v) => v.id)).toEqual(["p"]);
  });
});
