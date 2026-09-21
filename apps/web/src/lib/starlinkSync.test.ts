import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import { applyPendingSyncs, formatSyncMessage, mergeSyncedFields } from "./starlinkSync";

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

describe("applyPendingSyncs", () => {
  it("merges several consecutive results (Devices, then Subscriptions, then Billing) without erasing earlier ones", () => {
    const accounts = [baseAccount({ dishStatus: DeviceStatus.GRAY, planName: "", balanceDue: "" })];

    const result = applyPendingSyncs(
      accounts,
      [
        { syncId: "sync-1", accountId: "acc-1", fields: { dishStatus: "online" } },
        { syncId: "sync-2", accountId: "acc-1", fields: { planName: "التجوال - غير محدود" } },
        { syncId: "sync-3", accountId: "acc-1", fields: { balanceDue: "0.00", currency: "USD" } },
      ],
      new Set(),
    );

    const merged = result.accounts.find((a) => a.id === "acc-1")!;
    expect(merged.dishStatus).toBe(DeviceStatus.GREEN);
    expect(merged.planName).toBe("التجوال - غير محدود");
    expect(merged.balanceDue).toBe("0.00");
    expect(result.ackSyncIds).toEqual(["sync-1", "sync-2", "sync-3"]);
    expect(result.messages).toHaveLength(3);
  });

  it("never applies or messages the same syncId twice within one batch", () => {
    const accounts = [baseAccount({ planName: "" })];

    const result = applyPendingSyncs(
      accounts,
      [
        { syncId: "sync-1", accountId: "acc-1", fields: { planName: "خطة أولى" } },
        { syncId: "sync-1", accountId: "acc-1", fields: { planName: "خطة ثانية" } },
      ],
      new Set(),
    );

    const merged = result.accounts.find((a) => a.id === "acc-1")!;
    expect(merged.planName).toBe("خطة أولى");
    expect(result.ackSyncIds).toEqual(["sync-1"]);
    expect(result.messages).toHaveLength(1);
  });

  it("skips a syncId already in alreadyProcessed - e.g. one already applied live before a pending-list drain found it too", () => {
    const accounts = [baseAccount({ planName: "القديمة" })];

    const result = applyPendingSyncs(
      accounts,
      [{ syncId: "sync-1", accountId: "acc-1", fields: { planName: "خطة جديدة" } }],
      new Set(["sync-1"]),
    );

    const merged = result.accounts.find((a) => a.id === "acc-1")!;
    expect(merged.planName).toBe("القديمة");
    expect(result.ackSyncIds).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("still correctly merges a result that only ever arrived via a pending-list drain (the live event was lost while backgrounded)", () => {
    // Models: AccountBrowserActivity fired accountDataSynced while the app's Bridge was stopped,
    // so the live listener never ran at all - listPendingAccountSyncs (on resume) is the only
    // reason this ever reaches applyPendingSyncs.
    const accounts = [baseAccount({ dishStatus: DeviceStatus.GRAY })];

    const result = applyPendingSyncs(
      accounts,
      [{ syncId: "sync-lost-then-found", accountId: "acc-1", fields: { dishStatus: "offline" } }],
      new Set(),
    );

    const merged = result.accounts.find((a) => a.id === "acc-1")!;
    expect(merged.dishStatus).toBe(DeviceStatus.RED);
    expect(result.ackSyncIds).toEqual(["sync-lost-then-found"]);
  });

  it("acks (discards) a result for an account that no longer exists, without touching other accounts", () => {
    const accounts = [baseAccount({ id: "acc-1" })];

    const result = applyPendingSyncs(
      accounts,
      [{ syncId: "sync-1", accountId: "acc-deleted", fields: { planName: "لا يهم" } }],
      new Set(),
    );

    expect(result.accounts).toEqual(accounts);
    expect(result.ackSyncIds).toEqual(["sync-1"]);
    expect(result.messages).toEqual([]);
  });
});
