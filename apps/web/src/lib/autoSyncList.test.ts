import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import { buildAutoSyncList } from "./autoSyncList";

function account(id: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id, customerId: id, name: `جهاز ${id}`, deviceName: "Kit", kitNumber: "", serialNumber: "", standbyDate: "",
    rechargeDate: "2026/09/30", balanceDue: "0", currency: "USD", dishStatus: DeviceStatus.GREEN,
    wifiStatus: DeviceStatus.GREEN, alertReason: "", lastUpdated: "", lastSuccessfulScanAt: null, planName: "", ...extra,
  };
}

describe("buildAutoSyncList", () => {
  it("sends each live device with its renewal date and status", () => {
    expect(buildAutoSyncList([account("a", { serviceStatus: "suspended", representativeId: "r1" })])).toEqual([
      { id: "a", name: "جهاز a", renewalDate: "2026/09/30", serviceStatus: "suspended", representativeId: "r1" },
    ]);
  });

  it("leaves out archived and deleted devices, and never auto-checks a broken one or one with no date", () => {
    const list = buildAutoSyncList([
      account("archived", { archivedAt: "2026-09-01" }),
      account("deleted", { deletedAt: "2026-09-01" }),
      account("broken", { deviceFault: { reason: "burned", note: "", reportedAt: "2026-09-01" } }),
      account("nodate", { rechargeDate: " " }),
    ]);
    expect(list.map((a) => a.id)).toEqual(["broken", "nodate"]);
    expect(list.every((a) => a.renewalDate === undefined)).toBe(true);
  });
});
