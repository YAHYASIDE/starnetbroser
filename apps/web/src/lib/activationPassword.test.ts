// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isValidActivationPassword, loadActivationPassword, saveActivationPassword } from "./activationPassword";

describe("🔑 activation password", () => {
  beforeEach(() => window.localStorage.clear());

  it("8 to 63 characters", () => {
    expect(isValidActivationPassword("DemoPass")).toBe(true);
    expect(isValidActivationPassword("short")).toBe(false);
    expect(isValidActivationPassword("x".repeat(64))).toBe(false);
  });

  it("is kept on the phone only (starnet. key), refused when too short, cleared with empty", () => {
    expect(saveActivationPassword(" DemoPass-1 ")).toBe(true);
    expect(loadActivationPassword()).toBe("DemoPass-1");
    expect(window.localStorage.getItem("starnet.activationPassword")).toBe("DemoPass-1");
    expect(saveActivationPassword("abc")).toBe(false);
    expect(loadActivationPassword()).toBe("DemoPass-1");
    expect(saveActivationPassword("")).toBe(true);
    expect(loadActivationPassword()).toBe("");
  });
});
