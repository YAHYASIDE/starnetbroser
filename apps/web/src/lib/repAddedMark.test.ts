import { describe, expect, it } from "vitest";
import { clearRepAddedPatch } from "./repAddedMark";

describe("clearRepAddedPatch", () => {
  it("drops the mark and keeps the day it was added", () => {
    expect(clearRepAddedPatch({ addedByRepId: "rep1", addedByRepAt: "2026-10-07T09:00:00.000Z" })).toEqual({
      addedByRepId: undefined,
      addedByRepAt: undefined,
      addedAt: "2026-10-07T09:00:00.000Z",
    });
  });

  it("never overwrites an existing added day", () => {
    const patch = clearRepAddedPatch({ addedByRepId: "rep1", addedByRepAt: "2026-10-07T09:00:00.000Z", addedAt: "2026-10-01T08:00:00.000Z" });
    expect(patch).toEqual({ addedByRepId: undefined, addedByRepAt: undefined });
  });
});
