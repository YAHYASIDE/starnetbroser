import { describe, expect, it } from "vitest";
import { searchApp } from "./appSearch";

const empty = { clients: [], suppliers: [], representatives: [], items: [], devices: [] };

describe("searchApp - the settings search over the whole app", () => {
  it("finds a setting by its title or a keyword (Arabic letters folded)", () => {
    expect(searchApp("بصمة", empty).map((h) => (h.kind === "setting" ? h.item.id : h.kind))).toEqual(["lock"]);
    expect(searchApp("telegram", empty).some((h) => h.kind === "setting" && h.item.id === "telegram")).toBe(true);
    expect(searchApp("كلمات السر", empty)[0]).toMatchObject({ kind: "setting", item: { id: "passwords" } });
  });

  it("finds pages, devices and customers, each opening the home search on it", () => {
    const hits = searchApp("demo", {
      ...empty,
      clients: [{ id: "c1", name: "Demo Client" }],
      devices: [{ id: "d1", name: "Demo Device", kitNumber: "KIT-0001", serialNumber: "" }],
    });
    expect(hits.map((h) => h.kind)).toEqual(["device", "client"]);
    expect(hits[0]).toMatchObject({ title: "Demo Device", route: "/?q=Demo%20Device" });
    expect(searchApp("التقارير", empty)[0]).toMatchObject({ kind: "page", route: "/reports" });
    expect(searchApp("  ", empty)).toEqual([]);
  });
});
