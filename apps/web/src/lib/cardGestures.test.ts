import { describe, expect, it } from "vitest";
import { gestureForTaps, isInteractiveTarget } from "./cardGestures";

describe("card gestures", () => {
  it("one tap = details, two = payment, three = edit", () => {
    expect(gestureForTaps(0)).toBeNull();
    expect(gestureForTaps(1)).toBe("details");
    expect(gestureForTaps(2)).toBe("payment");
    expect(gestureForTaps(3)).toBe("edit");
    expect(gestureForTaps(5)).toBe("edit");
  });

  it("taps on the card's own buttons and fields are left alone", () => {
    const at = (hit: boolean) => ({ closest: () => (hit ? {} : null) });
    expect(isInteractiveTarget(at(true))).toBe(true);
    expect(isInteractiveTarget(at(false))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});
