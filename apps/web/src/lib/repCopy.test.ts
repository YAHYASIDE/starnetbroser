import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { demoAccounts } from "./demoData";
import { WrongPasswordError } from "./backupCrypto";
import {
  copyGaps,
  copyGapsText,
  copySnapshot,
  buildRepCopy,
  buildRepCopyFile,
  isOlderCopy,
  isRepCopyFile,
  NotARepCopyError,
  OtherPhoneError,
  readRepCopyFile,
  removedDeviceIds,
  summarizeRepDevice,
  withoutSessions,
} from "./repCopy";

// Fake devices/values only.
const base = demoAccounts[0]!;
const account = (id: string, extra: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary => ({ ...base, id, name: `جهاز ${id}`, ...extra });

const accounts = [
  account("a1", { representativeId: "r1", clientId: "c1" }),
  account("a2", { representativeId: "r1", deletedAt: "2026-09-01T00:00:00Z" }),
  account("a3", { representativeId: "r2" }),
  account("a4", { representativeId: "r1", archivedAt: "2026-09-01T00:00:00Z" }),
];
const ledger = { a1: [{ id: "e1", kind: "debit" as const, amount: 16000, currency: "MRU" as const, note: "", email: "", date: "2026-10-01", createdAt: "" }], a3: [] };

describe("rep copy", () => {
  const copy = buildRepCopy({
    repId: "r1",
    repName: "مندوب",
    commissionPercent: 50,
    accounts,
    ledger,
    clients: { c1: { name: "زبون", phone: "+000" } },
    rates: { MRU: 400 },
    now: new Date("2026-10-02T10:00:00Z"),
  });

  it("holds only the rep's live devices, with their operations and customer", () => {
    expect(copy.devices.map((d) => d.account.id)).toEqual(["a1"]);
    expect(copy.devices[0]).toMatchObject({ clientName: "زبون", clientPhone: "+000", entries: [{ id: "e1" }] });
    expect(copy.sentAt).toBe("2026-10-02T10:00:00.000Z");
  });

  it("encrypts with the rep's code - only that code opens it", async () => {
    const text = await buildRepCopyFile({ ...copy, sessions: { a1: { "https://starlink.com": "s=1" } } }, "AAAA-BBBB-CCCC");
    expect(isRepCopyFile(text)).toBe(true);
    expect(text).not.toContain("16000");
    const read = await readRepCopyFile(text, "AAAA-BBBB-CCCC");
    expect(read.sessions.a1).toEqual({ "https://starlink.com": "s=1" });
    expect(withoutSessions(read)).not.toHaveProperty("sessions");
    await expect(readRepCopyFile(text, "ZZZZ-BBBB-CCCC")).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(readRepCopyFile('{"kind":"starnet-rep-device"}', "AAAA-BBBB-CCCC")).rejects.toBeInstanceOf(NotARepCopyError);
  }, 20000);

  it("🔗 a copy bound to his phone opens only there - even with the file and the code", async () => {
    const phone = "P".repeat(24);
    const text = await buildRepCopyFile({ ...copy, sessions: {} }, "AAAA-BBBB-CCCC", phone);
    expect((await readRepCopyFile(text, "AAAA-BBBB-CCCC", phone)).repId).toBe(copy.repId);
    await expect(readRepCopyFile(text, "AAAA-BBBB-CCCC")).rejects.toBeInstanceOf(OtherPhoneError);
    await expect(readRepCopyFile(text, "AAAA-BBBB-CCCC", "Q".repeat(24))).rejects.toBeInstanceOf(OtherPhoneError);
  }, 20000);

  it("a new copy removes devices that are no longer his; an older copy is refused", () => {
    const next = { ...copy, devices: [], sentAt: "2026-10-03T10:00:00.000Z" };
    expect(removedDeviceIds(copy, next)).toEqual(["a1"]);
    expect(removedDeviceIds(null, next)).toEqual([]);
    expect(isOlderCopy(next, copy)).toBe(true);
    expect(isOlderCopy(copy, next)).toBe(false);
    expect(isOlderCopy(null, copy)).toBe(false);
  });
});

describe("rep device card figures", () => {
  it("adds the customer's debt, the profit and the rep's share", () => {
    const shipment = {
      id: "s1", kind: "debit" as const, amount: 16000, currency: "MRU" as const, note: "", email: "", date: "2026-10-01", createdAt: "",
      saleRate: { rateFromUsd: 400, usdValue: 40 },
      starlinkCost: { status: "settled" as const, currencyCode: "USD", amount: 30, paidAt: "2026-10-01" },
      profitCurrencyRates: { MRU: 400 },
      representativeId: "r1", representativeCommissionPercent: 50,
    };
    const pay = { id: "p1", kind: "credit" as const, amount: 6000, currency: "MRU" as const, note: "", email: "", date: "2026-10-02", createdAt: "" };
    const summary = summarizeRepDevice({ account: account("a1"), entries: [shipment, pay] }, 400);
    expect(summary.debt).toEqual({ MRU: 10000 });
    expect(summary.confirmedMru).toBe(4000);
    expect(summary.repShareMru).toBe(2000);
    expect(summary.expectedMru).toBe(0);
    expect(summary.rows.map((r) => r.entryId)).toEqual(["s1"]);
  });
});

describe("📋 is the rep's copy still current", () => {
  const dev = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: id, representativeId: "r1", ...extra }) as StarlinkAccountSummary;

  it("no copy recorded, or nothing changed: no warning", () => {
    const accounts = [dev("d1", { clientId: "c1" })];
    expect(copyGaps(undefined, accounts, "r1")).toBeNull();
    expect(copyGaps(copySnapshot(accounts, "r1"), accounts, "r1")).toBeNull();
  });

  it("counts devices given since, devices relinked, devices taken away", () => {
    const sent = copySnapshot([dev("d1"), dev("d2", { clientId: "c1" }), dev("d3")], "r1");
    const now = [dev("d1", { clientId: "c9" }), dev("d2", { clientId: "c1" }), dev("d3", { representativeId: "r2" }), dev("d4"), dev("d5", { archivedAt: "x" })];
    const gaps = copyGaps(sent, now, "r1");
    expect(gaps).toEqual({ missing: 1, relinked: 1, removed: 1 });
    expect(copyGapsText(gaps!)).toBe("⚠️ نسخته قديمة: 1 جهاز لم يصله · 1 تغيّر زبونه · 1 لم يعد له - أرسل نسخة جديدة");
  });
});
