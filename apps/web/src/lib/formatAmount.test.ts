import { describe, expect, it } from "vitest";
import { formatAmount } from "./formatAmount";

describe("formatAmount", () => {
  it("adds thousands separators", () => {
    expect(formatAmount(45000)).toBe("45,000");
  });

  it("omits decimals for whole numbers", () => {
    expect(formatAmount(5)).toBe("5");
  });

  it("keeps decimals only when the amount actually has a fractional part", () => {
    expect(formatAmount(12.5)).toBe("12.5");
  });

  it("rounds to at most 2 decimal places without losing the separator", () => {
    expect(formatAmount(1234567.891)).toBe("1,234,567.89");
  });

  it("formats a negative amount with its sign and separators", () => {
    expect(formatAmount(-45000)).toBe("-45,000");
  });

  it("formats zero plainly", () => {
    expect(formatAmount(0)).toBe("0");
  });
});
