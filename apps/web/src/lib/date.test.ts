import { describe, expect, it } from "vitest";
import { daysRemainingLabel, daysRemainingNumber, formatRelativeTime, RENEWAL_DATE_UNREAD, renewalDateLabel } from "./date";

/** A "YYYY/MM/DD" renewal date `offset` days from today. */
function dateInDays(offset: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

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

describe("daysRemainingNumber", () => {
  it("is the raw calendar day count to the renewal date", () => {
    expect(daysRemainingNumber(dateInDays(5))).toBe(5);
    expect(daysRemainingNumber(dateInDays(1))).toBe(1);
    expect(daysRemainingNumber(dateInDays(0))).toBe(0);
    expect(daysRemainingNumber(dateInDays(-3))).toBe(-3);
  });

  it("is null for an empty or unparseable date", () => {
    expect(daysRemainingNumber("")).toBeNull();
    expect(daysRemainingNumber("   ")).toBeNull();
    expect(daysRemainingNumber("bad")).toBeNull();
  });
});

describe("daysRemainingLabel (renewal date = the stop instant, midnight of that day)", () => {
  it("a date still a few days out counts one less than the raw days (last active day)", () => {
    expect(daysRemainingLabel(dateInDays(5))).toBe("4 يومًا متبقٍ");
    expect(daysRemainingLabel(dateInDays(3))).toBe("2 يومًا متبقٍ");
  });

  it("the day before the last night says «يوم واحد متبقٍ»", () => {
    expect(daysRemainingLabel(dateInDays(2))).toBe("يوم واحد متبقٍ");
  });

  it("when the date is tomorrow the device is in its last night", () => {
    expect(daysRemainingLabel(dateInDays(1))).toBe("ينتهي الليلة");
  });

  it("when the date is today the device has already stopped", () => {
    expect(daysRemainingLabel(dateInDays(0))).toBe("منتهٍ");
  });

  it("counts the days since it stopped once the date has passed", () => {
    expect(daysRemainingLabel(dateInDays(-1))).toBe("منتهٍ منذ يوم");
    expect(daysRemainingLabel(dateInDays(-4))).toBe("منتهٍ منذ 4 يومًا");
  });

  it("is null for an empty or unparseable date", () => {
    expect(daysRemainingLabel("")).toBeNull();
    expect(daysRemainingLabel("bad")).toBeNull();
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
