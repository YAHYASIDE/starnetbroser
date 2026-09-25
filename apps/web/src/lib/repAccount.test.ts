import { describe, expect, it } from "vitest";
import {
  buildRepPeriodStatement,
  isAfterRepReset,
  makeRepResetPoint,
  planRepDeletion,
  repPeriod,
  repRowDelta,
  setShipmentRepShare,
  splitRepRecords,
} from "./repAccount";
import {
  buildRepDailyStatement,
  computeRepCommissionOwedByCurrency,
  deleteRepSettlement,
  listRepDeviceCommissions,
  Representative,
  RepSettlement,
  updateRepSettlement,
} from "./repStore";
import type { Invoice } from "./invoiceStore";
import type { LedgerEntry } from "./ledgerStore";
import type { StarlinkAccountSummary } from "@starnet/shared";

const rep: Representative = { id: "r1", name: "سالم", commissionPercent: 50, createdAt: "", updatedAt: "" };

function shipment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "e1",
    kind: "debit",
    amount: 100,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-10",
    createdAt: "2026-09-10T10:00:00.000Z",
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-10" },
    representativeId: "r1",
    representativeCommissionPercent: 50,
    ...overrides,
  };
}

function settlement(overrides: Partial<RepSettlement> = {}): RepSettlement {
  return {
    id: "s1",
    representativeId: "r1",
    kind: "commissionPayout",
    amount: 15,
    currencyCode: "USD",
    date: "2026-09-12",
    createdAt: "2026-09-12T10:00:00.000Z",
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    kind: "sale",
    date: "2026-09-15",
    currencyCode: "MRU",
    lines: [{ itemId: "a", quantity: 1, unitPrice: 1000, transactionId: "t1" }],
    discount: 0,
    paidAmount: 1000,
    representativeId: "r1",
    representativeCommissionPercent: 10,
    createdAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  };
}

const ledger = {
  d1: [
    shipment(),
    shipment({ id: "e2", date: "2026-09-20", createdAt: "2026-09-20T09:00:00.000Z", amount: 120 }),
  ],
};
const settlements = [settlement(), settlement({ id: "s2", kind: "manualDebit", amount: 5, date: "2026-09-21", createdAt: "2026-09-21T08:00:00.000Z" })];
const invoices = [invoice()];

function days() {
  return buildRepDailyStatement("r1", listRepDeviceCommissions("r1", ledger), invoices, settlements);
}

describe("reset point", () => {
  it("a reset today starts now; an earlier date keeps that whole day", () => {
    const now = new Date(2026, 8, 25, 14, 0, 0);
    expect(makeRepResetPoint("2026-09-25", now)).toEqual({ date: "2026-09-25", at: now.toISOString() });
    expect(makeRepResetPoint("2026-09-20", now)).toEqual({ date: "2026-09-20", at: "" });
  });

  it("counts only records after the point", () => {
    const reset = { date: "2026-09-20", at: "2026-09-20T12:00:00.000Z" };
    expect(isAfterRepReset(undefined, { date: "2020-01-01", createdAt: "" })).toBe(true);
    expect(isAfterRepReset(reset, { date: "2026-09-19", createdAt: "2026-09-30T00:00:00.000Z" })).toBe(false);
    expect(isAfterRepReset(reset, { date: "2026-09-20", createdAt: "2026-09-20T09:00:00.000Z" })).toBe(false);
    expect(isAfterRepReset(reset, { date: "2026-09-20", createdAt: "2026-09-20T13:00:00.000Z" })).toBe(true);
    expect(isAfterRepReset(reset, { date: "2026-09-21", createdAt: "2026-09-01T00:00:00.000Z" })).toBe(true);
  });

  it("splits his records into active and archive, leaving other reps' records alone", () => {
    const reset = { ...rep, resetFrom: { date: "2026-09-16", at: "" } };
    const other = settlement({ id: "x", representativeId: "r2", date: "2026-01-01" });
    const records = { deviceRows: listRepDeviceCommissions("r1", ledger), invoices, settlements: [...settlements, other] };
    const active = splitRepRecords(reset, records, "active");
    expect(active.deviceRows.map((r) => r.entry.id)).toEqual(["e2"]);
    expect(active.invoices).toEqual([]);
    expect(active.settlements.map((s) => s.id)).toEqual(["s2", "x"]);
    // After the reset only the new shipment's share counts toward what we owe him.
    expect(computeRepCommissionOwedByCurrency("r1", active.invoices, active.settlements, active.deviceRows)).toEqual({ USD: 30 });
    const archive = splitRepRecords(reset, records, "archive");
    expect(archive.deviceRows.map((r) => r.entry.id)).toEqual(["e1"]);
    expect(archive.settlements.map((s) => s.id)).toEqual(["s1", "x"]);
  });
});

