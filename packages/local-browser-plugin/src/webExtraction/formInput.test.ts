// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { setNativeValue, typeValue } from "./formInput";

describe("typeValue", () => {
  it("sets the value and fires input + change so a framework re-validates (Submit enables)", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const seen: string[] = [];
    input.addEventListener("input", () => seen.push(`input:${input.value}`));
    input.addEventListener("change", () => seen.push(`change:${input.value}`));

    const ok = typeValue(input, "123456");

    expect(ok).toBe(true);
    expect(input.value).toBe("123456");
    expect(seen).toContain("input:123456");
    expect(seen).toContain("change:123456");
  });

  it("pushes React's hidden value tracker off the new value so a controlled input sees a change", () => {
    const input = document.createElement("input");
    const tracker = { value: "old", setValue(v: string) { this.value = v; } };
    (input as unknown as { _valueTracker: typeof tracker })._valueTracker = tracker;

    typeValue(input, "9");

    // If the tracker still held "9", React would treat the programmatic fill as a no-op.
    expect(tracker.value).not.toBe("9");
  });
});

describe("setNativeValue", () => {
  it("writes the value through the native setter", () => {
    const input = document.createElement("input");
    setNativeValue(input, "hello");
    expect(input.value).toBe("hello");
  });
});
