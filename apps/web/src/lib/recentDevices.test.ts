import { describe, expect, it } from "vitest";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import { lastTouched, recentDevices, touchDevice, touchedOn } from "./recentDevices";

// Fake data only.
const dev = (id: string, lastSuccessfulScanAt: string | null = null) => ({ id, lastSuccessfulScanAt });
const entry = (createdAt: string) => ({ id: createdAt, kind: "credit", amount: 1, currency: "MRU", date: createdAt.slice(0, 10), createdAt }) as unknown as LedgerEntry;

describe("🕘 آخر جهاز", () => {
  const ledger: LedgerByAccount = { b: [entry("2026-10-12T09:00:00.000Z")] };
  const log = touchDevice({}, "c", new Date("2026-10-12T11:00:00.000Z"));
  const accounts = [dev("a", "2026-10-12T10:00:00.000Z"), dev("b"), dev("c"), dev("never")];

  it("opened / edited, synced and a له/عليه all count - the latest wins", () => {
    expect(lastTouched(accounts[0]!, ledger, log)).toBe("2026-10-12T10:00:00.000Z");
    expect(lastTouched(accounts[1]!, ledger, log)).toBe("2026-10-12T09:00:00.000Z");
    expect(lastTouched(accounts[3]!, ledger, log)).toBe("");
    // a sync after the opening moves it on
    expect(lastTouched(dev("c", "2026-10-12T12:00:00.000Z"), ledger, log)).toBe("2026-10-12T12:00:00.000Z");
  });

  it("lists the touched devices newest first, never the untouched", () => {
    expect(recentDevices(accounts, ledger, log).map((a) => a.id)).toEqual(["c", "a", "b"]);
    expect(recentDevices(accounts, ledger, log, 1).map((a) => a.id)).toEqual(["c"]);
  });

  it("counts the devices touched on a day", () => {
    const day = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    expect(touchedOn(accounts, ledger, log, day("2026-10-12T11:00:00.000Z"))).toBeGreaterThanOrEqual(1);
    expect(touchedOn(accounts, ledger, log, "2020-01-01")).toBe(0);
  });

  it("keeps the log small - the oldest go first", () => {
    let big = {};
    for (let i = 0; i < 105; i++) big = touchDevice(big, `d${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)));
    expect(Object.keys(big)).toHaveLength(100);
    expect(big).not.toHaveProperty("d0");
    expect(big).toHaveProperty("d104");
  });
});
