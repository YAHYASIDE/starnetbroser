import { starlinkLoginFor } from "./localBrowser";
import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import {
  summarizeSyncMessages,
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

  it("records a limited-access email and clears it once the full menu is seen", () => {
    const flagged = mergeSyncedFields(baseAccount(), { limitedAccess: true });
    expect(flagged.account.limitedAccess).toBe(true);
    expect(flagged.updatedFields.map((f) => f.field)).toEqual(["limitedAccess"]);
    expect(mergeSyncedFields(flagged.account, { limitedAccess: false }).account.limitedAccess).toBe(false);
    expect(mergeSyncedFields(flagged.account, { planName: "x" }).account.limitedAccess).toBe(true);
    // «إزالة العطل» on it lasts while the flag holds, and is forgotten once Starlink reads it cleared.
    const dismissed = { ...flagged.account, faultDismissed: ["secondary" as const] };
    expect(mergeSyncedFields(dismissed, { planName: "x" }).account.faultDismissed).toEqual(["secondary"]);
    expect(mergeSyncedFields(dismissed, { limitedAccess: false }).account.faultDismissed).toBeNull();
  });

  it("clears a false-positive limitedAccess when the login email is Admin in Settings → Users", () => {
    // The icon-rail billing heuristic flagged an admin email as "غير رئيسي" because billing didn't
    // load that moment (the operator's confirmed complaint). The Settings page then reads the Users
    // table: the login email carries the Admin role, so it IS primary - the flag is cleared.
    const flagged = mergeSyncedFields(
      baseAccount({ expectedEmail: "dedesidival868@outlook.com" }),
      { limitedAccess: true },
    );
    expect(flagged.account.limitedAccess).toBe(true);
    const cleared = mergeSyncedFields(flagged.account, { adminEmails: ["dedesidival868@…"] });
    expect(cleared.account.limitedAccess).toBe(false);
    expect(cleared.updatedFields.map((f) => f.field)).toEqual(["adminEmails"]);
  });

  it("does NOT clear limitedAccess when only a DIFFERENT email is Admin (a genuine limited user)", () => {
    const flagged = mergeSyncedFields(
      baseAccount({ expectedEmail: "mylimited@mail.com" }),
      { limitedAccess: true },
    );
    const still = mergeSyncedFields(flagged.account, { adminEmails: ["someoneelse@mail.com"] });
    expect(still.account.limitedAccess).toBe(true);
    expect(still.updatedFields).toEqual([]);
  });

  it("raises the 'غير رئيسي' warning from the Users table when the login email is NOT an Admin", () => {
    // The Settings → Users page is the only thing that sets this now: a login email that carries
    // no Admin role there is a real secondary/limited email and gets flagged, even if it never had
    // the flag before.
    const result = mergeSyncedFields(
      baseAccount({ expectedEmail: "mylimited@mail.com" }),
      { adminEmails: ["theowner@mail.com"] },
    );
    expect(result.account.limitedAccess).toBe(true);
    expect(result.updatedFields.map((f) => f.field)).toEqual(["adminEmails"]);
  });

  it("records the two subscriptions on one account and reports them as changed only when they differ", () => {
    const first = mergeSyncedFields(baseAccount(), { subscriptionNames: ["DEDE SIDI VAL", "ARAWANI DI"] });
    expect(first.account.subscriptions).toEqual(["DEDE SIDI VAL", "ARAWANI DI"]);
    expect(first.updatedFields.map((f) => f.field)).toEqual(["subscriptionNames"]);
    // Re-reading the same list is a confirming scan, not a change.
    const again = mergeSyncedFields(first.account, { subscriptionNames: ["DEDE SIDI VAL", "ARAWANI DI"] });
    expect(again.updatedFields).toEqual([]);
    expect(again.scanned).toBe(true);
  });

  it("sets and clears priorityDataExhausted explicitly", () => {
    const out = mergeSyncedFields(baseAccount(), { priorityDataExhausted: true });
    expect(out.account.priorityDataExhausted).toBe(true);
    expect(out.updatedFields.map((f) => f.field)).toEqual(["priorityDataExhausted"]);
    expect(mergeSyncedFields(out.account, { priorityDataExhausted: false }).account.priorityDataExhausted).toBe(false);
  });

  it("🔐 a password that got in after the saved one was refused becomes the device's Starlink password", () => {
    const result = mergeSyncedFields({ ...baseAccount(), wifiPassword: "demo-old" }, { loginPassword: " demo-new " });
    expect(result.account.starlinkPassword).toBe("demo-new");
    expect(result.account.wifiPassword).toBe("demo-old"); // the Wi-Fi code itself is never touched
    expect(result.updatedFields.map((f) => f.field)).toEqual(["loginPassword"]);
    expect(starlinkLoginFor(result.account).loginPassword).toBe("demo-new");
  });

  it("🚗 movingRestricted: set true, then cleared by an explicit false (he stopped)", () => {
    const moving = mergeSyncedFields(baseAccount(), { movingRestricted: true });
    expect(moving.account.movingRestricted).toBe(true);
    expect(moving.updatedFields.map((f) => f.field)).toEqual(["movingRestricted"]);
    expect(mergeSyncedFields(moving.account, { movingRestricted: false }).account.movingRestricted).toBe(false);
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

describe("mergeSyncedFields - the card that pays the device", () => {
  it("takes the Billing page's card (last 4 digits), replacing one picked by hand", () => {
    const result = mergeSyncedFields(baseAccount({ paymentCardLast4: "1111" }), { paymentCardLast4: "4321" });
    expect(result.account.paymentCardLast4).toBe("4321");
    expect(result.updatedFields.map((f) => f.field)).toContain("paymentCardLast4");
    expect(mergeSyncedFields(baseAccount({ paymentCardLast4: "1111" }), { paymentCardLast4: "12" }).account.paymentCardLast4).toBe("1111");
  });
});

describe("mergeSyncedFields - the dish's alerts", () => {
  it("keeps the latest list, and an empty list clears alerts that are gone", () => {
    const withAlerts = mergeSyncedFields(baseAccount(), { dishAlerts: ["Starlink is partially obstructed."] });
    expect(withAlerts.account.dishAlerts).toEqual(["Starlink is partially obstructed."]);
    expect(withAlerts.updatedFields.map((f) => f.field)).toContain("dishAlerts");
    expect(mergeSyncedFields(withAlerts.account, { dishAlerts: [] }).account.dishAlerts).toEqual([]);
    expect(mergeSyncedFields(withAlerts.account, { planName: "x" }).account.dishAlerts).toEqual(["Starlink is partially obstructed."]);
  });
});

describe("mergeSyncedFields - Starlink's billing day is 1-28", () => {
  it("never stores a 29th-31st renewal date", () => {
    const account = baseAccount({ rechargeDate: "2026/10/24" });
    expect(mergeSyncedFields(account, { renewalDate: "2026/10/31" }).account.rechargeDate).toBe("2026/10/24");
    expect(mergeSyncedFields(account, { renewalDate: "2026/11/07" }).account.rechargeDate).toBe("2026/11/07");
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

describe("summarizeSyncMessages", () => {
  const msg = (name: string, updatedCount: number, scanned = true) => ({ accountId: name, message: "", accountName: name, updatedCount, scanned });

  it("shows one short line per batch, never one per device", () => {
    expect(summarizeSyncMessages([])).toBeNull();
    expect(summarizeSyncMessages([msg("منزل", 3)])).toBe('✓ تم تحديث "منزل" من Starlink (3 حقول)');
    expect(summarizeSyncMessages([msg("منزل", 1)])).toBe('✓ تم تحديث "منزل" من Starlink (1 حقل)');
    expect(summarizeSyncMessages([msg("منزل", 0)])).toBe('✓ "منزل" محدَّث - لا تغييرات');
    expect(summarizeSyncMessages([msg("أ", 2), msg("ب", 0), msg("ج", 1)])).toBe("✓ تم تحديث 2 من 3 أجهزة من Starlink");
    expect(summarizeSyncMessages([msg("أ", 0), msg("ب", 0)])).toBe("✓ تم فحص 2 أجهزة - لا تغييرات");
  });
});

describe("🛂 travel registration merge", () => {
  it("a Home read with the banner marks the device, and one without clears it", () => {
    const marked = mergeSyncedFields(baseAccount(), { travelRegistrationRequired: true, travelRegistrationDue: "October 15" }).account;
    expect(marked).toMatchObject({ travelRegistrationRequired: true, travelRegistrationDue: "October 15" });
    const cleared = mergeSyncedFields(marked, { travelRegistrationRequired: false }).account;
    expect(cleared.travelRegistrationRequired).toBe(false);
    expect(cleared.travelRegistrationDue).toBeUndefined();
    // ✅ confirmed registered - into «تم توثيقها», with the deadline it was for
    expect(cleared.travelRegistrationVerifiedAt).toBeTruthy();
    expect(cleared.travelRegistrationVerifiedDue).toBe("October 15");
    // a device that never had the banner is not "registered"
    expect(mergeSyncedFields(baseAccount(), { travelRegistrationRequired: false }).account.travelRegistrationVerifiedAt).toBeUndefined();
  });

  it("a «كشف توثيق» read (checkOnly) changes nothing but the notice - not even the sync time", () => {
    const before = baseAccount({ serviceStatus: "active" });
    const { account } = mergeSyncedFields(before, {
      checkOnly: true,
      serviceStatus: "suspended",
      balanceDue: "99.00",
      dishStatus: "offline",
      travelRegistrationRequired: true,
      travelRegistrationDue: "October 15",
    });
    expect(account).toEqual({ ...before, travelRegistrationRequired: true, travelRegistrationDue: "October 15" });
  });
});
