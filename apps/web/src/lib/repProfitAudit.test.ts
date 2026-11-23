import { describe, expect, it } from "vitest";
import { buildProfitAudit, shareLandedAt } from "./repProfitAudit";
import type { LoggedOp } from "./repOpLog";
import type { RepDeviceCommissionRow } from "./repStore";
import type { Origin } from "./teamActivity";

// Fake data only.
const row = (id: string, accountId: string, paidAt: string, share: number, settledAt: string, cost?: { currencyCode: string; amount: number; rateFromUsd: number }): RepDeviceCommissionRow =>
  ({
    accountId,
    entry: {
      id,
      kind: "debit",
      amount: 3000,
      currency: "SIFA",
      note: "",
      email: "",
      date: paidAt,
      createdAt: `${paidAt}T08:00:00.000Z`,
      starlinkCost: {
        status: "settled",
        currencyCode: cost?.currencyCode ?? "USD",
        amount: cost?.amount ?? 20,
        ...(cost ? { rate: { rateFromUsd: cost.rateFromUsd, usdValue: cost.amount / cost.rateFromUsd } } : {}),
        paidAt,
        settledAt,
      },
    },
    profit: { status: "computed", saleValueUsd: 25, profitUsd: 5 },
    percent: 50,
    repShareUsd: share,
  }) as unknown as RepDeviceCommissionRow;

const SEP = "\u001f";
const mark = (accountId: string, id: string, o: Origin) => ({ [`starnet_customer_ledger_v1|${accountId}${SEP}${id}`]: o });
// 1 USD = 100 (a fake display currency)
const convert = (v: number) => ({ MRU: v * 100 });
const op = (serial: number, recordId: string, amount: number, account = "💰 حساب الربح"): LoggedOp =>
  ({ serial, repId: "r1", ids: [recordId], token: "t", at: "", sentAt: "", account, kind: "", figures: [{ code: "MRU", before: 0, amount, after: amount }], text: "", source: "", recordId }) as LoggedOp;

describe("🔍 فحص حساب الربح (his Nov 23 2026 report)", () => {
  it("lists shares that landed after the moment with an older day - who recorded it and when it arrived", () => {
    const rows = [
      row("old-late", "d1", "2026-11-10", 3, "2026-11-10T09:00:00.000Z"),
      row("on-time", "d2", "2026-11-22", 4, "2026-11-22T09:00:00.000Z"),
      row("paid-late-here", "d3", "2026-11-15", 2, "2026-11-22T10:00:00.000Z"),
      row("before", "d4", "2026-11-01", 2, "2026-11-01T10:00:00.000Z"),
    ];
    const origins = mark("d1", "old-late", { by: "المسؤول 2", at: "2026-11-22T07:00:00.000Z" });
    const audit = buildProfitAudit({ rows, origins, ops: [], since: "2026-11-21T21:50:00.000Z", convert });
    expect(audit.late.map((l) => [l.row.entry.id, l.by, l.landedAt])).toEqual([
      ["old-late", "المسؤول 2", "2026-11-22T07:00:00.000Z"],
      ["paid-late-here", undefined, "2026-11-22T10:00:00.000Z"],
    ]);
  });

  it("an older team mark does not move the landing time back", () => {
    const r = row("x", "d1", "2026-11-22", 1, "2026-11-22T10:00:00.000Z");
    expect(shareLandedAt(r, mark("d1", "x", { by: "laptop", at: "2026-11-20T00:00:00.000Z" }))).toEqual({ at: "2026-11-22T10:00:00.000Z", by: "laptop" });
  });

  it("an operation the bot sent whose share is different now shows what it is made of (a euro cost at its locked rate)", () => {
    const rows = [
      row("eur", "d1", "2026-11-21", 13.8, "2026-11-21T20:00:00.000Z", { currencyCode: "EUR", amount: 9.98, rateFromUsd: 0.87 }),
      row("same", "d2", "2026-11-21", 5, "2026-11-21T20:00:00.000Z"),
    ];
    const ops = [op(250, "eur", 1137), op(251, "same", 500), op(252, "eur", 99, "📡 حساب الأجهزة")];
    const audit = buildProfitAudit({ rows, origins: {}, ops, since: "2026-11-30T00:00:00.000Z", convert });
    expect(audit.drifts).toHaveLength(1);
    expect(audit.drifts[0]!.op.serial).toBe(250);
    expect(audit.drifts[0]!.then).toEqual({ MRU: 1137 });
    expect(audit.drifts[0]!.now.MRU).toBeCloseTo(1380);
    expect(audit.drifts[0]!.makeup).toMatchObject({ costCurrency: "EUR", costAmount: 9.98, costRate: 0.87, percent: 50 });
  });

  it("two shares for one device in a month are listed too", () => {
    const rows = [row("a", "d1", "2026-11-05", 3, "2026-11-05T09:00:00.000Z"), row("b", "d1", "2026-11-20", 3, "2026-11-20T09:00:00.000Z")];
    expect(buildProfitAudit({ rows, origins: {}, ops: [], since: "2026-11-30T00:00:00.000Z", convert }).doubles).toHaveLength(1);
  });
});
