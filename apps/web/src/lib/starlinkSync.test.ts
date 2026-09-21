import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import { formatSyncMessage, mergeSyncedFields } from "./starlinkSync";

// Fake/dummy account + field data only - no real Starlink account data anywhere in this file.
function baseAccount(overrides: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id: "acc-1",
    customerId: "cust-1",
    name: "mounay",
    deviceName: "Dish 1",
    kitNumber: "KIT-000111",
    serialNumber: "SN123456789",
    standbyDate: "",
    rechargeDate: "2026/09/28",
    balanceDue: "0.00",
    currency: "USD",
    dishStatus: DeviceStatus.GREEN,
    wifiStatus: DeviceStatus.GREEN,
    alertReason: "",
    lastUpdated: "قبل يوم",
    lastSuccessfulScanAt: null,
    planName: "التجوال - غير محدود",
    ...overrides,
  };
}

describe("mergeSyncedFields - scanned vs. changed", () => {
  it("reports scanned=false and no updated fields when nothing was found on the page", () => {
    const { account, updatedFields, scanned } = mergeSyncedFields(baseAccount(), {});
    expect(scanned).toBe(false);
    expect(updatedFields).toEqual([]);
    expect(account.lastSuccessfulScanAt).toBeNull();
  });

  it("reports scanned=true with no updated fields when the found values already match", () => {
    const account = baseAccount({ planName: "التجوال - غير محدود" });
    const result = mergeSyncedFields(account, { planName: "التجوال - غير محدود" });

    expect(result.scanned).toBe(true);
    expect(result.updatedFields).toEqual([]);
    // A confirming scan is still a real, successful scan - its time must be recorded.
    expect(result.account.lastSuccessfulScanAt).not.toBeNull();
  });

  it("reports scanned=true with updated fields when a found value actually changed", () => {
    const result = mergeSyncedFields(baseAccount(), { planName: "خطة جديدة" });

    expect(result.scanned).toBe(true);
    expect(result.updatedFields.map((f) => f.field)).toEqual(["planName"]);
    expect(result.account.planName).toBe("خطة جديدة");
    expect(result.account.lastSuccessfulScanAt).not.toBeNull();
  });

  it("never overwrites the local customer name", () => {
    const result = mergeSyncedFields(baseAccount({ name: "mounay" }), { planName: "خطة جديدة" });
    expect(result.account.name).toBe("mounay");
  });

  it("treats a confirmed 0.00 balance as a real value, not an absent one", () => {
    const result = mergeSyncedFields(baseAccount({ balanceDue: "5.00" }), { balanceDue: "0.00", currency: "USD" });
    expect(result.account.balanceDue).toBe("0.00");
    expect(result.updatedFields.map((f) => f.field)).toContain("balanceDue");
  });
});

describe("formatSyncMessage - three distinct outcomes", () => {
  it("shows the 'nothing found' message only when the page had nothing recognizable at all", () => {
    const message = formatSyncMessage("mounay", [], false);
    expect(message).toContain("لم يتم العثور على بيانات");
  });

  it("shows the 'checked, no changes' message when fields were found but all already matched", () => {
    const message = formatSyncMessage("mounay", [], true);
    expect(message).toBe("تم الفحص بنجاح ولا توجد تغييرات");
    expect(message).not.toContain("لم يتم العثور على بيانات");
  });

  it("shows the normal update message, grouped by section, when something changed", () => {
    const message = formatSyncMessage("mounay", [{ field: "planName", label: "الخطة", section: "subscriptions" }], true);
    expect(message).toContain("mounay");
    expect(message).toContain("الخطة");
  });
});
