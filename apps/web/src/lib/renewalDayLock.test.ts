import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { acceptRenewalMismatch, decideRenewalRead, ignoreRenewalMismatch, lockAllRenewalDays, lockRenewalDay, renewalDayOf, unlockRenewalDay } from "./renewalDayLock";
import { mergeSyncedFields } from "./starlinkSync";

const dev = (extra: Partial<StarlinkAccountSummary> = {}) => ({ id: "d1", name: "جهاز", rechargeDate: "2026/10/10", ...extra }) as StarlinkAccountSummary;

describe("📌 locked renewal day", () => {
  it("reads the day of a date (1-28 only)", () => {
    expect(renewalDayOf("2026/10/10")).toBe(10);
    expect(renewalDayOf("2026-11-03")).toBe(3);
    expect(renewalDayOf("2026/10/31")).toBeNull();
    expect(renewalDayOf("")).toBeNull();
  });

  it("locks the current day, or moves the date onto a day typed by hand", () => {
    expect(lockRenewalDay(dev())).toEqual({ lockedRenewalDay: 10, renewalDayMismatch: null, renewalDayIgnored: null });
    expect(lockRenewalDay(dev(), 12)).toMatchObject({ lockedRenewalDay: 12, rechargeDate: "2026/10/12" });
    expect(lockRenewalDay(dev({ rechargeDate: "" }))).toBeNull();
    // a 29-31 misread / old placeholder moves onto the nearest date with the locked day (his real case)
    expect(lockRenewalDay(dev({ rechargeDate: "2026/10/30" }), 3)).toMatchObject({ lockedRenewalDay: 3, rechargeDate: "2026/11/03" });
    expect(lockRenewalDay(dev({ rechargeDate: "2026/12/30" }), 3)).toMatchObject({ rechargeDate: "2027/01/03" });
    expect(lockRenewalDay(dev({ rechargeDate: "2026/10/05" }), 28)).toMatchObject({ rechargeDate: "2026/09/28" });
    expect(unlockRenewalDay()).toEqual({ lockedRenewalDay: null, renewalDayMismatch: null, renewalDayIgnored: null });
  });

  it("the sync may move the month, never the locked day", () => {
    const locked = dev({ lockedRenewalDay: 10 });
    expect(mergeSyncedFields(locked, { renewalDate: "2026/11/10" }).account.rechargeDate).toBe("2026/11/10");
    const wrong = mergeSyncedFields(locked, { renewalDate: "2026/11/12" });
    expect(wrong.account.rechargeDate).toBe("2026/10/10");
    expect(wrong.account.renewalDayMismatch).toMatchObject({ date: "2026/11/12", day: 12 });
    expect(wrong.updatedFields.map((f) => f.label).join()).toContain("⚠️ يوم تجديد مختلف (12)");
    // not locked: as before
    expect(mergeSyncedFields(dev(), { renewalDate: "2026/11/12" }).account.rechargeDate).toBe("2026/11/12");
  });

  it("accept = the device moved country; ignore = this read never warns again", () => {
    const warned = mergeSyncedFields(dev({ lockedRenewalDay: 10 }), { renewalDate: "2026/11/12" }).account;
    expect(acceptRenewalMismatch(warned)).toEqual({ rechargeDate: "2026/11/12", lockedRenewalDay: 12, renewalDayMismatch: null, renewalDayIgnored: null });
    const ignored = { ...warned, ...ignoreRenewalMismatch(warned) };
    expect(ignored.renewalDayMismatch).toBeNull();
    expect(decideRenewalRead(ignored, "2026/11/12")).toEqual({ kind: "ignored" });
    expect(mergeSyncedFields(ignored, { renewalDate: "2026/11/12" }).account.renewalDayMismatch).toBeNull();
    // a different wrong read warns again
    expect(decideRenewalRead(ignored, "2026/11/14")).toEqual({ kind: "mismatch", day: 14 });
  });

  it("locks every live device at its current day in one tap", () => {
    const { accounts, locked } = lockAllRenewalDays([
      dev({ id: "a" }),
      dev({ id: "b", lockedRenewalDay: 5, rechargeDate: "2026/10/05" }),
      dev({ id: "c", rechargeDate: "" }),
      dev({ id: "d", deletedAt: "2026-10-01" }),
    ]);
    expect(locked).toBe(1);
    expect(accounts.map((a) => a.lockedRenewalDay ?? null)).toEqual([10, 5, null, null]);
  });
});
