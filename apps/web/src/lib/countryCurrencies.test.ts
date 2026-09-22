import { describe, expect, it } from "vitest";
import { COUNTRY_CURRENCIES } from "./countryCurrencies";

describe("COUNTRY_CURRENCIES", () => {
  it("gives every entry a non-empty country, code, name and symbol", () => {
    for (const option of COUNTRY_CURRENCIES) {
      expect(option.country.trim()).not.toBe("");
      expect(option.code.trim()).not.toBe("");
      expect(option.name.trim()).not.toBe("");
      expect(option.symbol.trim()).not.toBe("");
    }
  });

  it("keeps every code uppercase", () => {
    for (const option of COUNTRY_CURRENCIES) {
      expect(option.code).toBe(option.code.toUpperCase());
    }
  });

  it("uses a unique country name per entry (the picker's own key/value)", () => {
    const countries = COUNTRY_CURRENCIES.map((o) => o.country);
    expect(new Set(countries).size).toBe(countries.length);
  });

  it("includes USD, matching currencyStore's default reference currency", () => {
    expect(COUNTRY_CURRENCIES.some((o) => o.code === "USD")).toBe(true);
  });
});
