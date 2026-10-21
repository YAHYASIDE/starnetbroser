import { DeviceStatus, type StarlinkAccountSummary } from "@starnet/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followUp, monthWeeks, weekdayColumn, WEEKDAYS } from "./deskDashboard";

function device(over: Partial<StarlinkAccountSummary>): StarlinkAccountSummary {
  return {
    id: "d", customerId: "", name: "", deviceName: "", kitNumber: "", serialNumber: "", standbyDate: "", rechargeDate: "",
    balanceDue: "0", currency: "$", dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.GREEN, alertReason: "", lastUpdated: "",
    lastSuccessfulScanAt: new Date(2026, 9, 21).toISOString(), planName: "", ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("monthWeeks", () => {
  it("lays October 2026 out from Saturday: the 1st is a Thursday", () => {
    expect(WEEKDAYS[0]).toBe("السبت");
    expect(weekdayColumn(6)).toBe(0); // Saturday
    expect(weekdayColumn(0)).toBe(1); // Sunday
    const weeks = monthWeeks(2026, 9);
    expect(weeks[0]).toEqual([null, null, null, null, null, 1, 2]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d !== null)).toHaveLength(31);
  });
});

describe("followUp", () => {
  it("sorts devices into stopped / tonight / tomorrow and what needs him", () => {
    const list = [
      device({ id: "old", rechargeDate: "2026/10/10" }),
      device({ id: "today", rechargeDate: "2026/10/21" }),
      device({ id: "tonight", rechargeDate: "2026/10/22" }),
      device({ id: "tomorrow", rechargeDate: "2026/10/23", isRestricted: true }),
      device({ id: "later", rechargeDate: "2026/11/20" }),
      device({ id: "burned", rechargeDate: "2026/10/21", deviceFault: { reason: "burned", note: "", reportedAt: "2026-10-01" } }),
    ];
    const f = followUp(list, new Set(["later"]));
    expect(f.expired.map((d) => d.id)).toEqual(["today", "old"]);
    expect(f.tonight.map((d) => d.id)).toEqual(["tonight"]);
    expect(f.tomorrow.map((d) => d.id)).toEqual(["tomorrow"]);
    expect(f.action.map((r) => [r.account.id, r.reasons])).toEqual([
      ["tomorrow", ["restricted"]],
      ["later", ["signedOut"]],
    ]);
  });
});
