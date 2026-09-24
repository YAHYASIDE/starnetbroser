import { describe, expect, it } from "vitest";
import { isBalanceDueZero, planBadgeLabel, presentServiceStatus } from "./status";

describe("presentServiceStatus", () => {
  it("maps each normalized status to its Arabic label and badge color", () => {
    expect(presentServiceStatus("active")).toEqual({ className: "badge-green", label: "نشط" });
    expect(presentServiceStatus("standby")).toEqual({ className: "badge-yellow", label: "بانتظار التفعيل" });
    expect(presentServiceStatus("suspended")).toEqual({ className: "badge-red", label: "موقوف" });
    expect(presentServiceStatus("canceled")).toEqual({ className: "badge-gray", label: "ملغى" });
  });

  it("returns null when the account has never synced this field", () => {
    expect(presentServiceStatus(undefined)).toBeNull();
  });
});

describe("planBadgeLabel", () => {
  it("shortens a numbered roaming plan to its data amount + G", () => {
    expect(planBadgeLabel("التجوال - 100 غيغابايت")).toBe("100G");
    expect(planBadgeLabel("Roaming 40GB")).toBe("40G");
  });

  it("shortens an unlimited roaming plan to ROM", () => {
    expect(planBadgeLabel("تجوال غير محدود")).toBe("ROM");
    expect(planBadgeLabel("Unlimited Roaming")).toBe("ROM");
  });

  it("does not label a non-roaming unlimited plan as ROM", () => {
    expect(planBadgeLabel("Residential Unlimited")).toBeUndefined();
  });

  it("is undefined for a plan with no recognizable roaming pattern", () => {
    expect(planBadgeLabel("Residential")).toBeUndefined();
  });

  it("is undefined when there is no plan name at all", () => {
    expect(planBadgeLabel(undefined)).toBeUndefined();
  });
});

describe("isBalanceDueZero", () => {
  it("treats a confirmed 0.00 as zero", () => {
    expect(isBalanceDueZero("0.00")).toBe(true);
  });

  it("treats an empty string as not-zero (unknown, not confirmed)", () => {
    expect(isBalanceDueZero("")).toBe(false);
  });

  it("treats a real balance as not zero", () => {
    expect(isBalanceDueZero("5.00")).toBe(false);
  });
});
