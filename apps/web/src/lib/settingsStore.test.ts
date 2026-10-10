// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemePreference,
  getDefaultInvoiceCurrency,
  getLastBackupAt,
  getThemePreference,
  isHelpModeEnabled,
  isRemindersBadgeEnabled,
  recordBackupExported,
  setDefaultInvoiceCurrency,
  setHelpModeEnabled,
  setRemindersBadgeEnabled,
  setThemePreference,
} from "./settingsStore";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme preference", () => {
  it("defaults to 'dark'", () => {
    expect(getThemePreference()).toBe("dark");
  });

  it("persists an explicit choice and reads it back", () => {
    setThemePreference("light");
    expect(getThemePreference()).toBe("light");
  });

  it("remembers 'system' and goes back to the dark default when set to 'dark'", () => {
    setThemePreference("system");
    expect(getThemePreference()).toBe("system");
    setThemePreference("dark");
    expect(getThemePreference()).toBe("dark");
  });

  it("setThemePreference applies data-theme immediately", () => {
    setThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applyThemePreference('system') marks the page to follow the device", () => {
    document.documentElement.dataset.theme = "dark";
    applyThemePreference("system");
    expect(document.documentElement.dataset.theme).toBe("system");
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

describe("default invoice currency", () => {
  it("defaults to MRU", () => {
    expect(getDefaultInvoiceCurrency()).toBe("MRU");
  });

  it("persists an explicit choice and reads it back", () => {
    setDefaultInvoiceCurrency("USD");
    expect(getDefaultInvoiceCurrency()).toBe("USD");
  });
});

describe("reminders badge visibility", () => {
  it("is on by default", () => {
    expect(isRemindersBadgeEnabled()).toBe(true);
  });

  it("turns off and persists", () => {
    setRemindersBadgeEnabled(false);
    expect(isRemindersBadgeEnabled()).toBe(false);
  });

  it("turns back on", () => {
    setRemindersBadgeEnabled(false);
    setRemindersBadgeEnabled(true);
    expect(isRemindersBadgeEnabled()).toBe(true);
  });
});
