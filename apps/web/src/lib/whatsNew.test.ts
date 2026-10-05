import { describe, expect, it } from "vitest";
import { markSeen, MAX_RELEASES_PER_TOUR, pendingReleases, samePath, tourSteps, WHATS_NEW, type WhatsNewRelease } from "./whatsNew";

const release = (id: string, steps = 1): WhatsNewRelease => ({
  id,
  date: "2026-10-01",
  title: id,
  steps: Array.from({ length: steps }, (_, i) => ({ title: `${id}-${i}`, after: "now" })),
});
// newest first, like WHATS_NEW
const releases = [release("r4"), release("r3"), release("r2"), release("r1")];

describe("🆕 ما الجديد", () => {
  it("first run of the feature: only the newest update plays, not the whole past", () => {
    expect(pendingReleases(releases, null).map((r) => r.id)).toEqual(["r4"]);
  });

  it("plays the updates not seen yet, oldest first, at most a few", () => {
    expect(pendingReleases(releases, ["r1", "r2"]).map((r) => r.id)).toEqual(["r3", "r4"]);
    expect(pendingReleases(releases, []).map((r) => r.id)).toHaveLength(MAX_RELEASES_PER_TOUR);
    expect(pendingReleases(releases, []).map((r) => r.id)).toEqual(["r2", "r3", "r4"]);
    expect(pendingReleases(releases, ["r1", "r2", "r3", "r4"])).toEqual([]);
  });

  it("joins the steps of several updates and remembers what was seen", () => {
    const steps = tourSteps([release("a", 2), release("b", 1)]);
    expect(steps.map((s) => s.releaseId)).toEqual(["a", "a", "b"]);
    expect(markSeen(null, ["a"])).toEqual(["a"]);
    expect(markSeen(["a"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("compares pages whatever the trailing slash", () => {
    expect(samePath("/money/", "/money")).toBe(true);
    expect(samePath("/", "/")).toBe(true);
    expect(samePath("/money", "/reports")).toBe(false);
  });

  it("every release has a unique id and every step says what it is now", () => {
    const ids = WHATS_NEW.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of WHATS_NEW) {
      expect(r.steps.length).toBeGreaterThan(0);
      for (const s of r.steps) {
        expect(s.after.trim()).not.toBe("");
        if (s.target) expect(s.path).toBeTruthy();
      }
    }
  });
});
