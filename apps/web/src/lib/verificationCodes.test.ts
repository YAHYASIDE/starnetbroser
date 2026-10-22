import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { agoLabel, buildCodeRows } from "./verificationCodes";

const now = Date.parse("2026-10-22T12:00:00Z");
const accounts = [{ id: "d1", name: "جهاز السوق", expectedEmail: "demo-1@example.com" }] as StarlinkAccountSummary[];

describe("🔑 the codes log", () => {
  it("newest first, with its device, what it was for and how long ago", () => {
    const rows = buildCodeRows(
      [
        { at: now - 3 * 3600_000, accountId: "d1", kind: "starlink", code: "123456" },
        { at: now - 2 * 60_000, accountId: "", kind: "card", code: "9988" },
        { at: now - 60_000, accountId: "gone", kind: "mail", code: "4321" },
      ],
      accounts,
      "",
      now,
    );
    expect(rows.map((r) => [r.code, r.deviceName, r.kindLabel, r.ago, r.fresh])).toEqual([
      ["4321", "جهاز محذوف", "📧 دخول البريد", "قبل دقيقة", true],
      ["9988", "البطاقة", "💳 دفع البطاقة", "قبل دقيقتين", true],
      ["123456", "جهاز السوق", "🛰️ دخول Starlink", "قبل 3 ساعات", false],
    ]);
    expect(rows[2]!.email).toBe("demo-1@example.com");
  });

  it("search by device, email or the code itself", () => {
    const codes = [{ at: now, accountId: "d1", kind: "starlink" as const, code: "123456" }, { at: now, accountId: "", kind: "card" as const, code: "777" }];
    expect(buildCodeRows(codes, accounts, "السوق", now).map((r) => r.code)).toEqual(["123456"]);
    expect(buildCodeRows(codes, accounts, "demo-1", now).map((r) => r.code)).toEqual(["123456"]);
    expect(buildCodeRows(codes, accounts, "777", now).map((r) => r.code)).toEqual(["777"]);
  });

  it("ago in his words", () => {
    expect(agoLabel(now, now)).toBe("الآن");
    expect(agoLabel(now - 25 * 3600_000, now)).toBe("قبل يوم");
    expect(agoLabel(now - 50 * 3600_000, now)).toBe("قبل يومين");
    expect(agoLabel(now - 5 * 24 * 3600_000, now)).toBe("قبل 5 أيام");
  });
});
