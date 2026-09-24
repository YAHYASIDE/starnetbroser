import { describe, expect, it } from "vitest";
import {
  Currency,
  convertAmount,
  defaultCurrencyStore,
  fromUsd,
  getCurrency,
  listCurrencies,
  setCurrencyEnabled,
  setCurrencyRate,
  toUsd,
  upsertCurrency,
  withStarterCurrencies,
} from "./currencyStore";

function currency(overrides: Partial<Currency> = {}): Currency {
  return {
    code: "ARS",
    name: "بيزو أرجنتيني",
    symbol: "ARS",
    rateFromUsd: 1400,
    updatedAt: "2026-09-20T10:00:00.000Z",
    enabled: true,
    ...overrides,
  };
}

describe("defaultCurrencyStore", () => {
  it("contains exactly USD, with rate 1 and enabled", () => {
    const store = defaultCurrencyStore();
    expect(Object.keys(store)).toEqual(["USD"]);
    expect(store.USD.rateFromUsd).toBe(1);
    expect(store.USD.enabled).toBe(true);
  });
});

describe("getCurrency", () => {
  it("is case-insensitive on the code", () => {
    const store = { ARS: currency() };
    expect(getCurrency(store, "ars")).toEqual(store.ARS);
  });

  it("returns undefined for an unknown code or an undefined code", () => {
    const store = { ARS: currency() };
    expect(getCurrency(store, "EUR")).toBeUndefined();
    expect(getCurrency(store, undefined)).toBeUndefined();
  });
});

describe("listCurrencies", () => {
  it("puts USD first, then sorts the rest alphabetically by code", () => {
    const store = {
      ...defaultCurrencyStore(),
      MRU: currency({ code: "MRU" }),
      ARS: currency({ code: "ARS" }),
    };
    expect(listCurrencies(store).map((c) => c.code)).toEqual(["USD", "ARS", "MRU"]);
  });

  it("excludes disabled currencies by default", () => {
    const store = {
      ...defaultCurrencyStore(),
      ARS: currency({ code: "ARS", enabled: false }),
    };
    expect(listCurrencies(store).map((c) => c.code)).toEqual(["USD"]);
  });

  it("includes disabled currencies when asked", () => {
    const store = {
      ...defaultCurrencyStore(),
      ARS: currency({ code: "ARS", enabled: false }),
    };
    expect(listCurrencies(store, true).map((c) => c.code)).toEqual(["USD", "ARS"]);
  });
});

describe("upsertCurrency", () => {
  it("creates a new currency, uppercasing the code and trimming name/symbol", () => {
    const next = upsertCurrency({}, { code: " ars ", name: " بيزو ", symbol: " ARS ", rateFromUsd: 1400 });
    expect(next.ARS).toMatchObject({ code: "ARS", name: "بيزو", symbol: "ARS", rateFromUsd: 1400, enabled: true });
  });

  it("updates an existing currency's name/symbol/rate without resetting enabled to true", () => {
    const store = { ARS: currency({ enabled: false }) };
    const next = upsertCurrency(store, { code: "ARS", name: "بيزو جديد", symbol: "AR$", rateFromUsd: 1500 });
    expect(next.ARS.name).toBe("بيزو جديد");
    expect(next.ARS.rateFromUsd).toBe(1500);
    expect(next.ARS.enabled).toBe(false);
  });

  it("never lets USD's rate be set to anything but 1", () => {
    const next = upsertCurrency(defaultCurrencyStore(), { code: "USD", name: "دولار", symbol: "$", rateFromUsd: 999 });
    expect(next.USD.rateFromUsd).toBe(1);
  });

  it("does not mutate the input store", () => {
    const store = {};
    upsertCurrency(store, { code: "ARS", name: "بيزو", symbol: "ARS", rateFromUsd: 1400 });
    expect(store).toEqual({});
  });
});

