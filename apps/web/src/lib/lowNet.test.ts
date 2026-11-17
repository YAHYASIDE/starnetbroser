import { afterEach, describe, expect, it, vi } from "vitest";
import { looksWeak, lowNetOn, requestLimitMs, setLowNet, timedFetch } from "./lowNet";

describe("📶 وضع الإنترنت الضعيف (his Nov 17 2026 ask)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("the button is on or off, remembered on the phone", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
      dispatchEvent: () => true,
    });
    expect(lowNetOn()).toBe(false);
    setLowNet(true);
    expect(lowNetOn()).toBe(true);
    setLowNet(false);
    expect(lowNetOn()).toBe(false);
  });

  it("a weak connection by what the phone reports", () => {
    expect(looksWeak({ effectiveType: "2g" })).toBe(true);
    expect(looksWeak({ effectiveType: "4g", rtt: 1200 })).toBe(true);
    expect(looksWeak({ effectiveType: "4g", downlink: 0.2 })).toBe(true);
    expect(looksWeak({ effectiveType: "4g", downlink: 8, rtt: 80 })).toBe(false);
    expect(looksWeak(undefined)).toBe(false);
    expect(requestLimitMs(true)).toBeGreaterThan(requestLimitMs(false));
  });

  it("every request carries a time limit", async () => {
    const seen: (RequestInit | undefined)[] = [];
    vi.stubGlobal("fetch", (_u: unknown, init?: RequestInit) => {
      seen.push(init);
      return Promise.resolve(new Response("ok"));
    });
    await timedFetch("https://example.com/x", { method: "POST" });
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});
