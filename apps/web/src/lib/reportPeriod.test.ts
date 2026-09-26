import { describe, expect, it } from "vitest";
import { filterEntriesByPeriod, isThisCalendarMonth, periodStartDate } from "./reportPeriod";
import { LedgerEntry } from "./ledgerStore";

const NOW = new Date(2026, 8, 23); // 2026-09-23 (local)

function entry(date: string): LedgerEntry {
  return { id: date, kind: "debit", amount: 10, currency: "USD", note: "", email: "", date, createdAt: `${date}T00:00:00.000Z` };
}

describe("periodStartDate", () => {
  it("returns today at midnight for 'today'", () => {
    const start = periodStartDate("today", NOW);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8);
    expect(start.getDate()).toBe(23);
  });

  it("returns 6 days back for 'week' (today inclusive = 7 days total)", () => {
    const start = periodStartDate("week", NOW);
    expect(start.getDate()).toBe(17);
  });

  it("returns 1 month back for 'month'", () => {
    const start = periodStartDate("month", NOW);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(23);
  });

  it("returns 1 year back for 'year'", () => {
    const start = periodStartDate("year", NOW);
    expect(start.getFullYear()).toBe(2025);
  });
});

describe("filterEntriesByPeriod", () => {
  it("keeps an entry dated today for 'today'", () => {
    const result = filterEntriesByPeriod([entry("2026-09-23")], "today", NOW);
    expect(result).toHaveLength(1);
  });

  it("drops an entry from yesterday for 'today'", () => {
    const result = filterEntriesByPeriod([entry("2026-09-22")], "today", NOW);
    expect(result).toHaveLength(0);
  });

  it("keeps an entry exactly on the week boundary (6 days ago)", () => {
    const result = filterEntriesByPeriod([entry("2026-09-17")], "week", NOW);
    expect(result).toHaveLength(1);
  });

  it("drops an entry one day before the week boundary", () => {
    const result = filterEntriesByPeriod([entry("2026-09-16")], "week", NOW);
    expect(result).toHaveLength(0);
  });

  it("never includes a future-dated entry", () => {
    const result = filterEntriesByPeriod([entry("2026-09-24")], "year", NOW);
    expect(result).toHaveLength(0);
  });

  it("drops an entry with an unparseable date rather than guessing it into the window", () => {
    const result = filterEntriesByPeriod([entry("not-a-date")], "year", NOW);
    expect(result).toHaveLength(0);
  });
});

describe("isThisCalendarMonth", () => {
  it("true for a date earlier this calendar month", () => {
    expect(isThisCalendarMonth("2026-09-01", NOW)).toBe(true);
  });

  it("false for a date in the previous month, even if within the last 30 days", () => {
    expect(isThisCalendarMonth("2026-08-30", NOW)).toBe(false);
  });

  it("false for an unparseable date", () => {
    expect(isThisCalendarMonth("nope", NOW)).toBe(false);
  });
});
