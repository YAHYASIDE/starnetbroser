import { describe, expect, it } from "vitest";
import { chatDeviceChoices } from "./chatDevices";

const dev = (id: string, name: string, extra: Record<string, string> = {}) => ({ id, name, kitNumber: "", ...extra });
const devices = [
  dev("d1", "DEMO 1", { clientId: "c1", expectedEmail: "first.demo@example.com", kitNumber: "KIT0001AAA", representativeId: "r1" }),
  dev("d2", "DEMO 2", { clientId: "c2", expectedEmail: "second@example.com", kitNumber: "KIT0002BBB", representativeId: "r2" }),
  dev("d3", "DEMO 3", { representativeId: "r1", deletedAt: "2026-11-01" }),
];
const clients: Record<string, string> = { c1: "زبون تجريبي", c2: "زبون آخر" };

describe("📡 a device in a conversation", () => {
  it("only the rep's devices (none deleted), by customer name, email or KIT", () => {
    expect(chatDeviceChoices(devices, (id) => clients[id], "", "r1").map((d) => d.id)).toEqual(["d1"]);
    expect(chatDeviceChoices(devices, (id) => clients[id], "تجريبي", null).map((d) => d.id)).toEqual(["d1"]);
    expect(chatDeviceChoices(devices, (id) => clients[id], "KIT0002", null)[0]!.id).toBe("d2"); // closest first (a typo away comes after)
    expect(chatDeviceChoices(devices, (id) => clients[id], "second", "r1")).toEqual([]);
    expect(chatDeviceChoices(devices, (id) => clients[id], "", null)[0]).toEqual({ id: "d1", name: "DEMO 1", hint: "زبون تجريبي · first.demo@example.com" });
  });
});
