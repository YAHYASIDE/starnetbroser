import { describe, expect, it } from "vitest";
import { countFaultCategories, faultCategory, faultLabel, isAutoFault, isFaulty } from "./deviceFault";
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
