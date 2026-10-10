import { describe, expect, it } from "vitest";
import {
  addRemittancePayment,
  createRemittance,
  deleteRemittance,
  quoteFromRate,
  rateFromQuote,
  rateQuote,
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

describe("the rate as he quotes it («10,000 سيفا بـ 3600» = 36,000 أوقية)", () => {
  it("سيفا in, أوقية out: 3600 per 1,000 سيفا → 3.6 أوقية per سيفا", () => {
    expect(rateQuote("SIFA", "MRU")).toEqual({ foreign: "SIFA", block: 1000 });
    expect(rateFromQuote(3600, "SIFA", "MRU")).toBeCloseTo(3.6, 10);
    expect(remittanceFigures({ amount: 10000, commissionMode: "fixed", commissionValue: 0, commissionWho: "onTop", rate: rateFromQuote(3600, "SIFA", "MRU") }).sent).toBe(36000);
  });

  it("أوقية in, سيفا / دولار out, and back to his words", () => {
    expect(rateFromQuote(3600, "MRU", "SIFA")).toBeCloseTo(1 / 3.6, 10);
    expect(rateFromQuote(430, "MRU", "USD")).toBeCloseTo(1 / 430, 10);
    expect(quoteFromRate(3.6, "SIFA", "MRU")).toBeCloseTo(3600, 6);
    expect(quoteFromRate(1 / 430, "MRU", "USD")).toBeCloseTo(430, 6);
  });

  it("neither side أوقية, or the same currency: no quote", () => {
    expect(rateQuote("SIFA", "USD")).toBeNull();
    expect(rateQuote("SIFA", "SIFA")).toBeNull();
    expect(rateFromQuote(3600, "SIFA", "USD")).toBeNaN();
  });
});


describe("🇩🇿 the Algerian dinar (cash and transfers)", () => {
  it("quoted like سيفا: the price of 1,000 دينار in أوقية", () => {
    expect(rateQuote("DZD", "MRU")).toEqual({ foreign: "DZD", block: 1000 });
    expect(rateFromQuote(2500, "DZD", "MRU")).toBeCloseTo(2.5, 10);
    expect(rateFromQuote(2500, "MRU", "DZD")).toBeCloseTo(0.4, 10);
  });

  it("no dinar rate in «العملات»: taken from the transfer itself → profit = the commission", () => {
    const r = createRemittance([], input({ inAccountId: "cash", inCurrency: "DZD", amount: 100000, commissionMode: "fixed", commissionValue: 2000, outAccountId: "bankily", outCurrency: "MRU", rate: 2.5 }), NOW);
    if (!r.ok) throw new Error();
    expect(r.remittance.sent).toBe(250000);
    expect(r.remittance.rateFromTransfer).toBe("DZD");
    expect(r.remittance.rates.DZD).toBeCloseTo(160, 6); // 400 أوقية per $ ÷ 2.5
    // 2,000 دينار of commission = 5,000 أوقية
    expect(remittanceProfitMru(r.remittance)).toBeCloseTo(5000, 2);
    expect(remittanceCashEntries(r.remittance)).toEqual([expect.objectContaining({ kind: "in", amount: 102000, currencyCode: "DZD" })]);
  });

  it("with its rate in «العملات», the exchange difference counts too", () => {
    const r = createRemittance([], input({ inAccountId: "cash", inCurrency: "DZD", amount: 100000, commissionMode: "fixed", commissionValue: 0, outAccountId: "bankily", outCurrency: "MRU", rate: 2.4, rates: { ...RATES, DZD: 160 } }), NOW);
    if (!r.ok) throw new Error();
    expect(r.remittance.rateFromTransfer).toBeUndefined();
    // got 100,000 دينار (= 250,000 أوقية), sent 240,000 أوقية
    expect(remittanceProfitMru(r.remittance)).toBeCloseTo(10000, 2);
  });
});

describe("💱 profit against his average purchase cost", () => {
  it("سيفا bought at 3,550 / 1,000, sold at 3,600: the exchange gain counts against the cost, not the registry", () => {
    // He receives 36,000 أوقية, sends 10,000 سيفا (rate 1/3.6), no commission.
    const base = input({ inCurrency: "MRU", amount: 36000, commissionMode: "fixed", commissionValue: 0, outAccountId: "orange", outCurrency: "SIFA", rate: 1 / 3.6 });
    const vsRegistry = createRemittance([], base, NOW);
    const vsCost = createRemittance([], { ...base, costs: { SIFA: 3.55 } }, NOW);
    if (!vsRegistry.ok || !vsCost.ok) throw new Error();
    // registry: 600 سيفا per $ & 400 أوقية per $ → 10,000 سيفا = 6,666.67 أوقية → profit 29,333.33
    expect(remittanceProfitMru(vsRegistry.remittance)).toBeCloseTo(29333.33, 2);
    // cost: 10,000 سيفا cost 35,500 أوقية → profit 500
    expect(remittanceProfitMru(vsCost.remittance)).toBeCloseTo(500, 2);
    expect(vsCost.remittance.costBasis).toEqual(["SIFA"]);
    expect(vsRegistry.remittance.costBasis).toBeUndefined();
  });
});
