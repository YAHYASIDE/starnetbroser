import { describe, expect, it } from "vitest";
import { computeShipmentProfit, shipmentProfitDate } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";
import {
  buildPreviousDebtPayment,
  deletePreviousDebt,
  listOpenPreviousDebts,
  paidSinceLastSyncUsd,
  type PreviousDebtList,
  recordPreviousDebt,
  totalPreviousDebtUsd,
  unrecordedStarlinkBalanceUsd,
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
