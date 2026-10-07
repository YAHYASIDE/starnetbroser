import { describe, expect, it } from "vitest";
import { mergeList, mergeMap, mergeRecord, removedLinks } from "./storeMerge";

type Dev = { id: string; name: string; clientId?: string; renewalDate?: string; balance?: number };

describe("🔗 saving without overwriting", () => {
  it("an older copy saved later never takes off a customer link made meanwhile", () => {
    const loaded: Dev[] = [{ id: "d1", name: "أ" }, { id: "d2", name: "ب" }];
    // the link was saved (by the edit dialog) after the other screen loaded its copy
    const stored: Dev[] = [{ id: "d1", name: "أ", clientId: "c1" }, { id: "d2", name: "ب" }];
    // that screen now saves its copy with a Starlink read on d1 and d2
    const next: Dev[] = [{ id: "d1", name: "أ", renewalDate: "2026-10-16" }, { id: "d2", name: "ب", balance: 5 }];
    expect(mergeList(stored, loaded, next)).toEqual([
      { id: "d1", name: "أ", clientId: "c1", renewalDate: "2026-10-16" },
      { id: "d2", name: "ب", balance: 5 },
    ]);
  });

  it("what this screen changed is saved: a link, an unlink, a removed field", () => {
    const base: Dev[] = [{ id: "d1", name: "أ", clientId: "c1", balance: 3 }];
    expect(mergeList(base, base, [{ id: "d1", name: "أ", balance: 3 }])).toEqual([{ id: "d1", name: "أ", balance: 3 }]);
    expect(mergeList(base, base, [{ id: "d1", name: "أ", clientId: "c2" }])).toEqual([{ id: "d1", name: "أ", clientId: "c2" }]);
  });

  it("devices added elsewhere stay; a removed one goes; a new one goes first when put first", () => {
    const base: Dev[] = [{ id: "d1", name: "أ" }, { id: "d2", name: "ب" }];
    const stored: Dev[] = [{ id: "d9", name: "من البوت" }, ...base];
    const next: Dev[] = [{ id: "new", name: "جديد" }, { id: "d1", name: "أ" }];
    expect(mergeList(stored, base, next).map((d) => d.id)).toEqual(["new", "d9", "d1"]);
    expect(mergeList(stored, base, [...base, { id: "end", name: "آخر" }]).map((d) => d.id)).toEqual(["d9", "d1", "d2", "end"]);
  });

  it("customers: a customer added elsewhere is not dropped by an older copy", () => {
    const base = { c1: { name: "أ" } };
    const stored = { c1: { name: "أ" }, c2: { name: "ب" } };
    expect(mergeMap(stored, base, { c1: { name: "أ" }, c3: { name: "ج" } })).toEqual({ c1: { name: "أ" }, c2: { name: "ب" }, c3: { name: "ج" } });
    expect(mergeMap(stored, base, {})).toEqual({ c2: { name: "ب" } });
    expect(mergeMap(stored, base, { c1: { name: "أ أ" } })).toEqual({ c1: { name: "أ أ" }, c2: { name: "ب" } });
  });

  it("a field set to undefined is removed", () => {
    expect(mergeRecord<Dev>({ id: "d1", name: "أ", clientId: "c1" }, { id: "d1", name: "أ", clientId: "c1" }, { id: "d1", name: "أ", clientId: undefined })).toEqual({ id: "d1", name: "أ" });
  });

  it("finds the links a save takes off", () => {
    expect(removedLinks<Dev>([{ id: "d1", name: "أ", clientId: "c1" }, { id: "d2", name: "ب" }], [{ id: "d1", name: "أ" }, { id: "d2", name: "ب" }])).toEqual([{ id: "d1", name: "أ", clientId: "c1" }]);
  });
});
