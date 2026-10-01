import { describe, expect, it } from "vitest";
import { passwordSuggestionsFor, usedPasswords } from "./usedPasswords";

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

  it("the mailbox offers the device's own codes first, then the most used ones", () => {
    const others = [
      { name: "a", wifiPassword: "demo-common" },
      { name: "b", wifiPassword: "demo-common" },
      { name: "c", expectedEmailPassword: "demo-rare" },
    ];
    const device = { name: "d", wifiPassword: "demo-wifi", starlinkPassword: "demo-common" };
    expect(passwordSuggestionsFor(device, others)).toEqual(["demo-common", "demo-wifi", "demo-rare"]);
    expect(passwordSuggestionsFor({ name: "e", expectedEmailPassword: "demo-mail" }, others, 2)).toEqual(["demo-mail", "demo-common"]);
  });
});
