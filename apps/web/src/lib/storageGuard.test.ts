import { describe, expect, it } from "vitest";
import { STORAGE_FULL_EVENT, formatChars, installStorageGuard, isQuotaError, measureStorage, storageKeyLabel } from "./storageGuard";

function fakeStorageClass(limit: number) {
  class FakeStorage {
    map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    key(i: number) {
      return Array.from(this.map.keys())[i] ?? null;
    }
    getItem(k: string) {
      return this.map.get(k) ?? null;
    }
    setItem(k: string, v: string) {
      if (v.length > limit) throw new DOMException("full", "QuotaExceededError");
      this.map.set(k, v);
    }
    removeItem(k: string) {
      this.map.delete(k);
    }
  }
  return FakeStorage;
}

describe("storageGuard", () => {
  it("recognises quota errors from different engines", () => {
    expect(isQuotaError(new DOMException("x", "QuotaExceededError"))).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error("other"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });

  it("announces a full storage and still throws, installing only once", () => {
    const FakeStorage = fakeStorageClass(3);
    const events: string[] = [];
    const target = {
      Storage: FakeStorage as unknown as typeof Storage,
      dispatchEvent: (e: Event) => {
        events.push(`${e.type}:${(e as CustomEvent).detail.key}`);
        return true;
      },
    };
    expect(installStorageGuard(target)).toBe(true);
    expect(installStorageGuard(target)).toBe(false);
    const storage = new FakeStorage();
    storage.setItem("a", "ok");
    expect(storage.getItem("a")).toBe("ok");
    expect(() => storage.setItem("b", "too long")).toThrow();
    expect(events).toEqual([`${STORAGE_FULL_EVENT}:b`]);
  });

  it("does nothing without a Storage (server render)", () => {
    expect(installStorageGuard({})).toBe(false);
  });

  it("measures usage largest-first and grades it", () => {
    const FakeStorage = fakeStorageClass(Infinity);
    const storage = new FakeStorage();
    storage.setItem("small", "x");
    storage.setItem("big", "y".repeat(70));
    const usage = measureStorage(storage, 100);
    expect(usage.usedChars).toBe(5 + 1 + 3 + 70);
    expect(usage.keys.map((k) => k.key)).toEqual(["big", "small"]);
    expect(usage.level).toBe("ok");
    storage.setItem("more", "z".repeat(10));
    expect(measureStorage(storage, 100).level).toBe("warn");
    storage.setItem("most", "z".repeat(20));
    expect(measureStorage(storage, 100).level).toBe("full");
  });

  it("labels known keys in Arabic and formats sizes", () => {
    expect(storageKeyLabel("starnet_customer_ledger_v1")).toBe("عمليات الأجهزة");
    expect(storageKeyLabel("starnet.theme")).toBe("starnet.theme");
    expect(formatChars(1_250_000)).toBe("1.3 مليون حرف");
    expect(formatChars(850_400)).toBe("850 ألف حرف");
    expect(formatChars(12)).toBe("12 حرف");
  });
});
