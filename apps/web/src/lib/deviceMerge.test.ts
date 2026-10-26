import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { deviceTwins, mergeDevices, replaceWithNew } from "./deviceMerge";
import { deviceFingerprint, findDeviceDuplicates, knownDevicesOf } from "./duplicates";
import type { LedgerEntry } from "./ledgerStore";

// Fake devices only.
const dev = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `DEMO ${id}`, kitNumber: "", ...extra }) as StarlinkAccountSummary;
const entry = (id: string) => ({ id, kind: "credit", amount: 100, currency: "MRU", date: "2026-10-04" }) as LedgerEntry;

describe("device twins (same email or KIT)", () => {
  it("finds the twin of each active device; deleted / archived ones don't count", () => {
    const a = dev("a", { expectedEmail: "Demo@Example.com" });
    const b = dev("b", { expectedEmail: "demo@example.com", representativeId: "r1" });
    const c = dev("c", { kitNumber: "KIT-1234-5678" });
    const d = dev("d", { kitNumber: "kit12345678" });
    const e = dev("e", { expectedEmail: "demo@example.com", deletedAt: "2026-10-01" });
    const twins = deviceTwins([a, b, c, d, e]);
    expect(twins.get("a")?.id).toBe("b");
    expect(twins.get("b")?.id).toBe("a");
    expect(twins.get("c")?.id).toBe("d");
    expect(twins.has("e")).toBe(false);
  });
});

describe("mergeDevices", () => {
  it("moves the operations, allocations and previous debts, and fills what the kept one lacks", () => {
    const keep = dev("keep", { expectedEmail: "demo@example.com", phone: "40000000" });
    const drop = dev("drop", { expectedEmail: "demo@example.com", phone: "49999999", clientId: "c1", representativeId: "r1", wifiPassword: "x" });
    const result = mergeDevices({
      keep,
      drop,
      ledger: { keep: [entry("k1")], drop: [entry("d1"), entry("d2")], other: [entry("o1")] },
      allocations: { drop: [{ id: "al", paymentEntryId: "d1", shipmentEntryId: "d2", amount: 100, currency: "MRU", createdAt: "x" }] },
      previousDebts: [{ id: "p1", accountId: "drop", date: "2026-10-01", amountUsd: 10, createdAt: "x" }],
    });
    expect(result.keepPatch).toEqual({ clientId: "c1", representativeId: "r1", wifiPassword: "x" });
    expect(result.ledger.keep!.map((x) => x.id)).toEqual(["k1", "d1", "d2"]);
    expect(result.ledger.drop).toBeUndefined();
    expect(result.ledger.other).toHaveLength(1);
    expect(result.allocations.keep).toHaveLength(1);
    expect(result.allocations.drop).toBeUndefined();
    expect(result.previousDebts[0]!.accountId).toBe("keep");
    expect(result.movedEntries).toBe(2);
  });
});

describe("the rep's app knows the operator's devices by fingerprint only", () => {
  it("warns on an email / KIT the operator has, never shows it, skips the rep's own devices", () => {
    const owner = [dev("o1", { expectedEmail: "owner@example.com", kitNumber: "KIT11112222" }), dev("mine", { expectedEmail: "mine@example.com" })];
    const known = knownDevicesOf(owner, new Set(["mine"]));
    expect(JSON.stringify(known)).not.toContain("owner@example.com");
    expect(known.emails).toContain(deviceFingerprint("owner@example.com"));
    expect(known.emails).not.toContain(deviceFingerprint("mine@example.com"));
    const hits = findDeviceDuplicates({ name: "X", expectedEmail: "OWNER@example.com " }, [], known);
    expect(hits).toEqual([{ field: "email", owner: "المسؤول", kind: "owner" }]);
    expect(findDeviceDuplicates({ name: "X", kitNumber: "kit-1111-2222" }, [], known).map((h) => h.field)).toEqual(["kit"]);
    expect(findDeviceDuplicates({ name: "X", expectedEmail: "new@example.com" }, [], known)).toEqual([]);
  });
});

describe("replaceWithNew (his Oct 26 2026 ask «اجعل الربط يضيف الجديد بدل القديم»)", () => {
  it("the rep's new device stays with the old one's records and customer; the old goes to the trash", () => {
    const old = dev("old", { expectedEmail: "demo@example.com", clientId: "c1", wifiPassword: "w" });
    const fresh = dev("new", { expectedEmail: "demo@example.com", representativeId: "r9", name: "DEMO rep name" });
    const other = dev("other");
    const result = replaceWithNew({
      accounts: [old, fresh, other],
      newId: "new",
      oldId: "old",
      repId: "r1",
      ledger: { old: [entry("o1"), entry("o2")], new: [entry("n1")] },
      allocations: {},
      previousDebts: [{ id: "p1", accountId: "old", date: "2026-10-01", amountUsd: 10, createdAt: "x" }],
      at: "2026-10-26T10:00:00.000Z",
    })!;
    const byId = Object.fromEntries(result.accounts.map((a) => [a.id, a]));
    expect(byId.new).toMatchObject({ name: "DEMO rep name", clientId: "c1", wifiPassword: "w", representativeId: "r1" });
    expect(byId.new!.deletedAt).toBeUndefined();
    expect(byId.old!.deletedAt).toBe("2026-10-26T10:00:00.000Z");
    expect(byId.other).toBe(other);
    expect(result.ledger.new!.map((x) => x.id)).toEqual(["n1", "o1", "o2"]);
    expect(result.ledger.old).toBeUndefined();
    expect(result.previousDebts[0]!.accountId).toBe("new");
    expect(result.movedEntries).toBe(2);
  });

  it("nothing when a device is missing or both are the same", () => {
    const base = { ledger: {}, allocations: {}, previousDebts: [], repId: "r1", at: "x" };
    expect(replaceWithNew({ ...base, accounts: [dev("a")], newId: "a", oldId: "gone" })).toBeNull();
    expect(replaceWithNew({ ...base, accounts: [dev("a")], newId: "a", oldId: "a" })).toBeNull();
  });
});
