// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { addCategory, categoriesOf, categoryCounts, GENERAL, loadClientCategories, matchesStanding, removeCategory, saveClientCategories, STARLINK } from "./clientCategories";

describe("🏷️ the customers' categories (his Oct 19 2026 design)", () => {
  const own = [{ id: "c-shop", name: "المحل", color: "#1baf7a" }];

  it("📡 with devices, 👤 without - or with store sales, or tagged; one account in several categories", () => {
    expect(categoriesOf({ deviceCount: 13, hasStoreRecords: false })).toEqual([STARLINK]);
    expect(categoriesOf({ deviceCount: 0, hasStoreRecords: false })).toEqual([GENERAL]);
    expect(categoriesOf({ deviceCount: 2, hasStoreRecords: true })).toEqual([STARLINK, GENERAL]);
    expect(categoriesOf({ deviceCount: 2, hasStoreRecords: false, tags: [GENERAL, "c-shop", "gone"] }, own)).toEqual([STARLINK, GENERAL, "c-shop"]);
    // added inside «ستارلينك», no device yet → still a Starlink customer
    expect(categoriesOf({ deviceCount: 0, hasStoreRecords: false, tags: [STARLINK] })).toEqual([STARLINK]);
  });

  it("counts per category, «الكل» = everyone once", () => {
    const counts = categoryCounts([{ categories: [STARLINK] }, { categories: [STARLINK, GENERAL] }, { categories: [GENERAL] }]);
    expect(counts).toEqual({ all: 3, [STARLINK]: 2, [GENERAL]: 2 });
  });

  it("the standing filter", () => {
    expect(matchesStanding("due", "owes")).toBe(true);
    expect(matchesStanding("credit", "owes")).toBe(false);
    expect(matchesStanding("clear", "even")).toBe(true);
    expect(matchesStanding("credit", "all")).toBe(true);
  });

  it("own categories: a unique name and a color; kept with the business data", () => {
    const added = addCategory([], "  المحل ", "#1baf7a", "c1");
    expect(added).toEqual({ ok: true, list: [{ id: "c1", name: "المحل", color: "#1baf7a" }] });
    expect(addCategory(own, "المحل", "#1baf7a")).toEqual({ ok: false, message: "هذا التصنيف موجود" });
    expect(addCategory(own, "ستارلينك", "#1baf7a")).toMatchObject({ ok: false });
    expect(addCategory(own, " ", "#1baf7a")).toMatchObject({ ok: false });
    expect(removeCategory(own, "c-shop")).toEqual([]);
    saveClientCategories(own);
    expect(loadClientCategories()).toEqual(own);
    expect(Object.keys(window.localStorage).some((k) => k.startsWith("starnet_"))).toBe(true); // in the backup
  });
});
