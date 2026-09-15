import { describe, expect, it } from "vitest";
import { expiryDay } from "./expiryDay";

describe("expiryDay", () => {
  const cases: [string, number | null][] = [
    ["28", 28],
    ["2026/10/13", 13],
    ["10/13/2026", 13],
    ["13/10/2026", 13],
    ["October 13, 2026", 13],
    ["13 أكتوبر 2026", 13],
    ["Oct 5 2026", 5],
    ["2026-01-31", 31],
    ["", null],
  ];

  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)} as ${expected}`, () => {
      expect(expiryDay(input)).toBe(expected);
    });
  }
});
