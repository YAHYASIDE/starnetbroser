import { describe, expect, it } from "vitest";
import {
  applyRepChangeSet,
  changeSetOf,
  describeItems,
  isItemDecided,
  listRepChangeItems,
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
  it("💼 only a new device, a name and his customer's name - never his operations, D, debts or Starlink reads (his Oct 13 2026 rule)", () => {
    const b = base();
    // the copy he got: his device carries his customer's name (the operator took it in before)
    b[ACCOUNTS_KEY][0] = { ...b[ACCOUNTS_KEY][0]!, repClientName: "Client One" } as (typeof b)[typeof ACCOUNTS_KEY][number];
    const current = {
      ...b,
      [ACCOUNTS_KEY]: [
        { ...b[ACCOUNTS_KEY][0]!, lastSuccessfulScanAt: "2026-10-02T08:00:00Z", serviceStatus: "suspended", renewalDate: "2026-11-01", renewalPlan: { saleAmount: 1 } },
        { id: "a2", name: "Dish 2", representativeId: "r1", clientId: "c2", renewalPlan: { saleAmount: 9 } },
      ],
      [LEDGER_KEY]: { a1: [entry("e1", "debit", 12000), entry("p1", "credit", 5000), entry("s1", "debit", 13000)] },
      [CLIENTS_KEY]: { ...b[CLIENTS_KEY], c2: { id: "c2", name: "Client Two" } },
    };
    const changes = buildRepChangeSet(current, b);
    expect(Object.keys(changes)).toEqual([ACCOUNTS_KEY]);
    expect(Object.keys(changes[ACCOUNTS_KEY]!.set)).toEqual(["a2"]);
    // a new device comes with his customer's name, never its price
    expect(changes[ACCOUNTS_KEY]!.set.a2).toMatchObject({ name: "Dish 2", repClientName: "Client Two" });
    expect(changes[ACCOUNTS_KEY]!.set.a2!.renewalPlan).toBeUndefined();
    expect(countRepChanges(changes)).toBe(1);
    expect(newDeviceIds(changes, b)).toEqual(["a2"]);
    // a new name: only the name travels (his renewal date / price stay on his phone)
    const renamed = { ...current, [ACCOUNTS_KEY]: [{ ...current[ACCOUNTS_KEY][0]!, name: "Roof" }] };
    expect(buildRepChangeSet(renamed, b)[ACCOUNTS_KEY]!.set.a1).toEqual({ ...b[ACCOUNTS_KEY][0], name: "Roof" });
    // another customer of his on the device: his customer's name, for information
    const linked = { ...b, [ACCOUNTS_KEY]: [{ ...b[ACCOUNTS_KEY][0]!, clientId: "his" }], [CLIENTS_KEY]: { his: { id: "his", name: "Zaid" } } };
    expect(buildRepChangeSet(linked, b)[ACCOUNTS_KEY]!.set.a1).toEqual({ ...b[ACCOUNTS_KEY][0], repClientName: "Zaid" });
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

  it("adds his new device - never its operations, his customer, his price (an older rep app may still send them)", () => {
    const changes = {
      [ACCOUNTS_KEY]: { set: { a2: { id: "a2", name: "Dish 2", clientId: "c2", repClientName: "Client Two", renewalPlan: { saleAmount: 9 } } }, removed: [] },
      [CLIENTS_KEY]: { set: { c2: { id: "c2", name: "Client Two" } }, removed: [] },
      [LEDGER_KEY]: { set: { "a1/p1": entry("p1", "credit", 5000), "a2/s1": entry("s1", "debit", 12000) }, removed: [] },
    };
    const { stores, summary, newDeviceIds: created } = applyRepChangeSet(ownerStores(), changes, "r1");
    const accounts = stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>;
    expect(accounts.find((a) => a.id === "a2")).toMatchObject({ representativeId: "r1", repClientName: "Client Two" });
    expect(accounts.find((a) => a.id === "a2")!.clientId).toBeUndefined();
    expect(accounts.find((a) => a.id === "a2")!.renewalPlan).toBeUndefined();
    expect(accounts).toHaveLength(4);
    // 💼 no D, no payment, no debt reaches the operator
    expect(stores[LEDGER_KEY]).toBeUndefined();
    expect(stores[CLIENTS_KEY]).toBeUndefined();
    expect(created).toEqual(["a2"]);
    expect(summary).toMatchObject({ newDevices: 1, payments: 0, shipments: 0, newClients: 0, refused: 3 });
    expect(describeRepChanges(summary)).toBe("📡 1 جهاز جديد");
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
        set: {
          x1: { id: "x1", name: "Hijacked" },
          o1: { id: "o1", name: "Hijacked", representativeId: "r1" },
          a1: { id: "a1", name: "Dish 1 (roof)", representativeId: "r2", deletedAt: "2026-10-02", renewalDate: "2027-01-01" },
        },
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
    // only his device's name: he can't hand it to someone else, delete it, or move its date from here
    expect(accounts.find((a) => a.id === "a1")).toMatchObject({ name: "Dish 1 (roof)", representativeId: "r1" });
    expect(accounts.find((a) => a.id === "a1")!.deletedAt).toBeUndefined();
    expect(accounts.find((a) => a.id === "a1")!.renewalDate).toBeUndefined();
    expect(stores[LEDGER_KEY]).toBeUndefined();
    expect(stores[CLIENTS_KEY]).toBeUndefined();
    expect(summary.refused).toBe(8);
    expect(summary.removedEntries).toBe(0);
  });

  it("his customers' promises stay with him (never applied here)", () => {
    const changes = { [PROMISES_KEY]: { set: { pr1: { id: "pr1", clientId: "c1", amount: 3000 } }, removed: [] } };
    const { stores, summary } = applyRepChangeSet(ownerStores(), changes, "r1");
    expect(stores[PROMISES_KEY]).toBeUndefined();
    expect(summary.refused).toBe(1);
  });

  it("his edit of a device keeps the operator's customer on it", () => {
    const changes = { [ACCOUNTS_KEY]: { set: { a1: { id: "a1", name: "Dish 1 (roof)", representativeId: "r1", clientId: "his-own" } }, removed: [] } };
    const a1 = (applyRepChangeSet(ownerStores(), changes, "r1").stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>).find((a) => a.id === "a1");
    expect(a1).toMatchObject({ name: "Dish 1 (roof)", clientId: "c1" });
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

  it("💼 only the new device is offered - its operations, other operations, his customers and promises never", () => {
    const items = listRepChangeItems(changes, owner());
    expect(items.map((i) => i.kind)).toEqual(["newDevice"]);
    expect(items[0]!.parts.map((p) => `${p.store}|${p.path}`)).toEqual([`${ACCOUNTS_KEY}|a2`]);
    const subset = changeSetOf(changes, items);
    expect(Object.keys(subset)).toEqual([ACCOUNTS_KEY]);
    const { stores } = applyRepChangeSet(owner(), subset, "r1", new Date("2026-10-02T10:00:00Z"));
    const a2 = (stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>).find((a) => a.id === "a2");
    expect(a2).toMatchObject({ addedByRepId: "r1", addedByRepAt: "2026-10-02T10:00:00.000Z" });
    expect(stores[LEDGER_KEY]).toBeUndefined();
    const decisions = withDecision({}, items, "rejected");
    expect(items.filter((i) => !isItemDecided(i, decisions))).toEqual([]);
    expect(rejectedVersions(decisions)).toEqual({ [`${ACCOUNTS_KEY}|a2`]: items[0]!.parts[0]!.hash });
    expect(describeItems(items)).toBe("📡 جهاز جديد 1");
  });

  it("a device edit says what changed: its name and / or his customer's name", () => {
    const edit = { [ACCOUNTS_KEY]: { set: { a1: { id: "a1", name: "Roof", representativeId: "r1", repClientName: "Zaid", renewalDate: "2027-01-01" } }, removed: [] } };
    const [item] = listRepChangeItems(edit, owner());
    expect(item).toMatchObject({ kind: "deviceEdit", title: "✏️ تعديل الجهاز Dish 1", detail: "✏️ الاسم: Dish 1 ← Roof · 👤 زبونه: Zaid" });
    // nothing that can travel changed: nothing offered
    expect(listRepChangeItems({ [ACCOUNTS_KEY]: { set: { a1: { id: "a1", name: "Dish 1", renewalDate: "2027-01-01" } }, removed: [] } }, owner())).toEqual([]);
  });
});

describe("rep's own customers: everything on the rep", () => {
  const owner = () => ({
    [ACCOUNTS_KEY]: [{ id: "a1", name: "Dish 1", representativeId: "r1", clientId: "c1" }],
    [LEDGER_KEY]: { a1: [entry("e1", "debit", 12000)] },
    [CLIENTS_KEY]: { c1: { id: "c1", name: "Client One", repSegments: [{ repId: "r1", from: "2026-09-01T00:00:00.000Z", carry: true }] } },
  });

  it("a payment he took from his own customer stays with him - nothing reaches the operator", () => {
    const changes = { [LEDGER_KEY]: { set: { "a1/p1": { ...entry("p1", "credit", 5000), createdAt: "2026-10-02T09:00:00.000Z" } }, removed: [] } };
    const { stores, summary } = applyRepChangeSet(owner(), changes, "r1");
    expect(stores).toEqual({});
    expect(summary).toMatchObject({ payments: 0, refused: 1 });
  });

  it("his new device arrives without his customer - his customers stay on his phone", () => {
    const changes = {
      [ACCOUNTS_KEY]: { set: { a2: { id: "a2", name: "Dish 2", clientId: "c2" } }, removed: [] },
      [CLIENTS_KEY]: { set: { c2: { id: "c2", name: "Client Two" } }, removed: [] },
    };
    const { stores } = applyRepChangeSet(owner(), changes, "r1", new Date("2026-10-02T10:00:00Z"));
    expect(stores[CLIENTS_KEY]).toBeUndefined();
    expect((stores[ACCOUNTS_KEY] as Array<Record<string, unknown>>).find((a) => a.id === "a2")!.clientId).toBeUndefined();
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
