import { describe, expect, it } from "vitest";
import { partyHue, partyInitials } from "./partyColor";

describe("partyHue", () => {
  it("is stable for the same seed", () => {
    expect(partyHue("client-123")).toBe(partyHue("client-123"));
  });

  it("spreads different seeds across more than one hue", () => {
    const hues = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(partyHue));
    expect(hues.size).toBeGreaterThan(1);
  });
});

describe("partyInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(partyInitials("محمد أحمد سالم")).toBe("م أ");
  });

  it("handles a single word and surrounding spaces", () => {
    expect(partyInitials("  Ali ")).toBe("A");
  });

  it("falls back to ? for an empty name", () => {
    expect(partyInitials("   ")).toBe("?");
  });
});
