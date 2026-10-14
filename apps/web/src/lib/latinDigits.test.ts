import { describe, expect, it } from "vitest";
import { latinNumberText } from "./latinDigits";

describe("latinNumberText", () => {
  it("turns Arabic digits and decimal marks into a plain number", () => {
    expect(latinNumberText("٥٤٨٧٦,٤٨")).toBe("54876.48");
    expect(latinNumberText("١٤٢٤٫٢٤")).toBe("1424.24");
    expect(latinNumberText("۱۲۳")).toBe("123");
    expect(latinNumberText("1 000٬5")).toBe("10005");
  });

  it("leaves a Latin number alone", () => {
    expect(latinNumberText("38.53")).toBe("38.53");
    expect(latinNumberText("-5")).toBe("-5");
    expect(latinNumberText("")).toBe("");
  });
});
