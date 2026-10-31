import { describe, expect, it } from "vitest";
import { computeShipmentProfit, shipmentProfitDate } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";
import {
  addToPreviousDebt,
  buildPreviousDebtPayment,
  deletePreviousDebt,
  listOpenPreviousDebts,
  paidSinceLastSyncUsd,
  type PreviousDebtList,
  recordPreviousDebt,
  totalPreviousDebtUsd,
  unrecordedStarlinkBalanceUsd,
  openDebtUsdToday,
  unrecordedGapUsd,
} from "./previousDebt";
import { buildCardStatement, listCardPayments, listOpenShipmentDebts } from "./starlinkDebt";

const now = new Date("2026-09-26T10:00:00.000Z");

function record(list: PreviousDebtList, input: { accountId: string; date: string; amountUsd: number; note?: string }) {
  const r = recordPreviousDebt(list, input, now);
  if (!r.ok) throw new Error(r.message);
  return r;
}

describe("previous debts", () => {
  it("keeps every debt as its own record, oldest first, until it is paid", () => {
    let list = record([], { accountId: "d1", date: "2026-09-20", amountUsd: 40 }).list;
    list = record(list, { accountId: "d1", date: "2026-08-10", amountUsd: 57, note: "قبل الشراء" }).list;
    const open = listOpenPreviousDebts(list, {});
    expect(open.map((d) => d.amountUsd)).toEqual([57, 40]);
    expect(totalPreviousDebtUsd(open)).toBe(97);
    expect(recordPreviousDebt(list, { accountId: "d1", date: "2026-09-20", amountUsd: 0 }).ok).toBe(false);
    expect(deletePreviousDebt(list, open[0]!.id)).toHaveLength(1);
  });

  it("paying one records a shipment on the customer, settled at what Starlink was paid", () => {
    const { list, debt } = record([], { accountId: "d1", date: "2026-09-20", amountUsd: 97 });
    const paid = buildPreviousDebtPayment(
      debt,
      { date: "2026-09-26", paidUsd: 97, chargeAmount: 4000, chargeCurrency: "MRU", chargeRateFromUsd: 40, fromCard: true, profitRates: { MRU: 40 } },
      now,
    );
    if (!paid.ok) throw new Error(paid.message);
    const entry = paid.entry;
    expect(entry).toMatchObject({ kind: "debit", amount: 4000, currency: "MRU", previousDebtId: debt.id });
    expect(computeShipmentProfit(entry)).toMatchObject({ status: "computed", saleValueUsd: 100, starlinkCostUsd: 97, profitUsd: 3, profitMru: 120 });
    expect(shipmentProfitDate(entry)).toBe("2026-09-26");

    const ledger = { d1: [entry] };
    expect(listOpenPreviousDebts(list, ledger)).toHaveLength(0);
    // Not one of the operator's own D's, and paid from the card.
    expect(listOpenShipmentDebts(ledger)).toHaveLength(0);
    expect(buildCardStatement([], listCardPayments(ledger)).balanceUsd).toBe(-97);
    // Deleting that shipment reopens the debt.
    expect(listOpenPreviousDebts(list, { d1: [] as LedgerEntry[] })).toHaveLength(1);
  });

  it("refuses a payment it can't price", () => {
    const { debt } = record([], { accountId: "d1", date: "2026-09-20", amountUsd: 97 });
    const base = { date: "2026-09-26", paidUsd: 97, chargeAmount: 4000, fromCard: false, profitRates: {} };
    expect(buildPreviousDebtPayment(debt, { ...base, chargeCurrency: "MRU" }).ok).toBe(false);
    expect(buildPreviousDebtPayment(debt, { ...base, chargeCurrency: "USD", chargeAmount: 0 }).ok).toBe(false);
    expect(buildPreviousDebtPayment(debt, { ...base, chargeCurrency: "USD", chargeAmount: 97 }).ok).toBe(true);
  });

  it("points out what Starlink shows beyond the recorded debts", () => {
    expect(unrecordedStarlinkBalanceUsd(97, 0)).toBe(97);
    expect(unrecordedStarlinkBalanceUsd(97, 70)).toBe(27);
    expect(unrecordedStarlinkBalanceUsd(97, 96.5)).toBe(0);
    expect(unrecordedStarlinkBalanceUsd(undefined, 0)).toBe(0);
  });
});

describe("paidSinceLastSyncUsd", () => {
  const paid = (settledAt: string, amount: number): LedgerEntry =>
    ({ id: settledAt, kind: "debit", amount: 100, currency: "USD", note: "", email: "", date: "2026-09-01", createdAt: settledAt,
       starlinkCost: { status: "settled", currencyCode: "USD", amount, paidAt: "2026-09-26", settledAt } }) as LedgerEntry;
  it("counts only what was paid after Starlink's balance was last read", () => {
    const entries = [paid("2026-09-25T10:00:00.000Z", 30), paid("2026-09-26T12:00:00.000Z", 97)];
    expect(paidSinceLastSyncUsd(entries, "2026-09-26T08:00:00.000Z")).toBe(97);
    expect(paidSinceLastSyncUsd(entries, "2026-09-27T08:00:00.000Z")).toBe(0);
    expect(paidSinceLastSyncUsd(entries, null, new Date("2026-09-27T00:00:00.000Z"))).toBe(127);
  });
});

