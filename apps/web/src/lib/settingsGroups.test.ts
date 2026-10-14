import { describe, expect, it } from "vitest";
import { groupForHash, isSettingsGroupId, SETTINGS_GROUPS } from "./settingsGroups";

describe("settings groups", () => {
  it("has six groups, each with its own anchor", () => {
    expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual(["general", "alerts", "devices", "bots", "backup", "security"]);
    const anchors = SETTINGS_GROUPS.flatMap((g) => g.anchors);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("opens the group a link points at (the home page's backup banner, the sessions check)", () => {
    expect(groupForHash("#backup")).toBe("backup");
    expect(groupForHash("#sessions")).toBe("devices");
    expect(groupForHash("#bots")).toBe("bots");
    expect(groupForHash("")).toBeNull();
    expect(groupForHash("#nothing")).toBeNull();
  });

  it("checks ids", () => {
    expect(isSettingsGroupId("bots")).toBe(true);
    expect(isSettingsGroupId("x")).toBe(false);
    expect(isSettingsGroupId(null)).toBe(false);
  });
});
