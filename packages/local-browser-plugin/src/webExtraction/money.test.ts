import { describe, expect, it } from "vitest";
import { parseMoney } from "./money";

describe("parseMoney", () => {
  it("parses a $-prefixed amount", () => {
    expect(parseMoney("$0.00")).toEqual({ amount: "0.00", currency: "USD" });
  });

  it("parses an amount-then-USD suffix", () => {
    expect(parseMoney("12.50 USD")).toEqual({ amount: "12.50", currency: "USD" });
  });

  it("normalizes US$ and $US to USD", () => {
    expect(parseMoney("US$5.00")).toEqual({ amount: "5.00", currency: "USD" });
    expect(parseMoney("$US 5.00")).toEqual({ amount: "5.00", currency: "USD" });
  });

  it("does not confuse USDT with USD", () => {
    expect(parseMoney("10 USDT")).toEqual({ amount: "10.00", currency: "USDT" });
  });

  it("treats a zero balance as a real, confirmed value - not 'not found'", () => {
    const result = parseMoney("Outstanding balance: $0.00");
    expect(result).not.toBeNull();
    expect(result?.amount).toBe("0.00");
  });

  it("parses Arabic-Indic digits with a comma decimal separator, per the spec's own example", () => {
    expect(parseMoney("٠,٠٠ USD")).toEqual({ amount: "0.00", currency: "USD" });
  });

  it("parses Arabic-Indic digits with a currency symbol prefix", () => {
    expect(parseMoney("$١٢.٥٠")).toEqual({ amount: "12.50", currency: "USD" });
  });

  it("returns null when there is nothing money-shaped in the text", () => {
    expect(parseMoney("Residential plan")).toBeNull();
  });
});
