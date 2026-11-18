import { describe, expect, it } from "vitest";
import { BOOTS_WINDOW_MS, nextBoots, SAFE_MODE_BOOT_SCRIPT } from "./safeMode";

describe("🛟 الوضع الآمن (his Nov 18 2026 report)", () => {
  it("3 opens within 3 minutes start it; slower opens never do", () => {
    let b = nextBoots([], 1000);
    expect(b.safe).toBe(false);
    b = nextBoots(b.boots, 30_000);
    expect(b.safe).toBe(false);
    b = nextBoots(b.boots, 60_000);
    expect(b.safe).toBe(true);
    expect(nextBoots([0, 60_000], BOOTS_WINDOW_MS + 61_000).safe).toBe(false);
  });

  it("the first script of the page counts the same way", () => {
    const store = new Map<string, string>();
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const run = () => new Function("localStorage", SAFE_MODE_BOOT_SCRIPT)(localStorage);
    run();
    run();
    expect(store.get("starnet.safeMode")).toBeUndefined();
    run();
    expect(store.get("starnet.safeMode")).toBe("1");
  });
});
