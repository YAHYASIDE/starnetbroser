import { describe, expect, it } from "vitest";
import {
  addRemittancePayment,
  createRemittance,
  deleteRemittance,
  registryRate,
  remittanceCashEntries,
  remittanceDebtors,
  remittanceFigures,
  remittanceFlows,
  remittanceMonth,
  remittanceProfitMru,
  remittanceRemaining,
  type RemittanceInput,
} from "./remittances";

// أوقية (old) ≈ 400 per dollar, سيفا 600 per dollar - fake names only.
const RATES = { USD: 1, MRU: 400, SIFA: 600 };
const NOW = new Date("2026-10-10T12:00:00Z");

const input = (o: Partial<RemittanceInput> = {}): RemittanceInput => ({
  date: "2026-10-10",
  client: "زبون تجريبي",
  inAccountId: "cash",
  inCurrency: "MRU",
  amount: 100000,
  commissionMode: "percent",
  commissionValue: 2,
  commissionWho: "onTop",
  outAccountId: "orange",
  outCurrency: "SIFA",
  rate: 1.5,
  rates: RATES,
  ...o,
});

describe("the figures of a transfer", () => {
  it("commission on top: the customer pays amount + commission, the whole amount is sent", () => {
    expect(remittanceFigures(input())).toEqual({ commission: 2000, owed: 102000, sent: 150000 });
  });

  it("commission deducted: the customer pays the amount, the beneficiary gets amount − commission", () => {
    expect(remittanceFigures(input({ commissionWho: "deducted" }))).toEqual({ commission: 2000, owed: 100000, sent: 147000 });
  });

  it("a fixed commission, same currency (rate 1)", () => {
    expect(remittanceFigures(input({ commissionMode: "fixed", commissionValue: 500, rate: 1 }))).toEqual({ commission: 500, owed: 100500, sent: 100000 });
  });

  it("the registry rate offered: sent units per 1 received unit", () => {
    expect(registryRate("MRU", "SIFA", RATES)).toBe(1.5);
    expect(registryRate("MRU", "USD", RATES)).toBe(1 / 400);
    expect(registryRate("MRU", "MRU", RATES)).toBe(1);
    expect(registryRate("MRU", "XOF", RATES)).toBeUndefined();
  });
});

