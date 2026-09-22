import { describe, expect, it } from "vitest";
import { formatAmount } from "./formatAmount";

describe("formatAmount", () => {
  it("adds thousands separators", () => {
    expect(formatAmount(45000)).toBe("45,000.00");
  });

  it("always shows exactly 2 decimal places", () => {
    expect(formatAmount(5)).toBe("5.00");
    expect(formatAmount(12.5)).toBe("12.50");
  });

  it("rounds to 2 decimal places without losing the separator", () => {
    expect(formatAmount(1234567.891)).toBe("1,234,567.89");
  });

  it("formats a negative amount with its sign and separators", () => {
    expect(formatAmount(-45000)).toBe("-45,000.00");
  });

  it("formats zero plainly", () => {
    expect(formatAmount(0)).toBe("0.00");
  });
});
