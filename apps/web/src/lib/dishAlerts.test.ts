import { describe, expect, it } from "vitest";
import { describeDishAlert, describeDishAlerts } from "./dishAlerts";

describe("dish alerts in Arabic", () => {
  it("translates the alerts Starlink shows, keeping its own words", () => {
    const obstructed = describeDishAlert("Starlink is partially obstructed. Check that the Starlink is in an unobstructed location in all directions.");
    expect(obstructed).toMatchObject({ icon: "🌳", title: "الطبق محجوب جزئياً عن السماء" });
    expect(obstructed.original).toContain("obstructed");
    expect(describeDishAlert("Starlink is rate limited as it is out of priority data.").title).toBe("نفدت باقة الأولوية - السرعة محدودة");
  });

  it("shows an unknown alert as written, and nothing for no alerts", () => {
    expect(describeDishAlert("Something new from Starlink.")).toEqual({ icon: "⚠️", title: "Something new from Starlink.", original: "Something new from Starlink." });
    expect(describeDishAlerts(undefined)).toEqual([]);
    expect(describeDishAlerts(["", "Starlink is offline."]).map((a) => a.title)).toEqual(["الطبق غير متصل"]);
  });
});
