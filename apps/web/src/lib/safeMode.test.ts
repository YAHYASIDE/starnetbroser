import { describe, expect, it } from "vitest";
import { BOOTS_WINDOW_MS, isAlwaysOn, nextBoots, partRunsIn, SAFE_MODE_BOOT_SCRIPT } from "./safeMode";

function phone(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  return { store, open: () => new Function("localStorage", SAFE_MODE_BOOT_SCRIPT)(localStorage) };
}

describe("🛟 الوضع الآمن (his Nov 18 / 25 / 26 2026)", () => {
  it("2 opens in a row within 3 minutes enter it; slower opens never do", () => {
    let b = nextBoots([], 1000);
    expect(b.safe).toBe(false);
    b = nextBoots(b.boots, 30_000);
    expect(b.safe).toBe(true);
    expect(nextBoots([0], BOOTS_WINDOW_MS + 61_000).safe).toBe(false);
  });

  it("his Nov 26 «أدخلني تلقائيًا»: the second unfinished open turns it on and says why, nothing the user started stays running", () => {
    const p = phone({ "starnet.safeAllowed": '["link"]' });
    p.open();
    expect(p.store.get("starnet.safeMode")).toBeUndefined();
    p.open();
    expect(p.store.get("starnet.safeMode")).toBe("1");
    expect(p.store.get("starnet.safeAuto")).toBe("1");
    expect(p.store.get("starnet.safeAllowed")).toBeUndefined();
  });

  it("an open that stayed up (counter cleared) is not counted with the next one", () => {
    const p = phone();
    p.open();
    p.store.delete("starnet.boots"); // markBootOk after 20 s
    p.open();
    expect(p.store.get("starnet.safeMode")).toBeUndefined();
  });

  it("never turns the safe mode OFF, and keeps the parts he started inside it when it is already on", () => {
    const p = phone({ "starnet.safeMode": "1", "starnet.safeAllowed": '["link"]' });
    p.open();
    p.open();
    p.open();
    expect(p.store.get("starnet.safeMode")).toBe("1");
    expect(p.store.get("starnet.safeAllowed")).toBe('["link"]');
    expect(p.store.get("starnet.safeAuto")).toBeUndefined();
  });

  it("a part runs only as he left it", () => {
    const base = { safe: false, ask: false, allowed: [] as string[], off: [] as string[] };
    expect(partRunsIn(base, "chat")).toBe(true);
    expect(partRunsIn({ ...base, off: ["chat"] }, "chat")).toBe(false);
    expect(partRunsIn({ ...base, off: ["chat"] }, "reps")).toBe(true);
    expect(partRunsIn({ ...base, safe: true }, "chat")).toBe(false);
    expect(partRunsIn({ ...base, safe: true, allowed: ["chat"] }, "chat")).toBe(true);
    expect(partRunsIn({ ...base, ask: true }, "chat")).toBe(false);
  });

  it("🔒 the bots and the team link always run - the safe mode, the question and a stopped list never touch them", () => {
    const base = { safe: false, ask: false, allowed: [] as string[], off: [] as string[] };
    for (const part of ["telegram", "link"]) {
      expect(isAlwaysOn(part)).toBe(true);
      expect(partRunsIn({ ...base, safe: true }, part)).toBe(true);
      expect(partRunsIn({ ...base, ask: true }, part)).toBe(true);
      expect(partRunsIn({ ...base, off: [part] }, part)).toBe(true);
    }
    expect(isAlwaysOn("chat")).toBe(false);
    expect(partRunsIn({ ...base, safe: true }, "chat")).toBe(false);
  });
});