describe("💱 a D in the bill's own currency is not a «فرق غير مسجّل» when only the rate moved", () => {
  it("an ARS D counts at today's ARS rate; a USD D at its own value", () => {
    // D of ARS 54,876.48 locked at $38.53; today 1 USD = 1374 ARS -> the bill is $39.94
    const d = [{ currencyCode: "ARS", amount: 54876.48, lockedUsd: 38.53 }];
    expect(openDebtUsdToday(d, "ARS", 1374)).toBeCloseTo(39.94, 2);
    expect(unrecordedGapUsd(54876.48 / 1374, openDebtUsdToday(d, "ARS", 1374), 38.53)).toBe(0);
    expect(openDebtUsdToday([{ currencyCode: "USD", amount: 40, lockedUsd: 40 }], "ARS", 1374)).toBe(40);
    expect(openDebtUsdToday(d, "ARS", undefined)).toBe(38.53);
  });

  it("with a D open, a small drift is part of it; a new bill still shows; no D: any gap over $1 shows", () => {
    expect(unrecordedGapUsd(39.94, 38.53, 38.53)).toBe(0);
    expect(unrecordedGapUsd(80, 38.53, 38.53)).toBe(41.47);
    expect(unrecordedGapUsd(41.5, 38.53, 38.53)).toBe(0);
    expect(unrecordedGapUsd(10, 0, 0)).toBe(10);
  });
});


describe("🤝 a previous debt paid on a rep's customer's device (his Oct 14 2026 report)", () => {
  it("the shipment carries the rep - from the device, else from its customer - so its profit is split", async () => {
    const { shipmentRepId } = await import("./repClients");
    const { listRepDeviceCommissions } = await import("./repStore");
    const hisCustomer = { repSegments: [{ repId: "r1", from: "2026-09-01T00:00:00.000Z", carry: true }] };
    expect(shipmentRepId({ representativeId: "r2" }, hisCustomer)).toBe("r2");
    expect(shipmentRepId({}, hisCustomer)).toBe("r1");
    expect(shipmentRepId({ representativeId: "" }, undefined)).toBeUndefined();
    const debt = { id: "pd1", accountId: "a1", date: "2026-10-01", amountUsd: 94.64, createdAt: "x" };
    const paid = buildPreviousDebtPayment(debt, {
      date: "2026-10-14", paidUsd: 94.64, chargeAmount: 13500, chargeCurrency: "SIFA", chargeRateFromUsd: 120, fromCard: true,
      profitRates: { MRU: 400, SIFA: 120 }, representative: { id: shipmentRepId({}, hisCustomer)!, commissionPercent: 50 },
    });
    if (!paid.ok) throw new Error(paid.message);
    const [row] = listRepDeviceCommissions("r1", { a1: [paid.entry] });
    expect(row!.profit.profitUsd).toBeCloseTo(17.86, 2);
    expect(row!.repShareUsd).toBeCloseTo(8.93, 2);
  });
});

describe("➕ a gap added onto the open previous debt (his Oct 22 2026 ask)", () => {
  it("the same debt grows and keeps what was added", () => {
    const made = recordPreviousDebt([], { accountId: "d1", date: "2026-10-01", amountUsd: 45.4 });
    if (!made.ok) throw new Error(made.message);
    const added = addToPreviousDebt(made.list, made.debt.id, 28.48, "2026-10-22");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.list).toHaveLength(1);
    expect(added.debt.amountUsd).toBe(73.88);
    expect(added.debt.additions).toEqual([{ amountUsd: 28.48, date: "2026-10-22", createdAt: expect.any(String) }]);
    expect(addToPreviousDebt(made.list, "nope", 5, "2026-10-22").ok).toBe(false);
    expect(addToPreviousDebt(made.list, made.debt.id, 0, "2026-10-22").ok).toBe(false);
  });
});

describe("🔗 a small gap onto the open D (his Oct 31 2026 report)", () => {
  it("offers the gap the big chip hides, only with an open D", async () => {
    const { smallGapToGrowUsd } = await import("./previousDebt");
    expect(smallGapToGrowUsd(51.73, 45.3, 45.3)).toBe(6.43);
    expect(smallGapToGrowUsd(80, 45.3, 45.3)).toBe(0); // the big «فرق» chip shows that one
    expect(smallGapToGrowUsd(51.73, 0, 0)).toBe(0); // no open D
    expect(smallGapToGrowUsd(45.8, 45.3, 45.3)).toBe(0); // under 1 $
  });
});

describe("💱 the «فرق» chip's price in أوقية and سيفا (his Oct 31 2026 ask)", () => {
  it("converts at today's rates, whole units, leaving out a currency with no rate", async () => {
    const { gapInLocalCurrencies } = await import("./previousDebt");
    expect(gapInLocalCurrencies(4.97, { MRU: 430, SIFA: 600 })).toEqual([
      { currency: "MRU", amount: 2137 },
      { currency: "SIFA", amount: 2982 },
    ]);
    expect(gapInLocalCurrencies(4.97, { MRU: 430 })).toEqual([{ currency: "MRU", amount: 2137 }]);
    expect(gapInLocalCurrencies(0, { MRU: 430, SIFA: 600 })).toEqual([]);
  });
});
