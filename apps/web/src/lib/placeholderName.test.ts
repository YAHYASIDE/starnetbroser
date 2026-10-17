import { describe, expect, it } from "vitest";
import { isPlaceholderName, placeholderRename } from "./placeholderName";

describe("✉️ a device named by the time takes its email (his Oct 17 2026 ask)", () => {
  it("knows the time names", () => {
    for (const name of ["📋 جهاز جديد 13:11", "جهاز جديد 9:05", "13:11", "13:11:40"]) expect(isPlaceholderName(name)).toBe(true);
    for (const name of ["مقهى النخيل", "13:11 مقهى", "demo@example.com", ""]) expect(isPlaceholderName(name)).toBe(false);
  });

  it("renames to the email once known, never a typed name", () => {
    expect(placeholderRename({ name: "📋 جهاز جديد 13:11", expectedEmail: "demo@example.com" })).toBe("demo@example.com");
    expect(placeholderRename({ name: "13:11", starlinkAccountEmail: "read@example.com" })).toBe("read@example.com");
    expect(placeholderRename({ name: "13:11" })).toBeNull();
    expect(placeholderRename({ name: "مقهى النخيل", expectedEmail: "demo@example.com" })).toBeNull();
  });
});
