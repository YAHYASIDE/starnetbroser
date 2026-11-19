import { describe, expect, it } from "vitest";
import { setCurrencyRate, upsertCurrency, type CurrencyStore } from "./currencyStore";
import {
  currencyCodeHash,
  isPinned,
  matchesCurrencyCode,
  newCodeProblem,
  pinCurrency,
  pinnedPayCheck,
  unpinCurrency,
} from "./currencyPin";

const NOW = "2026-11-19T10:00:00.000Z";
const store: CurrencyStore = {
  USD: { code: "USD", name: "دولار", symbol: "$", rateFromUsd: 1, updatedAt: NOW, enabled: true },
  BBD: { code: "BBD", name: "دولار بربادوسي", symbol: "BBD", rateFromUsd: 2, updatedAt: "2026-11-01T00:00:00.000Z", enabled: true },
};

describe("📌 pinning a rate", () => {
  it("pins and unpins; USD is never pinned", () => {
    const pinned = pinCurrency(store, "BBD", NOW);
    expect(isPinned(pinned.BBD)).toBe(true);
    expect(pinCurrency(store, "USD", NOW)).toBe(store);
    expect(isPinned(unpinCurrency(pinned, "BBD").BBD)).toBe(false);
  });

  it("nothing automatic changes a pinned rate", () => {
    const pinned = pinCurrency(store, "BBD", NOW);
    expect(setCurrencyRate(pinned, "BBD", 1.97).BBD.rateFromUsd).toBe(2);
    const upserted = upsertCurrency(pinned, { code: "BBD", name: "دولار بربادوسي", symbol: "BBD", rateFromUsd: 1.97 });
    expect(upserted.BBD).toMatchObject({ rateFromUsd: 2, pinnedAt: NOW, updatedAt: "2026-11-01T00:00:00.000Z" });
    // after unpinning it changes again
    expect(setCurrencyRate(unpinCurrency(pinned, "BBD"), "BBD", 1.97).BBD.rateFromUsd).toBe(1.97);
  });
});

describe("D paid in a pinned currency", () => {
  const pinned = pinCurrency(store, "BBD", NOW).BBD;

  it("up to 5$ more or less passes; beyond needs the code", () => {
    // 100 BBD at 2 = 50 $
    expect(pinnedPayCheck(pinned, 100, 54.5)).toEqual({ expectedUsd: 50, diffUsd: 4.5, needsCode: false });
    expect(pinnedPayCheck(pinned, 100, 45)).toEqual({ expectedUsd: 50, diffUsd: -5, needsCode: false });
    expect(pinnedPayCheck(pinned, 100, 55.01)?.needsCode).toBe(true);
    expect(pinnedPayCheck(pinned, 100, 44.9)?.needsCode).toBe(true);
  });

  it("a currency that is not pinned is not checked", () => {
    expect(pinnedPayCheck(store.BBD, 100, 80)).toBeNull();
    expect(pinnedPayCheck(undefined, 100, 80)).toBeNull();
  });
});

describe("«رمز العملات»", () => {
  it("only the hash is compared; Arabic digits are the same code", () => {
    const hash = currencyCodeHash("4821");
    expect(hash).not.toContain("4821");
    expect(matchesCurrencyCode("٤٨٢١", hash)).toBe(true);
    expect(matchesCurrencyCode("1111", hash)).toBe(false);
    expect(matchesCurrencyCode("4821", null)).toBe(false);
  });

  it("a new code: 4 at least, typed twice the same", () => {
    expect(newCodeProblem("12", "12")).toContain("4");
    expect(newCodeProblem("1234", "1235")).toBe("الرمزان غير متطابقين");
    expect(newCodeProblem("1234", "١٢٣٤")).toBeNull();
  });
});
