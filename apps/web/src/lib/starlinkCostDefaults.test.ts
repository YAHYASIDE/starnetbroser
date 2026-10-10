import { describe, expect, it } from "vitest";
import { starlinkCostDefaults } from "./starlinkCostDefaults";
import { COUNTRY_BY_ISO2, COUNTRY_CURRENCIES, countriesUsingCurrency, countryFlag, countryFromIso2 } from "./countryCurrencies";

describe("countryFromIso2", () => {
  it("maps a synced code to its country and currency", () => {
    expect(countryFromIso2("GR")).toMatchObject({ country: "اليونان", code: "EUR" });
    expect(countryFromIso2("fr")?.code).toBe("EUR");
    expect(countryFromIso2("US")?.code).toBe("USD");
    expect(countryFromIso2("ZZ")).toBeUndefined();
    expect(countryFromIso2(undefined)).toBeUndefined();
  });

  it("points every code at a real picker entry", () => {
    for (const name of Object.values(COUNTRY_BY_ISO2)) {
      expect(COUNTRY_CURRENCIES.some((o) => o.country === name)).toBe(true);
    }
  });

  it("builds the flag emoji", () => {
    expect(countryFlag("GR")).toBe("🇬🇷");
    expect(countryFlag("x")).toBe("");
  });

  it("lists every euro country under the one EUR currency", () => {
    const euro = countriesUsingCurrency("EUR");
    expect(euro).toEqual(expect.arrayContaining(["فرنسا", "النمسا", "اليونان", "ألمانيا"]));
  });
});

describe("starlinkCostDefaults", () => {
  it("uses Starlink's billing currency and the balance due", () => {
    const d = starlinkCostDefaults({ serviceCountry: "GR", billingCurrency: "EUR", balanceDue: "80.10", lastUsedCurrency: "USD" });
    expect(d).toMatchObject({ currencyCode: "EUR", amount: 80.1, detected: true });
    expect(d.country?.country).toBe("اليونان");
  });

  it("falls back to the country's currency when the balance was never read", () => {
    const d = starlinkCostDefaults({ serviceCountry: "AT", lastUsedCurrency: "USD" });
    expect(d).toMatchObject({ currencyCode: "EUR", amount: undefined, detected: true });
    expect(d.country?.country).toBe("النمسا");
  });

  it("takes the monthly plan's amount when the balance is zero", () => {
    const d = starlinkCostDefaults({
      billingCurrency: "EUR",
      balanceDue: "0.00",
      renewalPlan: { saleAmount: 4000, saleCurrency: "MRU", costAmount: 80, costCurrency: "EUR" },
    });
    expect(d).toMatchObject({ currencyCode: "EUR", amount: 80 });
  });

  it("drops the country when Starlink bills in a different currency", () => {
    const d = starlinkCostDefaults({ serviceCountry: "GR", billingCurrency: "USD", balanceDue: "65" });
    expect(d).toMatchObject({ currencyCode: "USD", amount: 65, country: undefined });
  });

  it("keeps the old behaviour with nothing synced", () => {
    expect(starlinkCostDefaults({ lastUsedCurrency: "ARS" })).toMatchObject({ currencyCode: "ARS", detected: false });
    expect(starlinkCostDefaults({})).toMatchObject({ currencyCode: "", detected: false });
  });
});
