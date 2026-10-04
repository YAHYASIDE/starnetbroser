import { describe, expect, it } from "vitest";
import {
  applyRepChangeSet,
  changeSetOf,
  describeItems,
  isItemDecided,
  listRepChangeItems,
  recordHash,
  rejectedVersions,
  withDecision,
  buildRepChangeSet,
  buildRepChangesFile,
  countRepChanges,
  describeRepChanges,
  isRepChangesFileName,
  newDeviceIds,
  readRepChangesFile,
  repChangesFileName,
  repChangesFileRep,
} from "./repChanges";
import { ACCOUNTS_KEY, CLIENTS_KEY, LEDGER_KEY, PROMISES_KEY } from "./repWorkspace";

// Fake data only.
const entry = (id: string, kind: "credit" | "debit", amount: number) => ({ id, kind, amount, currency: "MRU", date: "2026-10-01" });

function base() {
  return {
    [ACCOUNTS_KEY]: [
      { id: "a1", name: "Dish 1", representativeId: "r1", clientId: "c1", lastSuccessfulScanAt: "2026-10-01T08:00:00Z", serviceStatus: "active" },
    ],
    [LEDGER_KEY]: { a1: [entry("e1", "debit", 12000)] },
    [CLIENTS_KEY]: { c1: { id: "c1", name: "Client One" } },
    [PROMISES_KEY]: [],
  };
}

describe("rep changes (rep side)", () => {
  it("collects what the rep recorded since his copy - not the device's own Starlink reads", () => {
    const b = base();
    const current = {
      ...b,
      [ACCOUNTS_KEY]: [
        { ...b[ACCOUNTS_KEY][0]!, lastSuccessfulScanAt: "2026-10-02T08:00:00Z", serviceStatus: "suspended" },
        { id: "a2", name: "Dish 2", representativeId: "r1", clientId: "c2" },
      ],
      [LEDGER_KEY]: { a1: [entry("e1", "debit", 12000), entry("p1", "credit", 5000)] },
      [CLIENTS_KEY]: { ...b[CLIENTS_KEY], c2: { id: "c2", name: "Client Two" } },
    };
    const changes = buildRepChangeSet(current, b);
    expect(Object.keys(changes[ACCOUNTS_KEY]!.set)).toEqual(["a2"]);
    expect(Object.keys(changes[LEDGER_KEY]!.set)).toEqual(["a1/p1"]);
    expect(Object.keys(changes[CLIENTS_KEY]!.set)).toEqual(["c2"]);
    expect(countRepChanges(changes)).toBe(3);
    expect(newDeviceIds(changes, b)).toEqual(["a2"]);
    expect(buildRepChangeSet(b, b)).toEqual({});
  });
});

