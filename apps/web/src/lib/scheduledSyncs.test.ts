import { describe, expect, it } from "vitest";
import { DEFAULT_SCHEDULED_SYNCS, hourLabel, parseScheduledSyncs } from "./scheduledSyncs";

describe("⏰ مزامنات مجدولة - his Oct 17 2026 choices", () => {
  it("everything he chose is on by default, the morning at 8:00", () => {
    expect(parseScheduledSyncs(null)).toEqual(DEFAULT_SCHEDULED_SYNCS);
    expect(DEFAULT_SCHEDULED_SYNCS).toMatchObject({ morning: true, morningHour: 8, payment: true, retry: true, night: true, repCopy: true });
  });

  it("keeps what he changed and repairs a broken value", () => {
    expect(parseScheduledSyncs(JSON.stringify({ morning: false, morningHour: 6, nightHour: 99, retry: "yes" }))).toEqual({
      ...DEFAULT_SCHEDULED_SYNCS,
      morning: false,
      morningHour: 6,
    });
    expect(parseScheduledSyncs("not json")).toEqual(DEFAULT_SCHEDULED_SYNCS);
  });

  it("hours read in Arabic", () => {
    expect(hourLabel(8)).toBe("8:00 صباحًا");
    expect(hourLabel(23)).toBe("11:00 ليلًا");
    expect(hourLabel(0)).toBe("12:00 ليلًا");
    expect(hourLabel(13)).toBe("1:00 ظهرًا");
  });
});
