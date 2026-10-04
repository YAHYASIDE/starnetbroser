import { describe, expect, it } from "vitest";
import { formatRelativeTime, RENEWAL_DATE_UNREAD, renewalDateLabel } from "./date";

describe("formatRelativeTime", () => {
  it("returns null for a missing timestamp - never synced, not 'synced now'", () => {
    expect(formatRelativeTime(null)).toBeNull();
    expect(formatRelativeTime(undefined)).toBeNull();
  });

  it("returns null for an unparseable timestamp", () => {
    expect(formatRelativeTime("not a date")).toBeNull();
  });

  it("reports 'الآن' for a timestamp from just now", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("الآن");
  });

  it("reports minutes for a timestamp a few minutes ago", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatRelativeTime(tenMinutesAgo)).toBe("منذ 10 دقيقة");
  });

  it("reports hours for a timestamp a few hours ago", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(threeHoursAgo)).toBe("منذ 3 ساعة");
  });

  it("reports days for a timestamp a few days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe("منذ 2 يوم");
  });

  it("falls back to a plain date for anything a week or more old", () => {
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(longAgo);
    expect(result).not.toBeNull();
    expect(result).not.toContain("منذ");
  });
});

describe("renewalDateLabel", () => {
  it("shows the date when there is one", () => {
    expect(renewalDateLabel("2026/10/24")).toBe("2026/10/24");
  });

  it("shows «لم يُقرأ بعد» for an empty or missing date", () => {
    expect(renewalDateLabel("")).toBe(RENEWAL_DATE_UNREAD);
    expect(renewalDateLabel("  ")).toBe(RENEWAL_DATE_UNREAD);
    expect(renewalDateLabel(undefined)).toBe(RENEWAL_DATE_UNREAD);
  });
});