describe("rep changes (operator side, applied directly)", () => {
  function ownerStores() {
    return {
      [ACCOUNTS_KEY]: [
        { id: "a1", name: "Dish 1", representativeId: "r1", clientId: "c1", lastSuccessfulScanAt: "2026-10-03T08:00:00Z", serviceStatus: "active" },
        { id: "x1", name: "Mine", clientId: "c9" },
        { id: "o1", name: "Other rep", representativeId: "r2", clientId: "c8" },
      ],
      [LEDGER_KEY]: { a1: [entry("e1", "debit", 12000)], x1: [entry("m1", "debit", 9000)] },
      [CLIENTS_KEY]: { c1: { id: "c1", name: "Client One" }, c9: { id: "c9", name: "Mine" }, c8: { id: "c8", name: "Other" } },
      [PROMISES_KEY]: [],
    };
  }

  it("adds his new device, customer and payment; a payment is held by the rep, never in the till", () => {
    const changes = {
      [ACCOUNTS_KEY]: { set: { a2: { id: "a2", name: "Dish 2", clientId: "c2" } }, removed: [] },
      [CLIENTS_KEY]: { set: { c2: { id: "c2", name: "Client Two" } }, removed: [] },
      [LEDGER_KEY]: { set: { "a1/p1": entry("p1", "credit", 5000), "a2/s1": entry("s1", "debit", 12000) }, removed: [] },
    };
    const { stores, summary, newDeviceIds: created } = applyRepChangeSet(ownerStores(), changes, "r1");
    const accounts = stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>;
    expect(accounts.find((a) => a.id === "a2")).toMatchObject({ representativeId: "r1", clientId: "c2" });
    expect(accounts).toHaveLength(4);
    const ledger = stores[LEDGER_KEY] as Record<string, Array<Record<string, unknown>>>;
    expect(ledger.a1!.find((e) => e.id === "p1")).toMatchObject({ heldByRepId: "r1" });
    expect(ledger.a2!.map((e) => e.id)).toEqual(["s1"]);
    expect(ledger.x1).toHaveLength(1);
    expect((stores[CLIENTS_KEY] as Record<string, unknown>).c2).toBeTruthy();
    expect(created).toEqual(["a2"]);
    expect(summary).toMatchObject({ newDevices: 1, payments: 1, shipments: 1, newClients: 1, refused: 0 });
    expect(describeRepChanges(summary)).toContain("💵 1 دفعة");
  });

  it("keeps the operator's fresher Starlink read on a device the rep edited", () => {
    const changes = {
      [ACCOUNTS_KEY]: {
        set: { a1: { id: "a1", name: "Dish 1 (roof)", representativeId: "r1", clientId: "c1", lastSuccessfulScanAt: "2026-10-01T08:00:00Z", serviceStatus: "suspended" } },
        removed: [],
      },
    };
    const { stores } = applyRepChangeSet(ownerStores(), changes, "r1");
    const a1 = (stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>).find((a) => a.id === "a1");
    expect(a1).toMatchObject({ name: "Dish 1 (roof)", serviceStatus: "active" });
  });

  it("never touches anything outside his scope, and never deletes a device or a customer", () => {
    const changes = {
      [ACCOUNTS_KEY]: {
        set: { x1: { id: "x1", name: "Hijacked" }, o1: { id: "o1", name: "Hijacked", representativeId: "r1" }, a1: { id: "a1", name: "Dish 1", representativeId: "r2", deletedAt: "2026-10-02" } },
        removed: ["a1"],
      },
      [LEDGER_KEY]: { set: { "x1/z1": entry("z1", "credit", 1) }, removed: ["x1/m1", "a1/e1"] },
      [CLIENTS_KEY]: { set: { c9: { id: "c9", name: "Hijacked" } }, removed: ["c1"] },
    };
    const owner = ownerStores();
    const { stores, summary } = applyRepChangeSet(owner, changes, "r1");
    const accounts = stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>;
    expect(accounts.find((a) => a.id === "x1")!.name).toBe("Mine");
    expect(accounts.find((a) => a.id === "o1")!.representativeId).toBe("r2");
    // He can't hand his device to someone else or delete it from here.
    expect(accounts.find((a) => a.id === "a1")).toMatchObject({ representativeId: "r1" });
    expect(accounts.find((a) => a.id === "a1")!.deletedAt).toBeUndefined();
    const ledger = stores[LEDGER_KEY] as Record<string, unknown[]>;
    expect(ledger.x1).toHaveLength(1);
    expect(ledger.a1).toHaveLength(0); // his own operation, deleted by him
    expect(stores[CLIENTS_KEY]).toBeUndefined();
    expect(summary.refused).toBe(7);
    expect(summary.removedEntries).toBe(1);
  });

  it("a promise he added is tagged with him", () => {
    const changes = { [PROMISES_KEY]: { set: { pr1: { id: "pr1", clientId: "c1", amount: 3000 } }, removed: [] } };
    const { stores } = applyRepChangeSet(ownerStores(), changes, "r1");
    expect(stores[PROMISES_KEY]).toEqual([{ id: "pr1", clientId: "c1", amount: 3000, repId: "r1" }]);
  });
});

