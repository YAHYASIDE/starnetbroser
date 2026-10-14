import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { countDayKeys, deviceDayKeys } from "./dayBuckets";

const dev = (extra: Partial<StarlinkAccountSummary>) => ({ rechargeDate: "", standbyDate: "", lastSuccessfulScanAt: "2026-10-01T00:00:00Z", ...extra }) as StarlinkAccountSummary;

describe("📅 the renewal calendar: days 1-28 + four lists", () => {
  it("puts each device in its day, or in the special lists", () => {
    expect(deviceDayKeys(dev({ rechargeDate: "2026/10/10" }))).toEqual([10]);
    expect(deviceDayKeys(dev({ rechargeDate: "2026/10/30" }))).toEqual(["unknown"]);
    expect(deviceDayKeys(dev({}))).toEqual(["unknown"]);
    expect(deviceDayKeys(dev({ lastSuccessfulScanAt: null }))).toEqual(["unsynced"]);
    expect(deviceDayKeys(dev({ rechargeDate: "2026/10/05", lastSuccessfulScanAt: null }))).toEqual([5, "unsynced"]);
    expect(deviceDayKeys(dev({ rechargeDate: "2026/10/05", limitedAccess: true }))).toEqual([5, "secondary"]);
    expect(deviceDayKeys(dev({ rechargeDate: "2026/10/05", deviceFault: { reason: "burned", note: "", reportedAt: "" } }))).toEqual([5, "burned"]);
  });

  it("counts them", () => {
    const counts = countDayKeys([dev({ rechargeDate: "2026/10/28" }), dev({ rechargeDate: "2026/11/28" }), dev({ rechargeDate: "2026/10/31" })]);
    expect(counts.get(28)).toBe(2);
    expect(counts.get(31)).toBeUndefined();
    expect(counts.get("unknown")).toBe(1);
  });
});
