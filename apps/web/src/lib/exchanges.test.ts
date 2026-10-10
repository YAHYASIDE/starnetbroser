import { describe, expect, it } from "vitest";
import { averageCost, averageCosts, createExchange, deleteExchange, exchangeCashEntries, exchangeFlows, updateExchange, type ExchangeInput } from "./exchanges";

const NOW = new Date("2026-10-10T12:00:00Z");
const buy = (o: Partial<ExchangeInput> = {}): ExchangeInput => ({
  date: "2026-10-10",
  fromAccountId: "bankily",
  fromCurrency: "MRU",
  paid: 36000,
  toAccountId: "orange",
  toCurrency: "SIFA",
  received: 10000,
  seller: "بائع تجريبي",
  ...o,
});

describe("💱 buying a currency", () => {
  it("one record moves both places (− paid, + received)", () => {
    const r = createExchange([], buy(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(exchangeFlows(r.list)).toEqual([
      { accountId: "bankily", currencyCode: "MRU", date: "2026-10-10", amount: -36000 },
      { accountId: "orange", currencyCode: "SIFA", date: "2026-10-10", amount: 10000 },
    ]);
    expect(exchangeCashEntries(r.exchange)).toEqual([]);
  });

  it("a الكاش side is a cash entry carrying its id; deleting removes it", () => {
    const r = createExchange([], buy({ fromAccountId: "cash", toAccountId: "cash", toCurrency: "USD", received: 100, paid: 43000 }), NOW);
    if (!r.ok) throw new Error();
    expect(exchangeFlows(r.list)).toEqual([]);
    expect(exchangeCashEntries(r.exchange)).toEqual([
      expect.objectContaining({ kind: "out", amount: 43000, currencyCode: "MRU", sourceId: r.exchange.id, sourceKind: "exchange" }),
      expect.objectContaining({ kind: "in", amount: 100, currencyCode: "USD", sourceId: r.exchange.id }),
    ]);
    expect(deleteExchange(r.list, r.exchange.id)).toEqual([]);
  });

  it("refuses what makes no sense; editing keeps id and creation", () => {
    expect(createExchange([], buy({ paid: 0 }))).toMatchObject({ ok: false, message: "اكتب المبلغ الذي دفعته" });
    expect(createExchange([], buy({ toCurrency: "MRU" }))).toMatchObject({ ok: false });
    const r = createExchange([], buy(), NOW);
    if (!r.ok) throw new Error();
    const u = updateExchange(r.list, r.exchange.id, buy({ paid: 35500 }));
    expect(u).toMatchObject({ ok: true, exchange: { id: r.exchange.id, createdAt: r.exchange.createdAt, paid: 35500 } });
  });
});

describe("the average cost (what a transfer's profit is measured against)", () => {
  const list = (() => {
    let l = createExchange([], buy({ date: "2026-08-01", paid: 34000 }), NOW);
    if (!l.ok) throw new Error();
    let next = createExchange(l.list, buy({ date: "2026-10-01", paid: 36000, received: 10000 }), NOW);
    if (!next.ok) throw new Error();
    next = createExchange(next.list, buy({ date: "2026-10-09", paid: 71000, received: 20000 }), NOW);
    if (!next.ok) throw new Error();
    l = next;
    return l.list;
  })();

  it("purchases paid in أوقية in the last 30 days, weighted: (36,000 + 71,000) / 30,000", () => {
    expect(averageCost(list, "SIFA", "2026-10-10")).toEqual({ mruPerUnit: 107000 / 30000, count: 2, basis: "30d" });
    expect(averageCosts(list, "2026-10-10")).toEqual({ SIFA: 107000 / 30000 });
  });

  it("none in the last 30 days → the latest; none at all → unknown", () => {
    expect(averageCost(list, "SIFA", "2026-09-15")).toEqual({ mruPerUnit: 3.4, count: 1, basis: "latest" });
    expect(averageCost(list, "USD", "2026-10-10")).toBeUndefined();
    expect(averageCost(list, "MRU", "2026-10-10")).toBeUndefined();
  });
});
