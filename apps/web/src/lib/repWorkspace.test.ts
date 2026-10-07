import { describe, expect, it } from "vitest";
import { ACCOUNTS_KEY, CLIENTS_KEY, LEDGER_KEY, mergeDevice, rebaseWorkspace, recordHash, repPending, repStoreSlice } from "./repWorkspace";

// Fake records only.
const acc = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `جهاز ${id}`, ...extra });
const entry = (id: string, amount: number) => ({ id, kind: "credit", amount, currency: "MRU", date: "2026-10-02" });

describe("rep slice (operator side)", () => {
  it("keeps only the rep's live devices and their records, plus shared settings - no customers", () => {
    const slice = repStoreSlice(
      {
        [ACCOUNTS_KEY]: [acc("a1", { representativeId: "r1", clientId: "c1" }), acc("a2", { representativeId: "r2", clientId: "c2" }), acc("a3", { representativeId: "r1", deletedAt: "x" })],
        [LEDGER_KEY]: { a1: [entry("e1", 1)], a2: [entry("e2", 2)] },
        [CLIENTS_KEY]: { c1: { id: "c1", name: "زبون 1" }, c2: { id: "c2", name: "زبون 2" } },
        starnet_party_adjustments_v1: [{ id: "j1", partyKind: "client", partyId: "c1" }, { id: "j2", partyKind: "client", partyId: "c2" }],
        starnet_currencies_v1: { MRU: { code: "MRU", rateFromUsd: 400 } },
        starnet_representatives_v1: { r1: { id: "r1", name: "م1" }, r2: { id: "r2", name: "م2" } },
      },
      "r1",
    );
    expect(slice[ACCOUNTS_KEY]).toEqual([acc("a1", { representativeId: "r1" })]);
    expect(slice[LEDGER_KEY]).toEqual({ a1: [entry("e1", 1)] });
    // 👥 his Oct 2026 rule: the copy carries devices only, never customers
    expect(CLIENTS_KEY in slice).toBe(false);
    expect("starnet_party_adjustments_v1" in slice).toBe(false);
    expect(Object.keys(slice.starnet_representatives_v1 as object)).toEqual(["r1"]);
    expect(slice.starnet_currencies_v1).toEqual({ MRU: { code: "MRU", rateFromUsd: 400 } });
  });
});

describe("rep slice for «تقاريري»", () => {
  it("carries his settlements, his book, his store sales and his share on devices no longer his", () => {
    const slice = repStoreSlice(
      {
        [ACCOUNTS_KEY]: [acc("a1", { representativeId: "r1" }), acc("old", { representativeId: "r2" })],
        [LEDGER_KEY]: {
          a1: [entry("e1", 1)],
          old: [{ ...entry("s1", 5), representativeId: "r1" }, { ...entry("s2", 6), representativeId: "r2" }],
        },
        starnet_rep_settlements_v1: [{ id: "x1", representativeId: "r1" }, { id: "x2", representativeId: "r2" }],
        starnet_rep_book_v1: [{ id: "b1", repId: "r1" }, { id: "b2", repId: "r2" }],
        starnet_store_invoices_v1: [{ id: "i1", representativeId: "r1" }, { id: "i2", representativeId: "r2" }],
      },
      "r1",
    );
    expect((slice.starnet_rep_settlements_v1 as { id: string }[]).map((x) => x.id)).toEqual(["x1"]);
    expect((slice.starnet_rep_book_v1 as { id: string }[]).map((x) => x.id)).toEqual(["b1"]);
    expect((slice.starnet_store_invoices_v1 as { id: string }[]).map((x) => x.id)).toEqual(["i1"]);
    expect(slice.starnet_rep_past_ledger_v1).toEqual({ ledger: { old: [{ ...entry("s1", 5), representativeId: "r1" }] }, names: { old: "جهاز old" } });
  });
});

