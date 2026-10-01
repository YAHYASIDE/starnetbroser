import { describe, expect, it } from "vitest";
import { usedPasswords } from "./usedPasswords";

// Fake values only.
const device = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra });

describe("usedPasswords", () => {
  it("lists every device password once, most used first, then the newest", () => {
    const list = usedPasswords([
      device("new", { wifiPassword: "demo-b" }),
      device("a", { wifiPassword: "demo-a", expectedEmailPassword: "demo-a" }),
      device("b", { starlinkPassword: "demo-a", extraEmails: [{ address: "x@y.z", password: "demo-c" }] }),
      device("c", { wifiPassword: "demo-c " }),
      device("gone", { wifiPassword: "demo-a", deletedAt: "2026-01-01" }),
    ]);
    expect(list.map((p) => [p.value, p.count])).toEqual([
      ["demo-a", 2],
      ["demo-c", 2],
      ["demo-b", 1],
    ]);
    expect(list[0]!.devices).toEqual(["a", "b"]);
  });

  it("is empty when no device has a password", () => {
    expect(usedPasswords([device("x")])).toEqual([]);
  });
});