describe("setCurrencyRate", () => {
  it("updates only the rate and updatedAt", () => {
    const store = { ARS: currency() };
    const next = setCurrencyRate(store, "ARS", 1500);
    expect(next.ARS.rateFromUsd).toBe(1500);
    expect(next.ARS.name).toBe(store.ARS.name);
    expect(next.ARS.updatedAt).not.toBe(store.ARS.updatedAt);
  });

  it("is a no-op for USD", () => {
    const store = defaultCurrencyStore();
    expect(setCurrencyRate(store, "USD", 2)).toEqual(store);
  });

  it("is a no-op for an unknown code", () => {
    const store = { ARS: currency() };
    expect(setCurrencyRate(store, "EUR", 1)).toEqual(store);
  });
});

describe("setCurrencyEnabled", () => {
  it("toggles a non-USD currency's enabled flag", () => {
    const store = { ARS: currency({ enabled: true }) };
    expect(setCurrencyEnabled(store, "ARS", false).ARS.enabled).toBe(false);
  });

  it("is a no-op for USD - it can never be hidden", () => {
    const store = defaultCurrencyStore();
    expect(setCurrencyEnabled(store, "USD", false)).toEqual(store);
  });
});

describe("toUsd / fromUsd", () => {
  it("converts 98,000 ARS at 1 USD=1,400 ARS to 70 USD", () => {
    expect(toUsd(98000, 1400)).toBe(70);
  });

  it("converts 45,000 MRU at 1 USD=400 MRU to 112.5 USD", () => {
    expect(toUsd(45000, 400)).toBe(112.5);
  });

  it("fromUsd is the inverse of toUsd", () => {
    expect(fromUsd(70, 1400)).toBe(98000);
    expect(fromUsd(112.5, 400)).toBe(45000);
  });
});

describe("convertAmount", () => {
  it("converts between two non-USD currencies by pivoting through USD", () => {
    const store = {
      ...defaultCurrencyStore(),
      ARS: currency({ code: "ARS", rateFromUsd: 1400 }),
      MRU: currency({ code: "MRU", rateFromUsd: 400 }),
    };
    // 98,000 ARS = 70 USD = 28,000 MRU
    expect(convertAmount(store, 98000, "ARS", "MRU")).toBe(28000);
  });

  it("is case-insensitive on both currency codes", () => {
    const store = { ...defaultCurrencyStore(), ARS: currency({ code: "ARS", rateFromUsd: 1400 }) };
    expect(convertAmount(store, 1400, "ars", "usd")).toBe(1);
  });

  it("returns undefined when either currency is unknown", () => {
    const store = defaultCurrencyStore();
    expect(convertAmount(store, 10, "USD", "EUR")).toBeUndefined();
    expect(convertAmount(store, 10, "EUR", "USD")).toBeUndefined();
  });

  it("returns undefined for a non-finite amount rather than a fabricated result", () => {
    const store = defaultCurrencyStore();
    expect(convertAmount(store, NaN, "USD", "USD")).toBeUndefined();
  });
});

describe("withStarterCurrencies", () => {
  it("adds every starter currency to an empty/default store", () => {
    const next = withStarterCurrencies(defaultCurrencyStore());
    for (const code of ["ALL", "EUR", "HNL", "ARS", "WST", "PHP"]) {
      expect(next[code]).toBeDefined();
      expect(next[code].rateFromUsd).toBeGreaterThan(0);
    }
  });

  it("never overwrites a starter currency the operator already has, even if they changed its rate", () => {
    const store = { ...defaultCurrencyStore(), EUR: currency({ code: "EUR", rateFromUsd: 0.9 }) };
    expect(withStarterCurrencies(store).EUR.rateFromUsd).toBe(0.9);
  });

  it("never re-adds a starter currency the operator has hidden", () => {
    const store = { ...defaultCurrencyStore(), EUR: currency({ code: "EUR", enabled: false }) };
    expect(withStarterCurrencies(store).EUR.enabled).toBe(false);
  });

  it("leaves an already-fully-populated store untouched", () => {
    let store = defaultCurrencyStore();
    store = withStarterCurrencies(store);
    expect(withStarterCurrencies(store)).toEqual(store);
  });
});
