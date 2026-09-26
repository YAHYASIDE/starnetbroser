// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getCachedSyncedFields, saveSyncedFieldsCache } from "./syncedFieldsCache";

describe("syncedFieldsCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns undefined for an account that was never cached", () => {
    expect(getCachedSyncedFields("acc-1")).toBeUndefined();
  });

  it("returns exactly what was saved for that account", () => {
    saveSyncedFieldsCache("acc-1", { planName: "التجوال - غير محدود" });
    expect(getCachedSyncedFields("acc-1")).toEqual({ planName: "التجوال - غير محدود" });
  });

  it("merges a later save into an earlier one instead of overwriting it (Devices, then Billing, ...)", () => {
    saveSyncedFieldsCache("acc-1", { dishStatus: "online" });
    saveSyncedFieldsCache("acc-1", { balanceDue: "0.00", currency: "USD" });

    expect(getCachedSyncedFields("acc-1")).toEqual({
      dishStatus: "online",
      balanceDue: "0.00",
      currency: "USD",
    });
  });

  it("keeps different accounts' caches independent", () => {
    saveSyncedFieldsCache("acc-1", { planName: "خطة أولى" });
    saveSyncedFieldsCache("acc-2", { planName: "خطة ثانية" });

    expect(getCachedSyncedFields("acc-1")).toEqual({ planName: "خطة أولى" });
    expect(getCachedSyncedFields("acc-2")).toEqual({ planName: "خطة ثانية" });
  });
});
