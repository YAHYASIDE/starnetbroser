import { describe, expect, it } from "vitest";
import { callClock, callDocPath, endWords, isCallState, RING_MS, shouldRing } from "./callSignal";

describe("📞 voice call", () => {
  it("rings for a fresh call message that isn't mine only", () => {
    const now = 1_000_000;
    expect(shouldRing({ call: { id: "abcdef123456" }, at: now - 5_000 }, false, now)).toBe(true);
    expect(shouldRing({ call: { id: "abcdef123456" }, at: now - 5_000 }, true, now)).toBe(false);
    expect(shouldRing({ at: now }, false, now)).toBe(false);
    expect(shouldRing({ call: { id: "abcdef123456" }, at: now - RING_MS - 61_000 }, false, now)).toBe(false);
  });
  it("words, clock, path, states", () => {
    expect(callClock(65_400)).toBe("1:05");
    expect(callClock(-5)).toBe("0:00");
    expect(callDocPath("s1", "c1")).toBe("starnet/s1/calls/c1");
    expect(endWords("missed")).toBe("لم يرد");
    expect(endWords("elsewhere")).toContain("هاتف آخر");
    expect(isCallState("answered")).toBe(true);
    expect(isCallState("x")).toBe(false);
  });
});
