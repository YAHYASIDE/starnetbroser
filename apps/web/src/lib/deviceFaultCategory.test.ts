import { describe, expect, it } from "vitest";
import { countFaultCategories, faultCategory, faultLabel, isAutoFault, isFaulty, pruneFaultDismissal, removeFaultPatch } from "./deviceFault";
import { effectiveServiceStatus } from "./status";

describe("«المعطلة» groups", () => {
  it("a reason the operator chose always wins", () => {
    expect(faultCategory({ deviceFault: { reason: "moved", note: "", reportedAt: "" }, limitedAccess: true })).toBe("moved");
    expect(isAutoFault({ deviceFault: { reason: "burned", note: "", reportedAt: "" } })).toBe(false);
  });

  it("finds no-subscription / canceled devices by itself (real case: «لا توجد اشتراكات»)", () => {
    expect(faultCategory({ noSubscription: true, serviceStatus: "active" })).toBe("canceled");
    expect(faultCategory({ serviceStatus: "canceled" })).toBe("canceled");
    expect(isAutoFault({ noSubscription: true })).toBe(true);
  });

  it("finds a secondary email (no subscriptions / settings / billing in its menu)", () => {
    expect(faultCategory({ limitedAccess: true, serviceStatus: "active" })).toBe("secondary");
  });

  it("a normal device is in no group", () => {
    expect(faultCategory({ serviceStatus: "active", limitedAccess: false, noSubscription: false })).toBeNull();
    expect(isFaulty({ serviceStatus: "suspended" })).toBe(false);
  });

  it("counts every group", () => {
    const counts = countFaultCategories([
      { noSubscription: true },
      { limitedAccess: true },
      { deviceFault: { reason: "burned", note: "", reportedAt: "" } },
      { deviceFault: { reason: "other", note: "", reportedAt: "" } },
      { serviceStatus: "active" },
    ]);
    expect(counts).toEqual({ canceled: 1, burned: 1, moved: 0, secondary: 1, other: 1 });
    expect(faultLabel("moved")).toBe("🔀 منقول");
  });

  it("no subscription shows as canceled even when the Home page read «active»", () => {
    expect(effectiveServiceStatus({ serviceStatus: "active", noSubscription: true })).toBe("canceled");
    expect(effectiveServiceStatus({ serviceStatus: "active", noSubscription: false })).toBe("active");
  });
});

describe("«✓ إزالة العطل»", () => {
  it("removes a group the app found by itself; Starlink's flag stays as read", () => {
    const secondary = { limitedAccess: true };
    const patch = removeFaultPatch(secondary);
    expect(patch).toEqual({ deviceFault: null, faultDismissed: ["secondary"] });
    expect(faultCategory({ ...secondary, ...patch })).toBeNull();
    expect(isFaulty({ ...secondary, ...patch })).toBe(false);
  });

  it("his own mark on an email that is also secondary: the device really leaves «المعطلة»", () => {
    const both = { deviceFault: { reason: "secondary" as const, note: "", reportedAt: "" }, limitedAccess: true, noSubscription: true };
    const after = { ...both, ...removeFaultPatch(both) };
    expect(after.deviceFault).toBeNull();
    expect(after.faultDismissed).toEqual(["canceled", "secondary"]);
    expect(faultCategory(after)).toBeNull();
  });

  it("a plain manual fault is just cleared", () => {
    expect(removeFaultPatch({ deviceFault: { reason: "burned", note: "", reportedAt: "" } })).toEqual({ deviceFault: null, faultDismissed: null });
  });

  it("a dismissed group comes back only after Starlink read it cleared, then set again", () => {
    const dismissed = { limitedAccess: true, faultDismissed: ["secondary" as const] };
    expect(pruneFaultDismissal(dismissed)).toEqual(["secondary"]);
    expect(pruneFaultDismissal({ ...dismissed, limitedAccess: false })).toBeNull();
    // A different group the app finds later still shows.
    expect(faultCategory({ ...dismissed, noSubscription: true })).toBe("canceled");
  });
});