describe("period statement", () => {
  it("row deltas: + we owe him, − he owes us", () => {
    const [latest] = days();
    expect(latest.rows.map(repRowDelta)).toEqual([{ USD: -5 }]);
    const all = days().flatMap((d) => d.rows);
    const byId = Object.fromEntries(all.map((r) => [r.id, repRowDelta(r)]));
    expect(byId).toEqual({
      e1: { USD: 20 },
      e2: { USD: 30 },
      s1: { USD: -15 },
      s2: { USD: -5 },
      inv1: { MRU: -900 }, // 100 commission − 1,000 cash he collected
    });
  });

  it("carries the opening balance in and gives the balance after every row", () => {
    const st = buildRepPeriodStatement(days(), { from: "2026-09-13", to: "2026-09-20" });
    expect(st.days.map((d) => d.date)).toEqual(["2026-09-20", "2026-09-15"]);
    expect(st.opening).toEqual({ USD: 5 }); // 20 − 15
    expect(st.closing).toEqual({ USD: 35, MRU: -900 });
    expect(st.balanceAfter["invoice-inv1"]).toEqual({ USD: 5, MRU: -900 });
    expect(st.balanceAfter["device-e2"]).toEqual({ USD: 35, MRU: -900 });
    expect(st.totals).toMatchObject({ deviceProfitUsd: 60, repShareUsd: 30, ourShareUsd: 30, deviceCount: 1 });
    expect(st.totals.commissions).toEqual({ MRU: 100 });
    expect(st.totals.cashCollected).toEqual({ MRU: 1000 });
  });

  it("the whole history ends on the full balance; an empty period still shows the carried balance", () => {
    expect(buildRepPeriodStatement(days(), {}).closing).toEqual({ USD: 30, MRU: -900 });
    const empty = buildRepPeriodStatement(days(), { from: "2026-09-30", to: "2026-09-30" });
    expect(empty.days).toEqual([]);
    expect(empty.opening).toEqual({ USD: 30, MRU: -900 });
    expect(empty.closing).toEqual({ USD: 30, MRU: -900 });
  });

  it("builds day / month / custom ranges", () => {
    expect(repPeriod("day", "2026-09-25")).toEqual({ from: "2026-09-25", to: "2026-09-25" });
    expect(repPeriod("month", "2026-09-25")).toEqual({ from: "2026-09-01", to: "2026-09-31" });
    expect(repPeriod("custom", "2026-09-25", { from: "2026-08-01", to: "" })).toEqual({ from: "2026-08-01", to: undefined });
    expect(repPeriod("all", "2026-09-25")).toEqual({});
  });
});

describe("editing past operations", () => {
  it("edits and deletes a settlement in place", () => {
    const edited = updateRepSettlement(settlements, "s1", { kind: "cashHandover", amount: 40, currencyCode: "MRU", date: "2026-09-13", note: " x " });
    if (!edited.ok) throw new Error(edited.message);
    expect(edited.settlement).toMatchObject({ id: "s1", kind: "cashHandover", amount: 40, currencyCode: "MRU", date: "2026-09-13", note: "x" });
    expect(edited.settlement.createdAt).toBe(settlements[0].createdAt);
    expect(updateRepSettlement(settlements, "s1", { kind: "cashHandover", amount: 0, currencyCode: "USD", date: "2026-09-13" }).ok).toBe(false);
    expect(deleteRepSettlement(settlements, "s1").map((s) => s.id)).toEqual(["s2"]);
  });

  it("changes one shipment's percent, moves it to another rep, or takes the rep off", () => {
    const pct = setShipmentRepShare(ledger, "d1", "e1", { representativeId: "r1", percent: 25, sharesLosses: true });
    if (!pct.ok) throw new Error(pct.message);
    expect(pct.ledgerStore.d1[0]).toMatchObject({ representativeCommissionPercent: 25, representativeSharesLosses: true });
    expect(pct.ledgerStore.d1[1]).toBe(ledger.d1[1]);
    const moved = setShipmentRepShare(ledger, "d1", "e1", { representativeId: "r2", percent: 40, sharesLosses: false });
    expect(moved.ok && listRepDeviceCommissions("r2", moved.ledgerStore)[0].repShareUsd).toBe(16);
    const none = setShipmentRepShare(ledger, "d1", "e1", { representativeId: null, percent: 0, sharesLosses: false });
    expect(none.ok && none.ledgerStore.d1[0].representativeId).toBeUndefined();
    expect(setShipmentRepShare(ledger, "d1", "e1", { representativeId: "r1", percent: 150, sharesLosses: false }).ok).toBe(false);
    expect(setShipmentRepShare(ledger, "d1", "nope", { representativeId: "r1", percent: 5, sharesLosses: false }).ok).toBe(false);
  });
});

describe("planRepDeletion", () => {
  it("removes his settlements and shares, keeps the devices without a representative", () => {
    const accounts = [
      { id: "d1", representativeId: "r1" },
      { id: "d2", representativeId: "r2" },
    ] as StarlinkAccountSummary[];
    const plan = planRepDeletion("r1", { settlements: [...settlements, settlement({ id: "o", representativeId: "r2" })], ledgerStore: ledger, invoices, accounts });
    expect(plan.counts).toEqual({ settlements: 2, shipments: 2, invoices: 1, devices: 1 });
    expect(plan.removedSettlementIds).toEqual(["s1", "s2"]);
    expect(plan.settlements.map((s) => s.id)).toEqual(["o"]);
    expect(plan.ledgerStore.d1.every((e) => e.representativeId === undefined && e.representativeCommissionPercent === undefined)).toBe(true);
    expect(plan.invoices[0].representativeId).toBeUndefined();
    expect(plan.accounts.map((a) => a.representativeId)).toEqual([undefined, "r2"]);
  });
});
