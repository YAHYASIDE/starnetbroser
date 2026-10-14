import { describe, expect, it } from "vitest";
import { CASH_CURRENCIES, cashCurrencyLabel } from "./cashCurrencies";

describe("cash currencies", () => {
  it("the ledger's three + the Algerian dinar, each with its Arabic name", () => {
    expect(CASH_CURRENCIES).toEqual(["MRU", "SIFA", "USD", "DZD"]);
    expect(CASH_CURRENCIES.map(cashCurrencyLabel)).toEqual(["أوقية", "سيفا", "دولار", "دينار جزائري"]);
    expect(cashCurrencyLabel("EUR")).toBe("EUR");
  });
});
