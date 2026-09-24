// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemePreference,
  getLastBackupAt,
  getThemePreference,
  isHelpModeEnabled,
  recordBackupExported,
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

describe("last backup timestamp", () => {
  it("is null when a backup has never been exported", () => {
    expect(getLastBackupAt()).toBeNull();
  });

  it("records and reads back the export time", () => {
    const now = new Date("2026-09-20T10:00:00.000Z");
    recordBackupExported(now);
    expect(getLastBackupAt()).toBe(now.toISOString());
  });
});
