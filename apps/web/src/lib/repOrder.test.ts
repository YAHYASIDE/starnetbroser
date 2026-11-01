import { describe, expect, it } from "vitest";
import { moveRep, orderReps } from "./repOrder";

const reps = [
  { id: "a", name: "يب هنكال" },
  { id: "b", name: "الحسين" },
  { id: "c", name: "lobn" },
  { id: "d", name: "الحافظ" },
];
const info = { order: ["c", "a"], devices: { a: 8, b: 2, c: 1, d: 23 }, owed: { a: 21924, b: -500, c: 0, d: 5000 } };
const ids = (list: { id: string }[]) => list.map((r) => r.id);

describe("↕️ the reps' cards order (his Nov 1 2026 choice)", () => {
  it("his own order first, the rest by name", () => {
    expect(ids(orderReps(reps, "manual", info))).toEqual(["c", "a", "d", "b"]);
  });
  it("by name, most devices, most owed", () => {
    expect(ids(orderReps(reps, "name", info))).toEqual(["d", "b", "a", "c"]);
    expect(ids(orderReps(reps, "devices", info))).toEqual(["d", "a", "b", "c"]);
    expect(ids(orderReps(reps, "owed", info))).toEqual(["a", "d", "c", "b"]);
  });
  it("▲ / ▼ moves one step, never past the ends", () => {
    expect(moveRep(["c", "a", "d", "b"], "d", -1)).toEqual(["c", "d", "a", "b"]);
    expect(moveRep(["c", "a", "d", "b"], "c", -1)).toEqual(["c", "a", "d", "b"]);
    expect(moveRep(["c", "a", "d", "b"], "b", 1)).toEqual(["c", "a", "d", "b"]);
    expect(moveRep(["c", "a"], "x", 1)).toEqual(["c", "a"]);
  });
});
