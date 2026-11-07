import { describe, expect, it } from "vitest";
import { flaggedDevices, lastAddedByOthers } from "./homeTiles";
import type { OwnerFlagStore } from "./repFlags";

const flag = (id: string, deviceId: string, extra: Record<string, unknown> = {}) => ({ id, repId: "", deviceId, deviceName: "x", note: "n", at: 1, receivedAt: 1, ...extra });

describe("🔴🟡 open alerts", () => {
  it("a device with one open 🔴 is urgent; open 🟡 (or no level) only is not urgent; reviewed alerts don't count", () => {
    const store = {
      a: flag("a", "d1", { level: "urgent" }),
      b: flag("b", "d1", { level: "normal" }),
      c: flag("c", "d2"),
      d: flag("d", "d3", { level: "urgent", reviewedAt: 5 }),
      e: flag("e", "d4", { level: "normal" }),
    } as OwnerFlagStore;
    const { urgent, normal } = flaggedDevices(store);
    expect([...urgent]).toEqual(["d1"]);
    expect([...normal].sort()).toEqual(["d2", "d4"]);
  });
});

describe("🆕 last added by a rep or another member", () => {
  const accounts = [
    { id: "r1", addedByRepId: "rep1", addedByRepAt: "2026-11-05T10:00:00Z" },
    { id: "r2", addedByRepId: "rep1", addedByRepAt: "2026-11-07T10:00:00Z" },
    { id: "m1", addedAt: "2026-11-06T09:00:00Z" },
    { id: "mine", addedAt: "2026-11-07T11:00:00Z" },
    { id: "gone", addedByRepId: "rep1", addedByRepAt: "2026-11-07T12:00:00Z", deletedAt: "2026-11-07T13:00:00Z" },
  ];
  const activity = [
    { k: "starnet_demo_accounts_v1", r: "m1", kind: "add" as const, by: "المسؤول 2", at: "2026-11-06T09:00:05Z" },
    { k: "starnet_demo_accounts_v1", r: "mine", kind: "edit" as const, by: "المسؤول 2", at: "2026-11-07T12:00:00Z" },
    { k: "starnet_demo_accounts_v1", r: "r2", kind: "add" as const, by: "المسؤول 2", at: "2026-11-07T10:05:00Z" },
    { k: "starnet_clients_v1", r: "c1", kind: "add" as const, by: "المسؤول 2", at: "2026-11-07T14:00:00Z" },
  ];
  it("newest first, a rep's device stays his, edits / deleted / other stores don't count", () => {
    const list = lastAddedByOthers(accounts, activity, (id) => (id === "rep1" ? "محمد" : "مندوب"));
    expect(list.map((x) => `${x.id}:${x.by}`)).toEqual(["r2:محمد", "m1:المسؤول 2", "r1:محمد"]);
  });
  it("keeps the last 10 only", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `d${i}`, addedByRepId: "rep1", addedByRepAt: `2026-11-07T${String(i).padStart(2, "0")}:00:00Z` }));
    const list = lastAddedByOthers(many, [], () => "محمد");
    expect(list).toHaveLength(10);
    expect(list[0]!.id).toBe("d13");
  });
});
