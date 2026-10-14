import { describe, expect, it } from "vitest";
import { foreignRateFromQuote, partyNetIn } from "./partyNet";

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
