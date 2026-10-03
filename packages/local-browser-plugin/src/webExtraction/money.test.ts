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

  it("recognizes ARS (and other non-USD Starlink billing currencies) - a real, confirmed miss", () => {
    expect(parseMoney("ARS 137861.11")).toEqual({ amount: "137861.11", currency: "ARS" });
    expect(parseMoney("42.00 CLP")).toEqual({ amount: "42.00", currency: "CLP" });
  });

  it("parses a comma-grouped thousands amount with a period decimal point", () => {
    expect(parseMoney("ARS 137,861.11")).toEqual({ amount: "137861.11", currency: "ARS" });
  });

  it("parses a period-grouped thousands amount with a comma decimal point (EU-style)", () => {
    expect(parseMoney("ARS 137.861,11")).toEqual({ amount: "137861.11", currency: "ARS" });
  });

  it("reads a comma-grouped whole number with no fractional part as that whole number", () => {
    expect(parseMoney("ARS 1,234")).toEqual({ amount: "1234.00", currency: "ARS" });
  });

  it("normalizes the real Arabic thousands (٬) and decimal (٫) separator marks", () => {
    expect(parseMoney("ARS ١٣٧٬٨٦١٫١١")).toEqual({ amount: "137861.11", currency: "ARS" });
  });

  it("normalizes € and £ symbols to EUR/GBP", () => {
    expect(parseMoney("€12.50")).toEqual({ amount: "12.50", currency: "EUR" });
    expect(parseMoney("£12.50")).toEqual({ amount: "12.50", currency: "GBP" });
  });
});