describe("recording one", () => {
  it("locks the figures and the day's rates; paid in full by default", () => {
    const r = createRemittance([], input(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.remittance).toMatchObject({ commission: 2000, owed: 102000, sent: 150000, paidNow: 102000, rates: { MRU: 400, SIFA: 600 } });
    expect(remittanceRemaining(r.remittance)).toBe(0);
  });

  it("refuses what makes no sense", () => {
    expect(createRemittance([], input({ client: " " }))).toMatchObject({ ok: false, message: "اكتب اسم الزبون" });
    expect(createRemittance([], input({ amount: 0 }))).toMatchObject({ ok: false });
    expect(createRemittance([], input({ rate: 0 }))).toMatchObject({ ok: false, message: "اكتب سعر الصرف" });
    expect(createRemittance([], input({ commissionMode: "fixed", commissionValue: 200000, commissionWho: "deducted" }))).toMatchObject({ ok: false, message: "العمولة أكبر من المبلغ" });
    expect(createRemittance([], input({ paidNow: 200000 }))).toMatchObject({ ok: false, message: "المدفوع أكبر مما عليه" });
  });
});

describe("profit: commission + exchange difference, in أوقية at the locked rates", () => {
  it("the registry rate → profit = the commission", () => {
    const r = createRemittance([], input(), NOW);
    if (!r.ok) throw new Error();
    // owed 102,000 أوقية − sent 150,000 سيفا (= 100,000 أوقية)
    expect(remittanceProfitMru(r.remittance)).toBe(2000);
  });

  it("a better rate for him adds the exchange gain", () => {
    const r = createRemittance([], input({ rate: 1.45 }), NOW);
    if (!r.ok) throw new Error();
    // sent 145,000 سيفا = 96,666.67 أوقية → profit 5,333.33
    expect(remittanceProfitMru(r.remittance)).toBeCloseTo(5333.33, 2);
  });

  it("the month's line counts only that month (and from a fresh start on)", () => {
    const a = createRemittance([], input({ date: "2026-10-01" }), NOW);
    if (!a.ok) throw new Error();
    const b = createRemittance(a.list, input({ date: "2026-10-09" }), NOW);
    if (!b.ok) throw new Error();
    const c = createRemittance(b.list, input({ date: "2026-09-30" }), NOW);
    if (!c.ok) throw new Error();
    expect(remittanceMonth(c.list, "2026-10")).toEqual({ count: 2, profitMru: 4000, missing: 0 });
    expect(remittanceMonth(c.list, "2026-10", "2026-10-05")).toEqual({ count: 1, profitMru: 2000, missing: 0 });
  });
});

describe("unpaid part = a debt on the customer", () => {
  it("paid in part now, the rest later in payments", () => {
    const r = createRemittance([], input({ paidNow: 52000 }), NOW);
    if (!r.ok) throw new Error();
    expect(remittanceRemaining(r.remittance)).toBe(50000);
    expect(remittanceDebtors(r.list)).toEqual([{ name: "💸 زبون تجريبي", byCurrency: { MRU: 50000 } }]);
    const paid = addRemittancePayment(r.list, r.remittance.id, { amount: 30000, date: "2026-10-12", accountId: "bankily" }, NOW);
    if (!paid.ok) throw new Error();
    expect(remittanceRemaining(paid.list[0]!)).toBe(20000);
    expect(addRemittancePayment(paid.list, r.remittance.id, { amount: 25000, date: "2026-10-12", accountId: "bankily" })).toMatchObject({ ok: false, message: "المبلغ أكبر مما عليه" });
    const rest = addRemittancePayment(paid.list, r.remittance.id, { amount: 20000, date: "2026-10-13", accountId: "cash" }, NOW);
    if (!rest.ok) throw new Error();
    expect(remittanceDebtors(rest.list)).toEqual([]);
  });
});

describe("where the money moved (balances are derived)", () => {
  it("bank legs are account flows; الكاش legs are cash entries carrying the transfer's id", () => {
    const r = createRemittance([], input({ paidNow: 52000 }), NOW);
    if (!r.ok) throw new Error();
    const p = addRemittancePayment(r.list, r.remittance.id, { amount: 30000, date: "2026-10-12", accountId: "bankily" }, NOW);
    if (!p.ok) throw new Error();
    const t = p.list[0]!;
    expect(remittanceFlows(p.list)).toEqual([
      { accountId: "orange", currencyCode: "SIFA", date: "2026-10-10", amount: -150000 },
      { accountId: "bankily", currencyCode: "MRU", date: "2026-10-12", amount: 30000 },
    ]);
    expect(remittanceCashEntries(t)).toEqual([
      expect.objectContaining({ kind: "in", amount: 52000, currencyCode: "MRU", sourceId: t.id, sourceKind: "remittance" }),
    ]);
  });

  it("sent from الكاش (e.g. dollars in hand): a cash «out»; deleting removes it all", () => {
    const r = createRemittance([], input({ inAccountId: "bankily", outAccountId: "cash", outCurrency: "USD", rate: 1 / 400, commissionMode: "fixed", commissionValue: 1000 }), NOW);
    if (!r.ok) throw new Error();
    expect(remittanceFlows(r.list)).toEqual([{ accountId: "bankily", currencyCode: "MRU", date: "2026-10-10", amount: 101000 }]);
    expect(remittanceCashEntries(r.remittance)).toEqual([expect.objectContaining({ kind: "out", amount: 250, currencyCode: "USD" })]);
    expect(deleteRemittance(r.list, r.remittance.id)).toEqual([]);
  });
});
