import { describe, expect, it } from "vitest";
import { lastingOutOfSync, teamLineCaption, teamSyncRows } from "./teamSyncStatus";

const team = [
  { id: "phone", name: "YAHYA", at: "" },
  { id: "m1", name: "المسؤول 2", at: "" },
  { id: "m2", name: "اللابتوب", at: "" },
];
const full = { starnet_demo_accounts_v1: 785, starnet_customer_ledger_v1: 602 };

describe("🟥 the team's devices not fully synced (his Nov 7 2026 ask)", () => {
  it("on YAHYA: each member against his numbers", () => {
    const rows = teamSyncRows({ counts: full, theirCounts: { m1: { counts: full, at: "t1" }, m2: { counts: { starnet_demo_accounts_v1: 775, starnet_customer_ledger_v1: 602 }, at: "t2" } } }, team, "phone");
    expect(rows.map((r) => [r.name, r.diffs.length])).toEqual([["المسؤول 2", 0], ["اللابتوب", 1]]);
    expect(rows[1]!.diffs[0]).toEqual({ label: "📡 الأجهزة", theirs: 775, main: 785 });
    expect(rows[1]!.at).toBe("t2");
  });

  it("on another member: itself and the others against YAHYA's; an older app's unknown numbers count as not complete", () => {
    const rows = teamSyncRows({ counts: { ...full, starnet_customer_ledger_v1: 600 }, theirCounts: { phone: { counts: full, at: "t" } } }, team, "m1");
    expect(rows.find((r) => r.isMe)!.diffs).toHaveLength(1);
    expect(rows.find((r) => r.id === "m2")).toMatchObject({ known: false, diffs: [] });
    expect(teamSyncRows({ counts: full }, team, "m1")).toEqual([]);
  });

  it("shows only a difference that lasted 2 minutes; a fixed one is forgotten", () => {
    const rows = teamSyncRows({ counts: full, theirCounts: { m1: { counts: {}, at: "t" }, m2: { counts: full, at: "t" } } }, team, "phone");
    let s = lastingOutOfSync(rows, {}, 1000);
    expect(s.ids).toEqual([]);
    s = lastingOutOfSync(rows, s.since, 1000 + 120_000);
    expect(s.ids).toEqual(["m1"]);
    const fixed = teamSyncRows({ counts: full, theirCounts: { m1: { counts: full, at: "t" }, m2: { counts: full, at: "t" } } }, team, "phone");
    expect(lastingOutOfSync(fixed, s.since, 200_000)).toEqual({ ids: [], since: {} });
    expect(teamLineCaption(["اللابتوب"])).toBe("🔗 «اللابتوب» غير مكتمل");
    expect(teamLineCaption(["a", "b"])).toBe("🔗 2 أجهزة غير مكتملة");
  });
});
