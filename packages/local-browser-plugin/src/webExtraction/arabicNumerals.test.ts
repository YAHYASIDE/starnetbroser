import { describe, expect, it } from "vitest";
import { toWesternDigits } from "./arabicNumerals";

describe("toWesternDigits", () => {
  it("converts every Arabic-Indic digit", () => {
    expect(toWesternDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("leaves non-digit characters untouched", () => {
    expect(toWesternDigits("الرصيد: ٠,٠٠ USD")).toBe("الرصيد: 0,00 USD");
  });

  it("leaves already-Western digits untouched", () => {
    expect(toWesternDigits("0.00 USD")).toBe("0.00 USD");
  });
});
