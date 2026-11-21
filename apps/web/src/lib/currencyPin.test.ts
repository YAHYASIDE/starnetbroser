import { describe, expect, it } from "vitest";
import { setCurrencyRate, upsertCurrency, type CurrencyStore } from "./currencyStore";
import {
  CURRENCIES_KEY,
  guardPinnedOp,
  pinAllCurrencies,
  refusedChange,
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

describe("📌 an impossible pinned rate (his Nov 21 2026 EUR at 0.27)", () => {
  const eur: CurrencyStore = {
    ...store,
    EUR: { code: "EUR", name: "يورو", symbol: "€", rateFromUsd: 0.2675, updatedAt: NOW, enabled: true, pinnedAt: NOW },
  };
  it("does not block the payment and says the pin is wrong", () => {
    const check = pinnedPayCheck(eur.EUR, 9.98, 11.45);
    expect(check?.needsCode).toBe(false);
    expect(check?.wrongPin).toEqual([0.75, 0.98]);
  });
  it("is never pinned; a believable rate is", () => {
    const { pinnedAt: _p, ...unpinned } = eur.EUR;
    const bad = { ...eur, EUR: unpinned };
    expect(pinCurrency(bad, "EUR", NOW)).toBe(bad);
    expect(pinCurrency({ ...bad, EUR: { ...unpinned, rateFromUsd: 0.87 } }, "EUR", NOW).EUR.pinnedAt).toBe(NOW);
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

describe("🛡️ a pinned rate is protected in the team (his Nov 21 2026 report)", () => {
  const T1 = "2026-11-19T10:00:00.000Z";
  const pinned = { code: "EUR", name: "يورو", symbol: "€", rateFromUsd: 0.86, updatedAt: T1, enabled: true, pinnedAt: T1 };
  const op = (v: unknown) => ({ k: CURRENCIES_KEY, v: v === null ? null : JSON.stringify(v) });
  const before = JSON.stringify(pinned);

  it("refuses an old build's rate or a dropped pin, a deletion too", () => {
    expect(guardPinnedOp(op({ ...pinned, rateFromUsd: 0.2675 }), before)).toBe("reject");
    const { pinnedAt: _p, ...noPin } = pinned;
    expect(guardPinnedOp(op({ ...noPin, rateFromUsd: 0.2675 }), before)).toBe("reject");
    expect(guardPinnedOp(op(noPin), before)).toBe("reject");
    expect(guardPinnedOp(op(null), before)).toBe("reject");
  });

  it("accepts his unpin with the code, a newer pin, and anything on an unpinned currency", () => {
    const { pinnedAt: _p, ...noPin } = pinned;
    expect(guardPinnedOp(op({ ...noPin, unpinnedAt: "2026-11-21T09:00:00.000Z" }), before)).toBeNull();
    expect(guardPinnedOp(op({ ...pinned, rateFromUsd: 0.87, pinnedAt: "2026-11-21T09:00:00.000Z" }), before)).toBeNull();
    expect(guardPinnedOp(op({ ...pinned, name: "اليورو" }), before)).toBeNull();
    expect(guardPinnedOp(op({ ...noPin, rateFromUsd: 0.5 }), JSON.stringify(noPin))).toBeNull();
    expect(guardPinnedOp({ k: "starnet_clients_v1", v: null }, before)).toBeNull();
  });

  it("unpin / pin note who and when; «ثبّت الكل» skips USD, hidden and impossible rates", () => {
    const store: CurrencyStore = {
      USD: { code: "USD", name: "دولار", symbol: "$", rateFromUsd: 1, updatedAt: T1, enabled: true },
      EUR: { ...pinned },
      MRU: { code: "MRU", name: "أوقية", symbol: "MRU", rateFromUsd: 40, updatedAt: T1, enabled: true },
      GBP: { code: "GBP", name: "جنيه", symbol: "£", rateFromUsd: 0.2, updatedAt: T1, enabled: true },
      XOF: { code: "XOF", name: "سيفا", symbol: "CFA", rateFromUsd: 560, updatedAt: T1, enabled: false },
    };
    const unpinned = unpinCurrency(store, "EUR", "2026-11-21T09:00:00.000Z", "هاتفي");
    expect(unpinned.EUR).toMatchObject({ unpinnedAt: "2026-11-21T09:00:00.000Z" });
    expect(unpinned.EUR!.pinnedAt).toBeUndefined();
    expect(unpinned.EUR!.changes?.at(-1)).toEqual({ at: "2026-11-21T09:00:00.000Z", by: "هاتفي", what: "unpin", rate: 0.86 });
    const all = pinAllCurrencies(unpinned, "2026-11-21T10:00:00.000Z", "المسؤول 2");
    expect(all.pinned.sort()).toEqual(["EUR", "MRU"]);
    expect(all.wrong).toEqual(["GBP"]);
    expect(all.store.EUR).toMatchObject({ pinnedAt: "2026-11-21T10:00:00.000Z" });
    expect(all.store.EUR!.unpinnedAt).toBeUndefined();
    expect(all.store.MRU!.changes).toEqual([{ at: "2026-11-21T10:00:00.000Z", by: "المسؤول 2", what: "pin", rate: 40 }]);
    expect(all.store.XOF!.pinnedAt).toBeUndefined();
    expect(setCurrencyRate(unpinned, "EUR", 0.87, "هاتفي").EUR!.changes?.at(-1)).toMatchObject({ by: "هاتفي", what: "rate", rate: 0.87 });
    expect(refusedChange({ r: "EUR", v: JSON.stringify({ rateFromUsd: 0.2675 }), at: T1 }, "اللابتوب")).toEqual({ at: T1, by: "اللابتوب", code: "EUR", rate: 0.2675, unpinned: true });
  });
});
