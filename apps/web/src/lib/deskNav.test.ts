import { describe, expect, it } from "vitest";
import { deskNavGroups, isDeskNavActive } from "./deskNav";

describe("deskNavGroups", () => {
  it("groups every owner page once by what it is for", () => {
    const groups = deskNavGroups(false);
    expect(groups.map((g) => g.title)).toEqual(["العمل", "المال", "أدوات", "النظام"]);
    expect(groups[0].items.map((i) => i.href)).toEqual(["/", "/devices", "/clients", "/representatives", "/reminders"]);
    const all = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining(["/money", "/reports", "/store", "/starlink", "/currencies", "/tools", "/mailboxes", "/archive", "/trash", "/settings"]));
  });

  it("a rep sees only the pages he was given («الأجهزة» with «الرئيسية»)", () => {
    const groups = deskNavGroups(true, (p) => ["/", "/clients", "/settings"].includes(p));
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/", "/devices", "/clients", "/settings"]);
    expect(deskNavGroups(true, () => false)).toEqual([]);
  });
});

describe("isDeskNavActive", () => {
  it("matches the open page, with or without the trailing slash", () => {
    expect(isDeskNavActive("/", "/")).toBe(true);
    expect(isDeskNavActive("/", "/clients")).toBe(false);
    expect(isDeskNavActive("/clients", "/clients/")).toBe(true);
    expect(isDeskNavActive("/store", "/store/item")).toBe(true);
    expect(isDeskNavActive("/store", "/stores")).toBe(false);
    expect(isDeskNavActive("/", null)).toBe(true);
  });
});
