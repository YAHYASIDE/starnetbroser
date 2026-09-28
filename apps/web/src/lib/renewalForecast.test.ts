import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { DeviceStatus } from "@starnet/shared";
import { activeShare, cardNeed, computeRenewalForecast, parseRenewalDate } from "./renewalForecast";

const base: StarlinkAccountSummary = {
  id: "",
  customerId: "x",
  name: "",
  deviceName: "",
  kitNumber: "",
  serialNumber: "",
  standbyDate: "",
  rechargeDate: "",
  balanceDue: "0",
  currency: "$",
  dishStatus: DeviceStatus.GREEN,
  wifiStatus: DeviceStatus.GREEN,
  alertReason: "",
  lastUpdated: "",
  lastSuccessfulScanAt: "2026-09-27T10:00:00Z",
  planName: "",
};
const acc = (o: Partial<StarlinkAccountSummary>): StarlinkAccountSummary => ({ ...base, ...o });
const now = "2026-01-01T00:00:00Z";
const plan = { saleAmount: 4000, saleCurrency: "MRU", costAmount: 50, costCurrency: "USD" };

describe("renewal forecast", () => {
  const today = new Date(2026, 8, 28);
  it("sums per currency by week and counts devices without a price", () => {
    const f = computeRenewalForecast(
      [
        acc({ id: "a", name: "A", rechargeDate: "2026/09/28", renewalPlan: plan }),
        acc({ id: "b", name: "B", rechargeDate: "2026-10-06", renewalPlan: { ...plan, saleAmount: 50, saleCurrency: "USD" } }),
        acc({ id: "c", name: "C", rechargeDate: "2026/10/10" }),
        acc({ id: "old", name: "old", rechargeDate: "2026/09/27", renewalPlan: plan }),
        acc({ id: "far", name: "far", rechargeDate: "2026/11/30", renewalPlan: plan }),
        acc({ id: "f", name: "faulty", rechargeDate: "2026/09/29", renewalPlan: plan, deviceFault: { reason: "burned", note: "", reportedAt: now } }),
      ],
      today,
    );
    expect(f.devices.map((d) => [d.id, d.days])).toEqual([["a", 0], ["b", 8], ["c", 12]]);
    expect(f.sale).toEqual({ MRU: 4000, USD: 50 });
    expect(f.cost).toEqual({ USD: 100 });
    expect(f.missingPrice).toBe(1);
    expect(f.weeks.map((w) => w.count)).toEqual([1, 2, 0, 0, 0]);
    expect(f.weeks[0]).toMatchObject({ from: "2026-09-28", to: "2026-10-04", sale: { MRU: 4000 } });
    expect(f.weeks[4]!.to).toBe("2026-10-27");
    expect(cardNeed(f, 30)).toEqual({ needUsd: 50, balanceUsd: 30, shortUsd: 20, devices: 1 });
    expect(cardNeed(f, 30, 14).needUsd).toBe(100);
    expect(cardNeed(f, 500).shortUsd).toBe(0);
  });

  it("parses both date spellings", () => {
    expect(parseRenewalDate("2026/9/5")?.getDate()).toBe(5);
    expect(parseRenewalDate("bad")).toBeNull();
  });

  it("active share", () => {
    expect(activeShare([acc({ rechargeDate: "2026/09/28" }), acc({ rechargeDate: "2026/09/01" }), acc({ rechargeDate: "2026/10/01" }), acc({})], new Date(2026, 8, 28))).toEqual({ active: 2, lapsed: 1, percent: 67 });
  });
});
