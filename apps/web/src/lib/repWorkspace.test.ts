import { describe, expect, it } from "vitest";
import { ACCOUNTS_KEY, CLIENTS_KEY, LEDGER_KEY, rebaseWorkspace, repPending, repStoreSlice } from "./repWorkspace";

// Fake records only.
const acc = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `جهاز ${id}`, ...extra });
const entry = (id: string, amount: number) => ({ id, kind: "credit", amount, currency: "MRU", date: "2026-10-02" });

describe("rep slice (operator side)", () => {
  it("keeps only the rep's live devices, their records and customers, plus shared settings", () => {
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
    expect((slice[ACCOUNTS_KEY] as { id: string }[]).map((a) => a.id)).toEqual(["a1"]);
    expect(slice[LEDGER_KEY]).toEqual({ a1: [entry("e1", 1)] });
    expect(Object.keys(slice[CLIENTS_KEY] as object)).toEqual(["c1"]);
    expect((slice.starnet_party_adjustments_v1 as { id: string }[]).map((j) => j.id)).toEqual(["j1"]);
    expect(Object.keys(slice.starnet_representatives_v1 as object)).toEqual(["r1"]);
    expect(slice.starnet_currencies_v1).toEqual({ MRU: { code: "MRU", rateFromUsd: 400 } });
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

  it("a device the operator moved away leaves with its operations, even if the rep edited it", () => {
    const current = { ...base, [ACCOUNTS_KEY]: [acc("a1"), acc("a2", { phone: "+0" })], [LEDGER_KEY]: { a1: [entry("e1", 100)], a2: [entry("x", 5)] } };
    const next = { ...base, [ACCOUNTS_KEY]: [acc("a1")], [LEDGER_KEY]: { a1: [entry("e1", 100)] } };
    const merged = rebaseWorkspace(current, base, next);
    expect((merged[ACCOUNTS_KEY] as { id: string }[]).map((a) => a.id)).toEqual(["a1"]);
    expect(Object.keys(merged[LEDGER_KEY] as object)).toEqual(["a1"]);
  });

  it("the first copy is taken as it is", () => {
    expect(rebaseWorkspace({}, null, base)).toEqual(base);
  });
});
