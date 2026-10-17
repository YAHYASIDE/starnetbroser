import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { deviceTwins, isMarkedNotDuplicate, notDuplicatePatches } from "./deviceMerge";

const device = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: id, kitNumber: "KIT-DEMO-1", ...extra }) as StarlinkAccountSummary;

describe("🔗 «✕» on «مكرّر» - two different devices (his Oct 17 2026 ask)", () => {
  it("both remember each other, and the pair is never a twin again", () => {
    const a = device("a");
    const b = device("b");
    expect(deviceTwins([a, b]).size).toBe(2);
    const patches = notDuplicatePatches(a, b);
    expect(patches).toEqual([{ id: "a", patch: { notDuplicateOf: ["b"] } }, { id: "b", patch: { notDuplicateOf: ["a"] } }]);
    const a2 = { ...a, ...patches[0].patch };
    expect(isMarkedNotDuplicate(a2, b)).toBe(true);
    expect(deviceTwins([a2, b]).size).toBe(0);
  });

  it("a third device with the same KIT is still a twin", () => {
    const a = device("a", { notDuplicateOf: ["b"] });
    const twins = deviceTwins([a, device("b"), device("c")]);
    expect(twins.get("a")?.id).toBe("c");
  });
});
