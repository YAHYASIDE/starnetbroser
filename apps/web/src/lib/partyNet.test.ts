import { describe, expect, it } from "vitest";
import { foreignRateFromQuote, mruQuoteFor, partyNetIn, partyStanding } from "./partyNet";

// His example: له 60,000 سيفا, عليه 214,000 أوقية, at 1,000 سيفا = 3,600 أوقية (USD = 432 أوقية = 120 سيفا).
const rates: Record<string, number> = { MRU: 432, SIFA: 120 };
const rateOf = (c: string) => rates[c];

describe("⚖️ the net in his own currency", () => {
  it("أوقية customer: 216,000 − 214,000 → له 2,000", () => {
    const net = partyNetIn({ MRU: 214000, SIFA: -60000 }, "MRU", rateOf)!;
    expect(net.amount).toBe(-2000);
    expect(net.converted).toEqual([{ currency: "SIFA", amount: -60000, inBase: -216000, quote: { foreign: "SIFA", block: 1000, mru: 3600 } }]);
  });

  it("سيفا customer: له 555.56 سيفا", () => {
    expect(partyNetIn({ MRU: 214000, SIFA: -60000 }, "SIFA", rateOf)!.amount).toBeCloseTo(-555.56, 2);
  });

  it("nothing with one currency only, or a currency without a rate", () => {
    expect(partyNetIn({ MRU: 214000 }, "MRU", rateOf)).toBeNull();
    expect(partyNetIn({ MRU: 214000, SIFA: 0 }, "MRU", rateOf)).toBeNull();
    expect(partyNetIn({ MRU: 1, ARS: 5 }, "MRU", rateOf)).toBeNull();
  });
});

describe("✎ his rate on that line", () => {
  it("«1,000 سيفا = 3,600 أوقية» with أوقية at 435 → سيفا at 120.83 per dollar", () => {
    // his screenshot: the registry gave 1,000 سيفا = 3,642 أوقية (435 / 119.44) - he wants 3,600
    expect(foreignRateFromQuote({ foreign: "SIFA", block: 1000, mru: 3600 }, 435)).toBeCloseTo(120.833, 3);
    const net = partyNetIn({ MRU: 214000, SIFA: -60000 }, "MRU", (c) => ({ MRU: 435, SIFA: 435000 / 3600 })[c])!;
    expect(net.amount).toBeCloseTo(-2000, 6);
  });
});

describe("💱 «سعر 1,000 سيفا بالأوقية» in العملات (his Oct 16 2026 ask)", () => {
  it("shows today's rate his way and typing 3,600 gives exactly 3.6 أوقية per سيفا", () => {
    // His real case: 14,000 سيفا showed as 50,393.05 أوقية (3.5995 each) instead of 50,400.
    expect(mruQuoteFor("SIFA", 120.85, 435)).toEqual({ foreign: "SIFA", block: 1000, mru: 3599.5 });
    const sifa = foreignRateFromQuote({ foreign: "SIFA", block: 1000, mru: 3600 }, 435);
    expect((14000 / sifa) * 435).toBeCloseTo(50400, 6);
    expect(mruQuoteFor("EUR", 0.9, 435)).toEqual({ foreign: "EUR", block: 1, mru: 483.33 });
    expect(mruQuoteFor("MRU", 435, 435)).toBeNull();
    expect(mruQuoteFor("USD", 1, 435)).toBeNull();
    expect(mruQuoteFor("SIFA", 120, undefined)).toBeNull();
  });
});

describe("⚖️ where his account stands (his Oct 19 2026 report «دفع كل شيء وحسابه 0»)", () => {
  // 1,000 سيفا = 3,700 أوقية (USD = 444 أوقية = 120 سيفا).
  const rate = (c: string) => ({ MRU: 444, SIFA: 120 })[c];

  it("32,000 سيفا عليه against 118,400 أوقية له is «متعادل», never «عليه دين»", () => {
    const remaining = { MRU: -118400, SIFA: 32000 };
    const net = partyNetIn(remaining, "MRU", rate)!;
    expect(net.amount).toBe(0);
    expect(partyStanding(remaining, net)).toBe("clear");
  });

  it("the net decides the side; one currency as before", () => {
    expect(partyStanding({ MRU: -100000, SIFA: 32000 }, partyNetIn({ MRU: -100000, SIFA: 32000 }, "MRU", rate))).toBe("due");
    expect(partyStanding({ MRU: -120000, SIFA: 32000 }, partyNetIn({ MRU: -120000, SIFA: 32000 }, "MRU", rate))).toBe("credit");
    expect(partyStanding({ MRU: 500 }, null)).toBe("due");
    expect(partyStanding({ MRU: -500 }, null)).toBe("credit");
    expect(partyStanding({ MRU: 0 }, null)).toBe("clear");
  });
});