describe("rep changes file", () => {
  it("round-trips with the rep's code, names itself, and says whose it is", async () => {
    const payload = { id: "f1", repId: "r1", sentAt: "2026-10-02T10:00:00Z", changes: { [CLIENTS_KEY]: { set: {}, removed: [] } }, sessions: {} };
    const text = await buildRepChangesFile(payload, "AAAA-BBBB-CCCC");
    expect(repChangesFileRep(text)).toBe("r1");
    expect(await readRepChangesFile(text, "AAAA-BBBB-CCCC")).toEqual(payload);
    await expect(readRepChangesFile(text, "DDDD-EEEE-FFFF")).rejects.toThrow();
    expect(repChangesFileRep("{}")).toBeNull();
    const name = repChangesFileName("r-1", new Date(1000));
    expect(name).toBe("starnet-changes-r1-1000.json");
    expect(isRepChangesFileName(name)).toBe(true);
    expect(isRepChangesFileName("starnet-device-ab.json")).toBe(false);
  });
});

describe("reviewing a rep's recordings item by item", () => {
  const owner = () => ({
    [ACCOUNTS_KEY]: [{ id: "a1", name: "Dish 1", representativeId: "r1", clientId: "c1" }],
    [LEDGER_KEY]: { a1: [entry("e1", "debit", 12000)] },
    [CLIENTS_KEY]: { c1: { id: "c1", name: "Client One" } },
  });
  const changes = {
    [ACCOUNTS_KEY]: { set: { a2: { id: "a2", name: "Dish 2", clientId: "c2", expectedEmail: "fake@example.com" } }, removed: [] },
    [CLIENTS_KEY]: { set: { c2: { id: "c2", name: "Client Two" }, c3: { id: "c3", name: "Client Three" } }, removed: [] },
    [LEDGER_KEY]: { set: { "a2/s1": entry("s1", "debit", 12000), "a1/p1": entry("p1", "credit", 5000) }, removed: ["a1/e1"] },
    [PROMISES_KEY]: { set: { pr1: { id: "pr1", clientId: "c1", amount: 3000, currency: "MRU" } }, removed: [] },
  };

  it("a new device carries its new customer and its operations; the rest are their own items", () => {
    const items = listRepChangeItems(changes, owner());
    expect(items.map((i) => i.kind)).toEqual(["newDevice", "payment", "entryRemove", "newClient", "other"]);
    const device = items[0]!;
    expect(device.parts.map((p) => `${p.store}|${p.path}`)).toEqual([`${ACCOUNTS_KEY}|a2`, `${CLIENTS_KEY}|c2`, `${LEDGER_KEY}|a2/s1`]);
    expect(device.detail).toContain("Client Two");
    expect(items[1]).toMatchObject({ title: "💵 دفعة · Dish 1", amount: { value: 5000, currency: "MRU" } });
  });

  it("applies only the approved items, and remembers each decision for that exact version", () => {
    const items = listRepChangeItems(changes, owner());
    const approved = items.filter((i) => i.kind === "newDevice" || i.kind === "payment");
    const subset = changeSetOf(changes, approved);
    expect(Object.keys(subset[LEDGER_KEY]!.set).sort()).toEqual(["a1/p1", "a2/s1"]);
    expect(subset[LEDGER_KEY]!.removed).toEqual([]);
    const { stores } = applyRepChangeSet(owner(), subset, "r1", new Date("2026-10-02T10:00:00Z"));
    const a2 = (stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>).find((a) => a.id === "a2");
    expect(a2).toMatchObject({ addedByRepId: "r1", addedByRepAt: "2026-10-02T10:00:00.000Z" });
    expect((stores[LEDGER_KEY] as Record<string, unknown[]>).a1).toHaveLength(2); // e1 kept: its removal wasn't approved

    let decisions = withDecision({}, approved, "approved");
    decisions = withDecision(decisions, items.filter((i) => i.kind === "newClient"), "rejected");
    const left = items.filter((i) => !isItemDecided(i, decisions));
    expect(left.map((i) => i.kind)).toEqual(["entryRemove", "other"]);
    expect(rejectedVersions(decisions)).toEqual({ [`${CLIENTS_KEY}|c3`]: recordHash(changes[CLIENTS_KEY].set.c3) });
    expect(describeItems(approved)).toBe("📡 جهاز جديد 1 · 💵 دفعة 1");

    // He edits the rejected customer again: it comes back for review.
    const edited = { ...changes, [CLIENTS_KEY]: { set: { c3: { id: "c3", name: "Client 3 (fixed)" } }, removed: [] } };
    expect(listRepChangeItems(edited, owner()).filter((i) => !isItemDecided(i, decisions)).map((i) => i.key)).toContain("cli:c3");
  });
});

