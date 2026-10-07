import { describe, expect, it } from "vitest";
import { fitPayMethod, francBadge, francHint, francNote, isFrancAccount, isFrancMethod, methodLabel, sifaAsFranc, PAY_CURRENCIES, payFormOf, payMethodsFor, toLedgerPayment } from "./payCurrency";

describe("payCurrency - «سيفا كاش فقط، أورانج موني لفرانك فقط»", () => {
  it("offers فرانك beside the three currencies", () => {
    expect(PAY_CURRENCIES).toEqual(["MRU", "SIFA", "USD", "FRANC"]);
  });

  it("سيفا is cash only, فرانك is أورانج / نيتا only", () => {
    expect(payMethodsFor("SIFA")).toEqual(["cash"]);
    expect(payMethodsFor("FRANC")).toEqual(["orange", "nita"]);
    expect(payMethodsFor("MRU")).toEqual(["cash", "bankily", "masrvi", "sedad"]);
    expect(payMethodsFor("USD")).toEqual(["cash"]);
    expect(payMethodsFor("MRU")).not.toContain("orange");
  });

  it("keeps an old entry's own method listed so editing never changes it", () => {
    expect(payMethodsFor("USD", "bankily")).toEqual(["cash", "bankily"]);
    expect(fitPayMethod("USD", "bankily", "bankily")).toBe("bankily");
  });

  it("fits a method that doesn't belong to the currency", () => {
    expect(fitPayMethod("FRANC", "cash")).toBe("orange");
    expect(fitPayMethod("SIFA", "nita")).toBe("cash");
    expect(fitPayMethod("FRANC", "nita")).toBe("nita");
    expect(fitPayMethod("MRU", undefined)).toBe("cash");
  });

  it("stores 10,000 فرانك as 2,000 سيفا", () => {
    expect(toLedgerPayment("FRANC", 10000)).toEqual({ currency: "SIFA", amount: 2000 });
    expect(toLedgerPayment("SIFA", 10000)).toEqual({ currency: "SIFA", amount: 10000 });
    expect(toLedgerPayment("MRU", 500)).toEqual({ currency: "MRU", amount: 500 });
  });

  it("shows a saved سيفا payment by أورانج / نيتا back in فرانك", () => {
    expect(payFormOf({ currency: "SIFA", amount: 2000, paymentMethod: "orange" })).toEqual({ currency: "FRANC", amount: 10000 });
    expect(payFormOf({ currency: "SIFA", amount: 2000, paymentMethod: "cash" })).toEqual({ currency: "SIFA", amount: 2000 });
    expect(payFormOf({ currency: "MRU", amount: 300, paymentMethod: "bankily" })).toEqual({ currency: "MRU", amount: 300 });
  });

  it("explains the conversion under the amount", () => {
    expect(francNote("FRANC", 10000)).toBe("10,000 فرانك = 2,000 سيفا");
    expect(francNote("SIFA", 10000)).toBe("");
    expect(francNote("FRANC", 0)).toBe("");
    expect(isFrancMethod("nita")).toBe(true);
    expect(isFrancMethod("cash")).toBe(false);
  });

  it("knows the أورانج / نيتا accounts (سيفا wallets) and explains them", () => {
    expect(isFrancAccount({ currencyCode: "SIFA", method: "orange" })).toBe(true);
    expect(isFrancAccount({ currencyCode: "SIFA", method: "nita" })).toBe(true);
    expect(isFrancAccount({ currencyCode: "SIFA" })).toBe(false); // كاش سيفا
    expect(isFrancAccount({ currencyCode: "MRU", method: "bankily" })).toBe(false);
    expect(isFrancAccount(undefined)).toBe(false);
    expect(francHint(10000)).toBe("أورانج / نيتا بالفرانك: 10,000 فرانك = 2,000 سيفا");
    expect(francHint(0, "نيتا")).toBe("نيتا بالفرانك - اكتب المبلغ كما يظهر في التطبيق (5 فرانك = 1 سيفا)");
    expect(sifaAsFranc(8000)).toBe("8,000 سيفا = 40,000 فرانك");
  });

  it("marks saved سيفا records that went through أورانج / نيتا", () => {
    expect(francBadge({ currencyCode: "SIFA", amount: 2000 }, true)).toBe("🟠 10,000 فرانك");
    expect(francBadge({ currency: "SIFA", amount: 2000 }, false)).toBe("");
    expect(francBadge({ currencyCode: "MRU", amount: 2000 }, true)).toBe("");
    expect(methodLabel("orange", "SIFA", 2000)).toBe("أورانج موني · 🟠 10,000 فرانك");
    expect(methodLabel("bankily", "MRU", 2000)).toBe("بنكيلي");
    expect(methodLabel("cash", "SIFA", 2000)).toBe("نقدًا");
  });
});
