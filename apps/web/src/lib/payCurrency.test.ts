import { describe, expect, it } from "vitest";
import { fitPayMethod, francNote, isFrancMethod, PAY_CURRENCIES, payFormOf, payMethodsFor, toLedgerPayment } from "./payCurrency";

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
});
