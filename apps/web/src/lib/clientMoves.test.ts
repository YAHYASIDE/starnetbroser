import { describe, expect, it } from "vitest";
import { clientDevicesWithHistory, detectClientMoves, entriesOfClient, entryOwner, type ClientMove } from "./clientMoves";

const e = (id: string, createdAt: string) => ({ id, createdAt });

describe("🔀 a device moved between customers keeps each one's operations", () => {
  it("a save that changes a device's customer is a move; a first link or the same customer is not", () => {
    const before = [{ id: "d1", clientId: "A" }, { id: "d2" }, { id: "d3", clientId: "C" }, { id: "d4", clientId: "A" }];
    const after = [{ id: "d1", clientId: "B" }, { id: "d2", clientId: "B" }, { id: "d3", clientId: "C" }, { id: "d4" }];
    expect(detectClientMoves(before, after, "T")).toEqual([
      { accountId: "d1", from: "A", to: "B", at: "T" },
      { accountId: "d4", from: "A", at: "T" },
    ]);
    expect(detectClientMoves(undefined, after, "T")).toEqual([]);
  });

  it("what was recorded before the move stays the old customer's, after it the new one's", () => {
    const moves: ClientMove[] = [{ accountId: "d1", from: "A", to: "B", at: "2026-11-05T10:00:00Z" }];
    const device = { id: "d1", clientId: "B" };
    const old = e("x", "2026-10-30T09:00:00Z");
    const fresh = e("y", "2026-11-05T11:00:00Z");
    expect(entryOwner(old, device, moves)).toBe("A");
    expect(entryOwner(fresh, device, moves)).toBe("B");
    expect(entriesOfClient([old, fresh], device, "A", moves).map((x) => x.id)).toEqual(["x"]);
    expect(entriesOfClient([old, fresh], device, "B", moves).map((x) => x.id)).toEqual(["y"]);
  });

  it("A → B → C: each one keeps his part", () => {
    const moves: ClientMove[] = [
      { accountId: "d1", from: "A", to: "B", at: "2026-11-01T00:00:00Z" },
      { accountId: "d1", from: "B", to: "C", at: "2026-11-03T00:00:00Z" },
    ];
    const device = { id: "d1", clientId: "C" };
    expect(entryOwner(e("a", "2026-10-30T00:00:00Z"), device, moves)).toBe("A");
    expect(entryOwner(e("b", "2026-11-02T00:00:00Z"), device, moves)).toBe("B");
    expect(entryOwner(e("c", "2026-11-04T00:00:00Z"), device, moves)).toBe("C");
  });

  it("a device never moved: all its operations are its customer's (as before)", () => {
    expect(entriesOfClient([e("x", "2026-01-01")], { id: "d9", clientId: "A" }, "A", [])).toHaveLength(1);
    expect(entriesOfClient([e("x", "2026-01-01")], { id: "d9", clientId: "A" }, "B", [])).toHaveLength(0);
  });

  it("the old customer still sees the device his operations are on", () => {
    const accounts = [{ id: "d1", clientId: "B" }, { id: "d2", clientId: "A" }, { id: "d3", clientId: "C" }];
    const moves: ClientMove[] = [{ accountId: "d1", from: "A", to: "B", at: "T" }];
    expect(clientDevicesWithHistory(accounts, "A", moves).map((a) => a.id)).toEqual(["d1", "d2"]);
    expect(clientDevicesWithHistory(accounts, "B", moves).map((a) => a.id)).toEqual(["d1"]);
  });
});
