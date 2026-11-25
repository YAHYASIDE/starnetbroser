import { describe, expect, it } from "vitest";
import { BOOTS_WINDOW_MS, nextBoots, partRunsIn, SAFE_MODE_BOOT_SCRIPT } from "./safeMode";

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
    // his Nov 25 2026 «لا تفعل إلا بإذن مني»: it only asks - never turns itself on
    expect(store.get("starnet.safeMode")).toBeUndefined();
    expect(store.get("starnet.safeAsk")).toBe("1");
  });

  it("never touches what he chose: safe mode on stays on, his started parts stay started", () => {
    const store = new Map<string, string>([["starnet.safeMode", "1"], ["starnet.safeAllowed", '["link"]']]);
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const run = () => new Function("localStorage", SAFE_MODE_BOOT_SCRIPT)(localStorage);
    run();
    run();
    run();
    run();
    expect(store.get("starnet.safeMode")).toBe("1");
    expect(store.get("starnet.safeAllowed")).toBe('["link"]');
    expect(store.get("starnet.safeAsk")).toBeUndefined();
  });

  it("a part runs only as he left it", () => {
    const base = { safe: false, ask: false, allowed: [] as string[], off: [] as string[] };
    expect(partRunsIn(base, "link")).toBe(true);
    expect(partRunsIn({ ...base, off: ["link"] }, "link")).toBe(false);
    expect(partRunsIn({ ...base, off: ["link"] }, "chat")).toBe(true);
    // safe mode: only what he started inside it
    expect(partRunsIn({ ...base, safe: true }, "link")).toBe(false);
    expect(partRunsIn({ ...base, safe: true, allowed: ["link"] }, "link")).toBe(true);
    // waiting for his answer: nothing starts
    expect(partRunsIn({ ...base, ask: true }, "link")).toBe(false);
  });
});
