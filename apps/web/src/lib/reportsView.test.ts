import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./ledgerStore";
import { profitSeries, rankClientProfits, rankDeviceProfits, sumToMru, toMru, valueSeries } from "./reportsView";

function shipment(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "s",
    kind: "debit",
    amount: 100,
    currency: "USD",
    note: "",
    email: "",
    date: "2026-09-10",
    createdAt: "2026-09-10T10:00:00.000Z",
    starlinkCost: { status: "settled", currencyCode: "USD", amount: 60, paidAt: "2026-09-12" },
    ...overrides,
  };
}

const rates = { MRU: 40, SIFA: 600 };

describe("toMru / sumToMru", () => {
  it("shows any currency in أوقية at today's rate, never guessing an unknown one", () => {
    expect(toMru(10, "USD", rates)).toBe(400);
    expect(toMru(600, "SIFA", rates)).toBe(40);
    expect(toMru(50, "MRU", rates)).toBe(50);
    expect(toMru(5, "EUR", rates)).toBeUndefined();
    expect(sumToMru({ USD: 10, MRU: 100, EUR: 3 }, rates)).toEqual({ mru: 500, missing: ["EUR"] });
  });
});

describe("chart buckets", () => {
  const now = new Date(2026, 8, 26, 12);
  it("goes day by day for a week, empty days included", () => {
    const series = valueSeries([{ date: "2026-09-24", value: 5 }, { date: "2026-09-24", value: 2 }, { date: "2026-08-01", value: 9 }], "week", now);
    expect(series.map((p) => p.label)).toEqual(["20", "21", "22", "23", "24", "25", "26"]);
    expect(series.find((p) => p.key === "2026-09-24")!.value).toBe(7);
    expect(series.reduce((s, p) => s + p.value, 0)).toBe(7);
  });

  it("goes month by month for a quarter", () => {
    const series = valueSeries([{ date: "2026-07-15", value: 3 }], "quarter", now);
    expect(series.map((p) => p.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(series[1]!.value).toBe(3);
  });

  it("puts each shipment's profit on the day Starlink was paid", () => {
    const series = profitSeries([shipment(), shipment({ id: "d", starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } })], "month", 40, now);
    expect(series.find((p) => p.key === "2026-09-12")!.value).toBe(1600);
    expect(series.reduce((s, p) => s + p.value, 0)).toBe(1600);
  });
});

describe("rankings", () => {
  it("ranks devices and clients by profit, losses last", () => {
    const devices = rankDeviceProfits(
      {
        a: [shipment({ profitCurrencyRates: { MRU: 40 } })],
        b: [shipment({ amount: 50 })],
        c: [shipment({ amount: 200 })],
        empty: [shipment({ starlinkCost: { status: "pending", currencyCode: "USD", amount: 60 } })],
      },
      40,
    );
    expect(devices.map((d) => [d.accountId, d.profitMru])).toEqual([["c", 5600], ["a", 1600], ["b", -400]]);
    const clients = rankClientProfits(devices, (id) => (id === "b" ? undefined : "k1"));
    expect(clients).toEqual([
      { clientId: "k1", profitMru: 7200, devices: 2 },
      { clientId: undefined, profitMru: -400, devices: 1 },
    ]);
  });
});
