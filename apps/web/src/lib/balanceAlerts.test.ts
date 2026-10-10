import { describe, expect, it } from "vitest";
import { alertKey, checkAlerts, EMPTY_BALANCE_ALERTS, lowKeys, setThreshold } from "./balanceAlerts";

describe("🔔 low-balance alerts", () => {
  const orange = alertKey("orange", "SIFA");
  const cashUsd = alertKey("cash", "USD");
  const alerts = setThreshold(setThreshold(EMPTY_BALANCE_ALERTS, orange, 20000), cashUsd, 50);

  it("a floor per place and currency; ≤ 0 clears it", () => {
    expect(alerts.thresholds).toEqual({ "orange|SIFA": 20000, "cash|USD": 50 });
    expect(setThreshold(alerts, orange, 0).thresholds).toEqual({ "cash|USD": 50 });
  });

  it("below the floor = low (a missing balance counts as 0)", () => {
    expect(lowKeys(alerts, { orange: { SIFA: 25000 }, cash: { USD: 40 } })).toEqual(["cash|USD"]);
    expect(lowKeys(alerts, {})).toEqual(["orange|SIFA", "cash|USD"]);
  });

  it("the phone is told once per crossing; going back above re-arms it", () => {
    const first = checkAlerts(alerts, { orange: { SIFA: 15000 }, cash: { USD: 100 } });
    expect(first.newlyLow).toEqual(["orange|SIFA"]);
    const again = checkAlerts(first.alerts, { orange: { SIFA: 12000 }, cash: { USD: 100 } });
    expect(again.newlyLow).toEqual([]);
    const back = checkAlerts(again.alerts, { orange: { SIFA: 30000 }, cash: { USD: 100 } });
    expect(back.alerts.notified).toEqual([]);
    expect(checkAlerts(back.alerts, { orange: { SIFA: 1000 }, cash: { USD: 100 } }).newlyLow).toEqual(["orange|SIFA"]);
  });
});
