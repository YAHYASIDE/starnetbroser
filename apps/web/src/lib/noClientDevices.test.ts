import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { RepresentativeStore } from "./repStore";
import { countNoClient, hasNoClient, matchesNoClientGroup } from "./noClientDevices";

const clients = { c1: { id: "c1", name: "زبون" } } as unknown as ClientStore;
const reps = { r1: { id: "r1", name: "مندوب أ" }, r2: { id: "r2", name: "مندوب ب" } } as unknown as RepresentativeStore;
const dev = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: `جهاز ${id}`, ...extra }) as StarlinkAccountSummary;

const accounts = [
  dev("withClient", { clientId: "c1" }),
  dev("mine1"),
  dev("mine2", { clientId: "gone" }), // its client was deleted
  dev("r1a", { representativeId: "r1" }),
  dev("r1b", { representativeId: "r1" }),
  dev("r1Client", { representativeId: "r1", clientId: "c1" }),
  dev("r2a", { representativeId: "r2" }),
  dev("oldRep", { representativeId: "deleted" }),
];

describe("👤 devices without a customer", () => {
  it("a device without a client, or whose client is gone, has no customer", () => {
    expect(hasNoClient({ clientId: "c1" }, clients)).toBe(false);
    expect(hasNoClient({}, clients)).toBe(true);
    expect(hasNoClient({ clientId: "gone" }, clients)).toBe(true);
  });

  it("counts mine and each representative's, most first", () => {
    expect(countNoClient(accounts, clients, reps)).toEqual({
      total: 6,
      mine: 2,
      reps: [
        { repId: "r1", name: "مندوب أ", count: 2 },
        { repId: "r2", name: "مندوب ب", count: 1 },
        { repId: "deleted", name: "مندوب محذوف", count: 1 },
      ],
    });
  });

  it("filters by all / mine / one representative", () => {
    const ids = (group: string) => accounts.filter((a) => matchesNoClientGroup(a, clients, group)).map((a) => a.id);
    expect(ids("all")).toEqual(["mine1", "mine2", "r1a", "r1b", "r2a", "oldRep"]);
    expect(ids("mine")).toEqual(["mine1", "mine2"]);
    expect(ids("r1")).toEqual(["r1a", "r1b"]);
  });
});
