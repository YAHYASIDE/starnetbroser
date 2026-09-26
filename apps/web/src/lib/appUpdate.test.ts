import { describe, expect, it } from "vitest";
import { isUpdateAvailable, parseReleaseCommit } from "./appUpdate";

describe("appUpdate", () => {
  it("reads the commit from the release body", () => {
    expect(parseReleaseCommit("Automated staging build from commit D6D19315699bfbe9301f88622f8f0c656be4fa0e.\nDemo")).toBe(
      "d6d19315699bfbe9301f88622f8f0c656be4fa0e",
    );
    expect(parseReleaseCommit("no sha here")).toBeNull();
    expect(parseReleaseCommit(undefined)).toBeNull();
  });

  it("flags an update only when both commits are known and differ", () => {
    expect(isUpdateAvailable("abc1234def", "abc1234def")).toBe(false);
    expect(isUpdateAvailable("abc1234", "abc1234def")).toBe(false);
    expect(isUpdateAvailable("abc1234", "fff9999aaa")).toBe(true);
    expect(isUpdateAvailable("dev", "fff9999aaa")).toBe(false);
    expect(isUpdateAvailable("abc1234", null)).toBe(false);
  });
});
