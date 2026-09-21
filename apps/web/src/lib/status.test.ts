import { describe, expect, it } from "vitest";
import { isBalanceDueZero, presentServiceStatus } from "./status";

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
