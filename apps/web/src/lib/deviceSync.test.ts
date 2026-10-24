import { describe, expect, it } from "vitest";
import { baselineOf, detectShape, diff, flattenAll, flattenKey, merge, nextBaseline, unflattenKey, type SyncOp } from "./deviceSync";

const T1 = "2026-10-24T10:00:00.000Z";
const T2 = "2026-10-24T10:00:30.000Z";

describe("flatten / unflatten", () => {
  it("cuts each store shape into records and puts it back exactly", () => {
    const stores = {
      starnet_demo_accounts_v1: JSON.stringify([{ id: "a", name: "x" }, { id: "b", name: "y" }]),
      starnet_clients_v1: JSON.stringify({ c1: { id: "c1", name: "n" } }),
      starnet_customer_ledger_v1: JSON.stringify({ dev1: [{ id: "e1", amount: 5 }], dev2: [] }),
      starnet_other_v1: JSON.stringify({ version: 3, list: [1, 2] }),
      starnet_text_v1: "not json",
    };
    const flat = flattenAll(stores);
    expect(flat.starnet_demo_accounts_v1!.shape).toBe("array");
    expect(flat.starnet_clients_v1!.shape).toBe("map");
    expect(flat.starnet_customer_ledger_v1!.shape).toBe("map2");
    expect(flat.starnet_other_v1!.shape).toBe("single");
    expect(flat.starnet_text_v1!.shape).toBe("single");
    expect(unflattenKey(flat.starnet_text_v1!)).toBe("not json");
    for (const [k, raw] of Object.entries(stores)) if (k !== "starnet_text_v1") expect(JSON.parse(unflattenKey(flat[k]!)!)).toEqual(JSON.parse(raw));
  });

  it("the same record in another key order is no change (no ping-pong between the two)", () => {
    const base = baselineOf(flattenAll({ k: JSON.stringify([{ id: "a", x: 1, y: 2 }]) }));
    const again = flattenAll({ k: JSON.stringify([{ y: 2, id: "a", x: 1 }]) }, base);
    expect(diff(base, again, T1).ops).toEqual([]);
  });

  it("keeps the shape it had when a store is emptied", () => {
    expect(detectShape({}, "map2")).toBe("map2");
    expect(detectShape([], "array")).toBe("array");
    expect(detectShape({ a: [1] }, "map2")).toBe("single");
  });
});

describe("diff", () => {
  it("sends only what changed, and deletions", () => {
    const before = flattenAll({ k: JSON.stringify([{ id: "a", v: 1 }, { id: "b", v: 1 }]) });
    const base = baselineOf(before);
    const now = flattenAll({ k: JSON.stringify([{ id: "a", v: 2 }, { id: "c", v: 1 }]) }, base);
    const { ops, held } = diff(base, now, T1);
    expect(held).toEqual([]);
    expect(ops.map((o) => [o.r, o.v === null ? null : JSON.parse(o.v).v])).toEqual([
      ["a", 2],
      ["c", 1],
      ["b", null],
    ]);
  });

  it("holds a mass deletion until he confirms it", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}` }));
    const base = baselineOf(flattenAll({ k: JSON.stringify(many) }));
    const now = flattenAll({ k: JSON.stringify(many.slice(0, 5)) }, base);
    const held = diff(base, now, T1);
    expect(held.ops).toEqual([]);
    expect(held.held).toEqual([{ k: "k", count: 35, total: 40 }]);
    expect(diff(base, now, T1, new Set(["k"])).ops).toHaveLength(35);
    // held rows stay in the baseline, so they are noticed again next round
    expect(Object.keys(nextBaseline(now, base, held.held).k!.hashes)).toHaveLength(40);
  });
});

describe("merge", () => {
  const start = () => flattenAll({ ledger: JSON.stringify({ d1: [{ id: "e1", amount: 1 }] }) });
  const op = (r: string, v: unknown, at: string): SyncOp => ({ k: "ledger", s: "map2", r, v: v === null ? null : JSON.stringify(v), at });

  it("two new operations on the same device, one per side, both stay", () => {
    const here = flattenAll({ ledger: JSON.stringify({ d1: [{ id: "e1", amount: 1 }, { id: "e2", amount: 2 }] }) });
    const mine = [op("d1\u001fe2", { id: "e2", amount: 2 }, T1)];
    const theirs = [op("d1\u001fe3", { id: "e3", amount: 3 }, T1)];
    const result = merge(here, mine, theirs);
    expect(JSON.parse(unflattenKey(result.data.ledger!)!)).toEqual({ d1: [{ id: "e1", amount: 1 }, { id: "e2", amount: 2 }, { id: "e3", amount: 3 }] });
    expect(result.outgoing).toEqual(mine);
    expect(result.conflicts).toEqual([]);
    expect(result.changedKeys).toEqual(["ledger"]);
  });

  it("the same record changed on both sides: the later wins, the other is kept as a conflict", () => {
    const mine = [op("d1\u001fe1", { id: "e1", amount: 10 }, T1)];
    const later = [op("d1\u001fe1", { id: "e1", amount: 20 }, T2)];
    const lost = merge(start(), mine, later);
    expect(JSON.parse(lost.data.ledger!.records["d1\u001fe1"]!).amount).toBe(20);
    expect(lost.outgoing).toEqual([]);
    expect(lost.conflicts).toEqual([{ k: "ledger", r: "d1\u001fe1", kept: "remote", lost: mine[0]!.v, at: T1 }]);

    const won = merge(start(), [op("d1\u001fe1", { id: "e1", amount: 10 }, T2)], [op("d1\u001fe1", { id: "e1", amount: 20 }, T1)]);
    expect(JSON.parse(won.data.ledger!.records["d1\u001fe1"]!).amount).toBe(1);
    expect(won.outgoing).toHaveLength(1);
    expect(won.conflicts[0]!.kept).toBe("local");
  });

  it("a deletion from the other side removes it; a store new to this side is created", () => {
    const result = merge(start(), [], [op("d1\u001fe1", null, T1), { k: "fresh", s: "array", r: "x", v: JSON.stringify({ id: "x" }), at: T1 }]);
    expect(unflattenKey(result.data.ledger!)).toBe("{}");
    expect(unflattenKey(result.data.fresh!)).toBe('[{"id":"x"}]');
    expect(result.changedKeys.sort()).toEqual(["fresh", "ledger"]);
  });

  it("the very same change on both sides is no conflict", () => {
    const same = op("d1\u001fe1", { id: "e1", amount: 5 }, T1);
    const result = merge(start(), [same], [{ ...same, at: T2 }]);
    expect(result.conflicts).toEqual([]);
    expect(result.outgoing).toEqual([]);
  });

  it("flattenKey of an empty ledger list survives", () => {
    expect(unflattenKey(flattenKey(JSON.stringify({ d: [] })))).toBe('{"d":[]}');
  });
});
