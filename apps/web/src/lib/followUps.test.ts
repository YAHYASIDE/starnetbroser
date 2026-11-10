import { describe, expect, it } from "vitest";
import { addOwnFollow, cleanFollowStore, EMPTY_FOLLOW, FOLLOW_BUILT_IN, followItems, removeOwnFollow, toggleFollow } from "./followUps";

describe("follow-up list", () => {
  it("built-in ids are unique and each item has steps", () => {
    const ids = FOLLOW_BUILT_IN.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of FOLLOW_BUILT_IN) expect(i.steps.length).toBeGreaterThan(0);
  });

  it("ticking moves an item to done and back", () => {
    let s = toggleFollow(EMPTY_FOLLOW, "claude-key", 100);
    expect(followItems(s).done.map((i) => i.id)).toEqual(["claude-key"]);
    expect(followItems(s).open.some((i) => i.id === "claude-key")).toBe(false);
    s = toggleFollow(s, "claude-key", 200);
    expect(followItems(s).done).toEqual([]);
  });

  it("his own line: first line title, the rest steps; removed with its tick", () => {
    let s = addOwnFollow(EMPTY_FOLLOW, "اتصل بالمورد\nاسأله عن الشحنة\n\n", "mine", 1000);
    const own = s.own[0]!;
    expect(own).toMatchObject({ title: "اتصل بالمورد", steps: ["اسأله عن الشحنة"], own: true, group: "mine" });
    expect(addOwnFollow(s, "  \n ", "mine", 2000)).toBe(s);
    s = toggleFollow(s, own.id, 3000);
    s = removeOwnFollow(s, own.id);
    expect(s.own).toEqual([]);
    expect(s.done[own.id]).toBeUndefined();
  });

  it("cleans bad stored data", () => {
    expect(cleanFollowStore(null)).toEqual({ done: {}, own: [] });
    const s = cleanFollowStore({ done: { a: 5, b: "x" }, own: [{ id: "o", title: " t ", steps: ["s", 3, ""], group: "zzz" }, { id: 1 }] });
    expect(s.done).toEqual({ a: 5 });
    expect(s.own).toEqual([{ id: "o", group: "mine", title: "t", steps: ["s"], own: true }]);
  });
});