describe("rep's own customers: everything on the rep", () => {
  const owner = () => ({
    [ACCOUNTS_KEY]: [{ id: "a1", name: "Dish 1", representativeId: "r1", clientId: "c1" }],
    [LEDGER_KEY]: { a1: [entry("e1", "debit", 12000)] },
    [CLIENTS_KEY]: { c1: { id: "c1", name: "Client One", repSegments: [{ repId: "r1", from: "2026-09-01T00:00:00.000Z", carry: true }] } },
  });

  it("a payment he took from his own customer goes into his book - never less on his debt to us", () => {
    const changes = { [LEDGER_KEY]: { set: { "a1/p1": { ...entry("p1", "credit", 5000), createdAt: "2026-10-02T09:00:00.000Z" } }, removed: [] } };
    const { stores, summary } = applyRepChangeSet(owner(), changes, "r1");
    expect(stores[LEDGER_KEY]).toBeUndefined();
    expect(stores.starnet_rep_book_v1).toEqual([
      { id: "p1", repId: "r1", clientId: "c1", kind: "payment", amount: 5000, currency: "MRU", date: "2026-10-01", createdAt: "2026-10-02T09:00:00.000Z" },
    ]);
    expect(summary.payments).toBe(1);
  });

  it("the customer of his new device becomes his, with its balance", () => {
    const changes = {
      [ACCOUNTS_KEY]: { set: { a2: { id: "a2", name: "Dish 2", clientId: "c2" } }, removed: [] },
      [CLIENTS_KEY]: { set: { c2: { id: "c2", name: "Client Two" } }, removed: [] },
    };
    const { stores } = applyRepChangeSet(owner(), changes, "r1", new Date("2026-10-02T10:00:00Z"));
    expect((stores[CLIENTS_KEY] as Record<string, Record<string, unknown>>).c2!.repSegments).toEqual([{ repId: "r1", from: "2026-10-02T10:00:00.000Z", carry: true }]);
  });
});

describe("a new device the operator already has", () => {
  it("is flagged with the operator's device (same email or KIT), never as a plain new one", () => {
    const owner = {
      [ACCOUNTS_KEY]: [
        { id: "o1", name: "Owner Dish", expectedEmail: "same@example.com", kitNumber: "" },
        { id: "o2", name: "Owner Dish 2", kitNumber: "KIT99998888" },
        { id: "o3", name: "Gone", expectedEmail: "gone@example.com", deletedAt: "2026-10-01" },
      ],
    };
    const changes = {
      [ACCOUNTS_KEY]: {
        set: {
          n1: { id: "n1", name: "منزل", expectedEmail: "SAME@example.com" },
          n2: { id: "n2", name: "Other", kitNumber: "kit-9999-8888" },
          n3: { id: "n3", name: "Fresh", expectedEmail: "new@example.com" },
          n4: { id: "n4", name: "Back", expectedEmail: "gone@example.com" },
        },
        removed: [],
      },
    };
    const items = listRepChangeItems(changes, owner);
    const dup = Object.fromEntries(items.map((i) => [i.accountId, i.duplicateOf]));
    expect(dup.n1).toEqual({ accountId: "o1", name: "Owner Dish", field: "email" });
    expect(dup.n2).toEqual({ accountId: "o2", name: "Owner Dish 2", field: "kit" });
    expect(dup.n3).toBeUndefined();
    expect(dup.n4).toBeUndefined();
  });
});
