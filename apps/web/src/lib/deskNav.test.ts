import { describe, expect, it } from "vitest";
import { deskNavGroups, isDeskNavActive } from "./deskNav";

describe("deskNavGroups", () => {
  it("lists every owner page once: the daily tabs first, then the rest", () => {
    const groups = deskNavGroups(false);
    expect(groups.map((g) => g.title)).toEqual(["اليومي", "المزيد"]);
    expect(groups[0].items.map((i) => i.href)).toEqual(["/", "/clients", "/money", "/representatives", "/reports"]);
    const all = groups.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("/settings");
  });

  it("a rep sees only the pages he was given", () => {
    const groups = deskNavGroups(true, (p) => ["/", "/clients", "/settings"].includes(p));
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/", "/clients", "/settings"]);
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
