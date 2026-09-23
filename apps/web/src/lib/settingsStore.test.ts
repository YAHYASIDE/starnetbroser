// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemePreference,
  getThemePreference,
  isHelpModeEnabled,
  setHelpModeEnabled,
  setThemePreference,
} from "./settingsStore";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme preference", () => {
  it("defaults to 'system'", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("persists an explicit choice and reads it back", () => {
    setThemePreference("dark");
    expect(getThemePreference()).toBe("dark");
  });

  it("clears the stored value when set back to 'system'", () => {
    setThemePreference("light");
    setThemePreference("system");
    expect(getThemePreference()).toBe("system");
  });

  it("setThemePreference applies data-theme immediately", () => {
    setThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applyThemePreference('system') removes the data-theme attribute", () => {
    document.documentElement.dataset.theme = "dark";
    applyThemePreference("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("applyThemePreference with no argument re-applies the currently stored preference", () => {
    setThemePreference("light");
    delete document.documentElement.dataset.theme;
    applyThemePreference();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("help mode", () => {
  it("is off by default", () => {
    expect(isHelpModeEnabled()).toBe(false);
  });

  it("turns on and persists", () => {
    setHelpModeEnabled(true);
    expect(isHelpModeEnabled()).toBe(true);
  });

  it("turns back off", () => {
    setHelpModeEnabled(true);
    setHelpModeEnabled(false);
    expect(isHelpModeEnabled()).toBe(false);
  });
});
