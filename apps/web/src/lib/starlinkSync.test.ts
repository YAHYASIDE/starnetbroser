import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import {
  applyPendingSyncs,
  formatSyncMessage,
  mergeSyncedFields,
  reapplyCachedSyncedFields,
  runSyncBatch,
  SyncBatchDeps,
} from "./starlinkSync";

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

  it("merges pendingCancellationDate as its own field alongside an active serviceStatus", () => {
    // A "scheduled to end" banner never means the account is paused - see extractStarlinkFields'
    // own doc for the real bug this corrects (the banner used to force serviceStatus "standby").
    const result = mergeSyncedFields(baseAccount(), {
      serviceStatus: "active",
      pendingCancellationDate: "2026/10/15",
    });
    expect(result.account.serviceStatus).toBe("active");
    expect(result.account.pendingCancellationDate).toBe("2026/10/15");
    expect(result.updatedFields.map((f) => f.field).sort()).toEqual(["pendingCancellationDate", "serviceStatus"]);
  });

  it("sets isRestricted true and reports it as an updated field", () => {
    const result = mergeSyncedFields(baseAccount(), { isRestricted: true });
    expect(result.account.isRestricted).toBe(true);
    expect(result.updatedFields.map((f) => f.field)).toEqual(["isRestricted"]);
  });

  it("actively corrects a stale isRestricted=true back to false (explicit false is a real result, never skipped like an absent field)", () => {
    const result = mergeSyncedFields(baseAccount({ isRestricted: true }), { isRestricted: false });
    expect(result.account.isRestricted).toBe(false);
    expect(result.updatedFields.map((f) => f.field)).toEqual(["isRestricted"]);
  });

  it("leaves isRestricted untouched when the field wasn't found on this page at all", () => {
    const result = mergeSyncedFields(baseAccount({ isRestricted: true }), { planName: "خطة جديدة" });
    expect(result.account.isRestricted).toBe(true);
    expect(result.updatedFields.map((f) => f.field)).toEqual(["planName"]);
  });

  it("never overwrites the local customer name", () => {
    const result = mergeSyncedFields(baseAccount({ name: "mounay" }), { planName: "خطة جديدة" });
    expect(result.account.name).toBe("mounay");
  });

  it("writes the Starlink account holder's name to its own separate field, never onto the local customer name", () => {
    // Explicit product decision: the card shows both names as two distinct slots - one
    // auto-synced from Starlink, one manually entered by the operator - never merged.
    const result = mergeSyncedFields(baseAccount({ name: "mounay" }), { accountHolderName: "test holder" });
    expect(result.account.name).toBe("mounay");
    expect(result.account.starlinkAccountHolderName).toBe("test holder");
    expect(result.updatedFields.map((f) => f.field)).toEqual(["accountHolderName"]);
  });

  it("writes the Starlink registered email to its own separate field, never touching local phone", () => {
    const result = mergeSyncedFields(baseAccount({ phone: "22299998888" }), { accountEmail: "test.holder@example.com" });
    expect(result.account.starlinkAccountEmail).toBe("test.holder@example.com");
    expect(result.account.phone).toBe("22299998888");
  });

  it("merges subscriptionId and dataUsageGb as their own separate fields", () => {
    const result = mergeSyncedFields(baseAccount(), { subscriptionId: "SL-XX-11112222-33334-44", dataUsageGb: "261" });
    expect(result.account.subscriptionId).toBe("SL-XX-11112222-33334-44");
    expect(result.account.dataUsageGb).toBe("261");
    expect(result.updatedFields.map((f) => f.field).sort()).toEqual(["dataUsageGb", "subscriptionId"]);
  });

  it("treats a confirmed 0.00 balance as a real value, not an absent one", () => {
    const result = mergeSyncedFields(baseAccount({ balanceDue: "5.00" }), { balanceDue: "0.00", currency: "USD" });
    expect(result.account.balanceDue).toBe("0.00");
    expect(result.updatedFields.map((f) => f.field)).toContain("balanceDue");
  });

  it("fills in the phone from Starlink when the operator hasn't entered one yet", () => {
    const result = mergeSyncedFields(baseAccount({ phone: "" }), { phone: "22212345678" });
    expect(result.account.phone).toBe("22212345678");
    expect(result.updatedFields.map((f) => f.field)).toEqual(["phone"]);
  });

  it("never overwrites a phone number the operator already entered by hand", () => {
    const result = mergeSyncedFields(baseAccount({ phone: "22299998888" }), { phone: "22212345678" });
    expect(result.account.phone).toBe("22299998888");
    expect(result.updatedFields).toEqual([]);
  });

  it("never lets an unresolvable dot ('unknown') erase an already-known good dish/wifi status", () => {
    // Real bug this fixes: a later scan on a slightly different page layout found a dot it
    // couldn't classify and silently downgraded a real "online" reading to "لا توجد بيانات
    // حديثة", discarding the last known-good status instead of keeping it.
    const result = mergeSyncedFields(
      baseAccount({ dishStatus: DeviceStatus.GREEN, wifiStatus: DeviceStatus.RED }),
      { dishStatus: "unknown", wifiStatus: "unknown" },
    );
    expect(result.account.dishStatus).toBe(DeviceStatus.GREEN);
    expect(result.account.wifiStatus).toBe(DeviceStatus.RED);
    expect(result.updatedFields).toEqual([]);
  });

  it("still records a genuinely resolved dish/wifi status normally", () => {
    const result = mergeSyncedFields(
      baseAccount({ dishStatus: DeviceStatus.GRAY, wifiStatus: DeviceStatus.GRAY }),
      { dishStatus: "online", wifiStatus: "offline" },
    );
    expect(result.account.dishStatus).toBe(DeviceStatus.GREEN);
    expect(result.account.wifiStatus).toBe(DeviceStatus.RED);
    expect(result.updatedFields.map((f) => f.field).sort()).toEqual(["dishStatus", "wifiStatus"]);
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

describe("applyPendingSyncs - readiness ordering (round 7 regression: mounay must not look deleted)", () => {
  // Models HomeView's two distinct account snapshots: the SSR-safe demo seed it starts render
  // with, versus the real demo accounts (including a real account like "mounay") once
  // loadDemoAccounts() actually finishes reading localStorage. Calling applyPendingSyncs against
  // the FIRST one - i.e. before that load has completed - is exactly the bug a readyGate exists
  // to prevent.
  const seedAccounts = [baseAccount({ id: "demo-seed-1", name: "حساب تجريبي" })];
  const loadedAccounts = [baseAccount({ id: "mounay-acc", name: "mounay", planName: "" })];
  const sync = { syncId: "sync-1", accountId: "mounay-acc", fields: { planName: "التجوال - غير محدود" } };

  it("would wrongly discard mounay's sync if applied too early, against the pre-load seed accounts", () => {
    const result = applyPendingSyncs(seedAccounts, [sync], new Set());

    expect(result.accounts).toEqual(seedAccounts); // untouched - "mounay" isn't in this array at all
    expect(result.ackSyncIds).toEqual(["sync-1"]); // discarded as if the account didn't exist
    expect(result.messages).toEqual([]); // and silently, with no message either
  });

  it("correctly merges mounay's sync once applied against the real, already-loaded accounts", () => {
    const result = applyPendingSyncs(loadedAccounts, [sync], new Set());

    const merged = result.accounts.find((a) => a.id === "mounay-acc")!;
    expect(merged.planName).toBe("التجوال - غير محدود");
    expect(merged.name).toBe("mounay");
    expect(result.ackSyncIds).toEqual(["sync-1"]);
    expect(result.messages).toHaveLength(1);
  });
});

describe("runSyncBatch - save must gate everything (round 8: no message/ack before an actual save)", () => {
  function fakeDeps(overrides: Partial<SyncBatchDeps> = {}): SyncBatchDeps & { alerts: string[] } {
    const alerts: string[] = [];
    return {
      isDemoMode: true,
      saveDemoAccounts: () => {},
      saveSyncedFieldsCache: () => {},
      showAlert: (message: string) => alerts.push(message),
      alerts,
      ...overrides,
    };
  }

  it("reports save-failed and shows ONLY the failure message when the save throws - never a success message", () => {
    const accounts = [baseAccount({ planName: "" })];
    const deps = fakeDeps({
      saveDemoAccounts: () => {
        throw new Error("localStorage full");
      },
    });

    const outcome = runSyncBatch(
      accounts,
      [{ syncId: "sync-1", accountId: "acc-1", fields: { planName: "التجوال - غير محدود" } }],
      new Set(),
      deps,
    );

    expect(outcome.status).toBe("save-failed");
    expect(deps.alerts).toHaveLength(1);
    expect(deps.alerts[0]).toContain("تعذر حفظ");
    expect(deps.alerts.some((m) => m.includes("تم تحديث"))).toBe(false);
  });

  it("only shows the success message and reports 'applied' once the save actually succeeds", () => {
    const accounts = [baseAccount({ planName: "" })];
    const deps = fakeDeps();

    const outcome = runSyncBatch(
      accounts,
      [{ syncId: "sync-1", accountId: "acc-1", fields: { planName: "التجوال - غير محدود" } }],
      new Set(),
      deps,
    );

    expect(outcome.status).toBe("applied");
    if (outcome.status === "applied") {
      expect(outcome.appliedSyncIds).toEqual(["sync-1"]);
      expect(outcome.accounts.find((a) => a.id === "acc-1")!.planName).toBe("التجوال - غير محدود");
    }
    expect(deps.alerts).toHaveLength(1);
    expect(deps.alerts[0]).not.toContain("تعذر حفظ");
  });

  it("routes the save through saveSyncedFieldsCache (never saveDemoAccounts) when not in demo mode", () => {
    const accounts = [baseAccount({ planName: "" })];
    const demoCalls: unknown[] = [];
    const cacheCalls: Array<{ accountId: string; fields: unknown }> = [];
    const deps = fakeDeps({
      isDemoMode: false,
      saveDemoAccounts: (a) => demoCalls.push(a),
      saveSyncedFieldsCache: (accountId, fields) => cacheCalls.push({ accountId, fields }),
    });

    const outcome = runSyncBatch(
      accounts,
      [{ syncId: "sync-1", accountId: "acc-1", fields: { planName: "خطة" } }],
      new Set(),
      deps,
    );

    expect(outcome.status).toBe("applied");
    expect(demoCalls).toHaveLength(0);
    expect(cacheCalls).toEqual([{ accountId: "acc-1", fields: { planName: "خطة" } }]);
  });

  it("reports 'nothing-to-apply' and shows no message when there is nothing new to sync", () => {
    const accounts = [baseAccount({ id: "acc-1" })];
    const deps = fakeDeps();

    const outcome = runSyncBatch(accounts, [], new Set(), deps);

    expect(outcome.status).toBe("nothing-to-apply");
    expect(deps.alerts).toEqual([]);
  });

  it("also reports 'nothing-to-apply' when every sync in the batch is already in alreadyProcessed", () => {
    const accounts = [baseAccount({ id: "acc-1" })];
    const deps = fakeDeps();

    const outcome = runSyncBatch(
      accounts,
      [{ syncId: "sync-1", accountId: "acc-1", fields: { planName: "خطة" } }],
      new Set(["sync-1"]),
      deps,
    );

    expect(outcome.status).toBe("nothing-to-apply");
    expect(deps.alerts).toEqual([]);
  });
});

describe("reapplyCachedSyncedFields", () => {
  it("merges cached fields onto a freshly-fetched account", () => {
    const fresh = [baseAccount({ id: "acc-1", planName: "" })];
    const result = reapplyCachedSyncedFields(fresh, (id) =>
      id === "acc-1" ? { planName: "التجوال - غير محدود" } : undefined,
    );

    expect(result[0].planName).toBe("التجوال - غير محدود");
  });

  it("leaves an account with nothing cached completely unchanged", () => {
    const fresh = [baseAccount({ id: "acc-1" })];
    const result = reapplyCachedSyncedFields(fresh, () => undefined);
    expect(result).toEqual(fresh);
  });

  it("only ever touches the specific account a cache entry belongs to", () => {
    const fresh = [baseAccount({ id: "acc-1", planName: "" }), baseAccount({ id: "acc-2", planName: "" })];
    const result = reapplyCachedSyncedFields(fresh, (id) => (id === "acc-1" ? { planName: "خطة" } : undefined));

    expect(result.find((a) => a.id === "acc-1")!.planName).toBe("خطة");
    expect(result.find((a) => a.id === "acc-2")!.planName).toBe("");
  });
});
