// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { knownUpdate, isUpdateAvailable, parseReleaseCommit, updateBannerText } from "./appUpdate";

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

  it("📲 remembers the update found until this build is it", () => {
    window.localStorage.removeItem("starnet.updateFound");
    expect(knownUpdate("abc1234")).toBeNull();
    window.localStorage.setItem("starnet.updateFound", "fff9999aaa");
    expect(knownUpdate("abc1234")).toBe("fff9999aaa");
    expect(knownUpdate("fff9999aaa11")).toBeNull(); // installed
    window.localStorage.setItem("starnet.updateFound", "not a sha");
    expect(knownUpdate("abc1234")).toBeNull();
  });

  it("📲 the banner says «جاهز» once it came down in the background", () => {
    expect(updateBannerText(true).title).toBe("التحديث جاهز - اضغط تثبيت");
    expect(updateBannerText(false).title).toBe("تحديث جديد للتطبيق متوفر");
  });
});