describe("rebase on a new copy (rep side)", () => {
  const base = {
    [ACCOUNTS_KEY]: [acc("a1"), acc("a2")],
    [LEDGER_KEY]: { a1: [entry("e1", 100)], a2: [] },
    [CLIENTS_KEY]: { c1: { id: "c1", name: "زبون" } },
    starnet_currencies_v1: { MRU: 400 },
  };

  it("keeps what the rep recorded, takes the operator's news, and marks it pending", () => {
    const current = {
      ...base,
      [ACCOUNTS_KEY]: [acc("a1", { serviceStatus: "active", lastSuccessfulScanAt: "2026-10-02T09:00:00Z" }), acc("a2"), acc("new")],
      [LEDGER_KEY]: { a1: [entry("e1", 100), entry("mine", 50)], a2: [] },
    };
    const pending = repPending(current, base);
    // A Starlink read on a1 is not a change; the new device and the payment are.
    expect([...pending.accountIds].sort()).toEqual(["a1", "new"]);
    expect([...pending.entryPaths]).toEqual(["a1/mine"]);

    const next = {
      [ACCOUNTS_KEY]: [acc("a1", { name: "اسم جديد" }), acc("a2")],
      [LEDGER_KEY]: { a1: [entry("e1", 100), entry("owner", 70)], a2: [] },
      [CLIENTS_KEY]: { c1: { id: "c1", name: "زبون" } },
      starnet_currencies_v1: { MRU: 410 },
    };
    const merged = rebaseWorkspace(current, base, next);
    const accounts = merged[ACCOUNTS_KEY] as { id: string; name: string; serviceStatus?: string }[];
    expect(accounts.map((a) => a.id)).toEqual(["a1", "a2", "new"]);
    // The operator renamed a1; the rep's sync read on it is kept too.
    expect(accounts[0]).toMatchObject({ name: "اسم جديد", serviceStatus: "active" });
    expect((merged[LEDGER_KEY] as Record<string, { id: string }[]>).a1!.map((e) => e.id).sort()).toEqual(["e1", "mine", "owner"]);
    expect(merged.starnet_currencies_v1).toEqual({ MRU: 410 });
  });

  it("the business profile follows the operator's copy, unless the rep saved his own", () => {
    const P = "starnet_business_profile_v1";
    const current = { ...base, [P]: { name: "DEMO REP SHOP" } };
    const next = { ...base, [P]: { name: "STAR NET" } };
    expect(rebaseWorkspace(current, base, next)[P]).toEqual({ name: "STAR NET" });
    expect(rebaseWorkspace(current, base, next, {}, true)[P]).toEqual({ name: "DEMO REP SHOP" });
    // Nothing saved yet on the phone: the operator's one applies even when "own" is set.
    expect(rebaseWorkspace({ ...base }, base, next, {}, true)[P]).toEqual({ name: "STAR NET" });
  });

  it("a device the operator moved away leaves with its operations, even if the rep edited it", () => {
    const current = { ...base, [ACCOUNTS_KEY]: [acc("a1"), acc("a2", { phone: "+0" })], [LEDGER_KEY]: { a1: [entry("e1", 100)], a2: [entry("x", 5)] } };
    const next = { ...base, [ACCOUNTS_KEY]: [acc("a1")], [LEDGER_KEY]: { a1: [entry("e1", 100)] } };
    const merged = rebaseWorkspace(current, base, next);
    expect((merged[ACCOUNTS_KEY] as { id: string }[]).map((a) => a.id)).toEqual(["a1"]);
    expect(Object.keys(merged[LEDGER_KEY] as object)).toEqual(["a1"]);
  });

  it("what the operator took in (from «تسجيلاتي») is his version and no longer pending", () => {
    const current = {
      ...base,
      [ACCOUNTS_KEY]: [acc("a1"), acc("a2"), acc("a9", { clientId: "c1" })],
      [LEDGER_KEY]: { a1: [entry("e1", 100), entry("p1", 50)], a2: [] },
    };
    const next = {
      ...base,
      [ACCOUNTS_KEY]: [acc("a1"), acc("a2"), acc("a9", { clientId: "c1", representativeId: "r1" })],
      [LEDGER_KEY]: { a1: [entry("e1", 100), { ...entry("p1", 50), heldByRepId: "r1" }], a2: [] },
    };
    const merged = rebaseWorkspace(current, base, next);
    expect(merged[LEDGER_KEY]).toEqual(next[LEDGER_KEY]);
    expect(merged[ACCOUNTS_KEY]).toEqual(next[ACCOUNTS_KEY]);
    expect(repPending(merged, next).count).toBe(0);
  });

  it("what the operator rejected leaves the rep's phone - unless he changed it again", () => {
    const mine = entry("p1", 50);
    const current = { ...base, [LEDGER_KEY]: { a1: [entry("e1", 100), mine], a2: [] } };
    const rejected = { [`${LEDGER_KEY}|a1/p1`]: recordHash(mine) };
    expect(rebaseWorkspace(current, base, base, rejected)[LEDGER_KEY]).toEqual(base[LEDGER_KEY]);
    const changed = { ...base, [LEDGER_KEY]: { a1: [entry("e1", 100), entry("p1", 60)], a2: [] } };
    expect(rebaseWorkspace(changed, base, base, rejected)[LEDGER_KEY]).toEqual(changed[LEDGER_KEY]);
  });

  it("a payment the operator moved into the rep's book is no longer pending on his device", () => {
    const current = { ...base, [LEDGER_KEY]: { a1: [entry("e1", 100), entry("p9", 50)], a2: [] } };
    const next = { ...base, starnet_rep_book_v1: [{ id: "p9", repId: "r1", clientId: "c1", kind: "payment", amount: 50 }] };
    expect(rebaseWorkspace(current, base, next)[LEDGER_KEY]).toEqual(base[LEDGER_KEY]);
  });

  it("a new copy never takes the rep's customer off his device, even when the operator changed that device", () => {
    // The rep linked both old devices to his own customers; the operator meanwhile renewed a2
    // (new renewal date) and linked a1 to someone else; plus a brand-new device.
    const current = {
      ...base,
      [ACCOUNTS_KEY]: [acc("a1", { clientId: "mine1" }), acc("a2", { clientId: "mine2" })],
      [CLIENTS_KEY]: { c1: { id: "c1", name: "زبون" }, mine1: { id: "mine1", name: "زبون المندوب 1" }, mine2: { id: "mine2", name: "زبون المندوب 2" } },
    };
    const next = {
      ...base,
      [ACCOUNTS_KEY]: [acc("a1", { clientId: "c1" }), acc("a2", { renewalDate: "2026-11-10" }), acc("new")],
    };
    const merged = rebaseWorkspace(current, base, next);
    const accounts = merged[ACCOUNTS_KEY] as { id: string; clientId?: string; renewalDate?: string }[];
    expect(accounts.map((a) => [a.id, a.clientId])).toEqual([["a1", "mine1"], ["a2", "mine2"], ["new", undefined]]);
    // the operator's renewal date still arrives
    expect(accounts[1]!.renewalDate).toBe("2026-11-10");
    // his customers are his phone's: a copy never writes them (left as they are on the phone)
    expect(CLIENTS_KEY in merged).toBe(false);
  });

  it("mergeDevice: the operator's news, and every field the rep changed stays his («عنده تبقى»)", () => {
    const before = { id: "d", name: "A", phone: "1", note: "x" };
    const mine = { id: "d", name: "A", phone: "2", note: "عندي" };
    const theirs = { id: "d", name: "B", phone: "1", note: "عنده" };
    expect(mergeDevice(mine, before, theirs)).toEqual({ id: "d", name: "B", phone: "2", note: "عندي" });
  });

  it("🚫 he can't delete a device the operator gave him: a removed or trashed one comes back", () => {
    const removed = { ...base, [ACCOUNTS_KEY]: [acc("a1")] };
    expect((rebaseWorkspace(removed, base, base)[ACCOUNTS_KEY] as { id: string }[]).map((a) => a.id)).toEqual(["a1", "a2"]);
    const trashed = { ...base, [ACCOUNTS_KEY]: [acc("a1", { deletedAt: "2026-10-07" }), acc("a2", { archivedAt: "2026-10-07" })] };
    const merged = rebaseWorkspace(trashed, base, base)[ACCOUNTS_KEY] as Record<string, unknown>[];
    expect(merged[0]!.deletedAt).toBeUndefined();
    // archiving stays his choice
    expect(merged[1]!.archivedAt).toBe("2026-10-07");
  });

  it("the first copy is taken as it is (his customers' stores untouched)", () => {
    const { [CLIENTS_KEY]: _c, ...devices } = base;
    expect(rebaseWorkspace({}, null, base)).toEqual(devices);
  });
});
