import { describe, expect, it } from "vitest";
import { statusFromComputedColor, statusFromLabelText } from "./statusColor";

describe("statusFromLabelText", () => {
  it("recognizes English status words", () => {
    expect(statusFromLabelText("Online")).toBe("online");
    expect(statusFromLabelText("Offline")).toBe("offline");
    expect(statusFromLabelText("Warning")).toBe("warning");
  });

  it("recognizes Arabic status words", () => {
    expect(statusFromLabelText("متصل")).toBe("online");
    expect(statusFromLabelText("غير متصل")).toBe("offline");
    expect(statusFromLabelText("تنبيه")).toBe("warning");
  });

  it("is case-insensitive and tolerates surrounding text", () => {
    expect(statusFromLabelText("Dish status: ONLINE")).toBe("online");
  });

  it("returns null (not 'unknown') for unrecognized text, so callers fall back to color", () => {
    expect(statusFromLabelText("Model X200")).toBeNull();
    expect(statusFromLabelText(null)).toBeNull();
    expect(statusFromLabelText(undefined)).toBeNull();
  });
});

describe("statusFromComputedColor", () => {
  it("classifies a green dot as online", () => {
    expect(statusFromComputedColor("rgb(34, 197, 94)")).toBe("online");
  });

  it("classifies a red dot as offline", () => {
    expect(statusFromComputedColor("rgb(239, 68, 68)")).toBe("offline");
  });

  it("classifies an amber/orange dot as warning", () => {
    expect(statusFromComputedColor("rgb(245, 158, 11)")).toBe("warning");
  });

  it("classifies a gray dot as unknown", () => {
    expect(statusFromComputedColor("rgb(150, 150, 150)")).toBe("unknown");
  });

  it("classifies black/white as unknown, not a color guess", () => {
    expect(statusFromComputedColor("rgb(0, 0, 0)")).toBe("unknown");
    expect(statusFromComputedColor("rgb(255, 255, 255)")).toBe("unknown");
  });

  it("handles rgba() the same way", () => {
    expect(statusFromComputedColor("rgba(34, 197, 94, 1)")).toBe("online");
  });

  it("returns unknown for unparsable or missing input", () => {
    expect(statusFromComputedColor("")).toBe("unknown");
    expect(statusFromComputedColor(null)).toBe("unknown");
    expect(statusFromComputedColor("not-a-color")).toBe("unknown");
  });
});
