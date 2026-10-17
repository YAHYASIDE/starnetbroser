// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isValidWifiCode, loadWifiDefault, saveWifiDefault } from "./wifiDefault";

describe("📶 his fixed Wi-Fi code (kept on the phone)", () => {
  beforeEach(() => window.localStorage.clear());

  it("a dish takes 8 to 63 characters", () => {
    expect(isValidWifiCode("demoWifi1")).toBe(true);
    expect(isValidWifiCode("short")).toBe(false);
    expect(isValidWifiCode("x".repeat(64))).toBe(false);
  });

  it("saved once, read back; cleared with an empty one", () => {
    expect(loadWifiDefault()).toBe("");
    expect(saveWifiDefault("  demoWifi1  ")).toBe(true);
    expect(loadWifiDefault()).toBe("demoWifi1");
    expect(saveWifiDefault("short")).toBe(false);
    expect(loadWifiDefault()).toBe("demoWifi1");
    expect(saveWifiDefault("")).toBe(true);
    expect(loadWifiDefault()).toBe("");
  });

  it("is a phone setting, not business data in the backup", () => {
    saveWifiDefault("demoWifi1");
    expect(Object.keys(window.localStorage).some((k) => k.startsWith("starnet_"))).toBe(false);
  });
});
