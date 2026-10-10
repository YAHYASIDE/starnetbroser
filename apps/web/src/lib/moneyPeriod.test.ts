import { describe, expect, it } from "vitest";
import { dayPeriod, inPeriod, monthPeriod, periodChoices } from "./moneyPeriod";

describe("📅 the top card's period", () => {
  it("اليوم, أمس, then this month and the 4 before", () => {
    const c = periodChoices("2026-10-01");
    expect(c.map((p) => p.label)).toEqual(["اليوم", "أمس", "أكتوبر 2026", "سبتمبر 2026", "أغسطس 2026", "يوليو 2026", "يونيو 2026"]);
    expect(c[1]).toMatchObject({ kind: "day", from: "2026-09-30", to: "2026-09-30", phrase: "أمس" });
  });

  it("a picked day, and a month's real last day", () => {
    expect(dayPeriod("2026-10-03", "2026-10-10")).toMatchObject({ label: "2026-10-03", phrase: "يوم 2026-10-03" });
    expect(monthPeriod("2026-02")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", phrase: "في فبراير 2026" });
    expect(inPeriod("2026-02-28", monthPeriod("2026-02"))).toBe(true);
    expect(inPeriod("2026-03-01", monthPeriod("2026-02"))).toBe(false);
  });
});
