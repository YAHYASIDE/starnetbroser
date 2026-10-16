import { describe, expect, it } from "vitest";
import { payTargetFrom } from "./payDeepLink";

describe("💳 the card's «D» opens its payment on the card page - in place, not by reloading (his Oct 16 2026 report)", () => {
  it("takes the D the card handed over, or ?pay= when the address carries it", () => {
    expect(payTargetFrom("", "entry-1")).toBe("entry-1");
    expect(payTargetFrom("?pay=entry-2", "entry-1")).toBe("entry-2");
    expect(payTargetFrom("", null)).toBeNull();
    expect(payTargetFrom("?x=1", null)).toBeNull();
  });
});
