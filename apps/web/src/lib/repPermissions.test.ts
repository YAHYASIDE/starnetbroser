import { describe, expect, it } from "vitest";
import { allowedPaths, basePermissions, featureSections, foldArabic, pathAllowed, permissionChanges, permissionsOf, REP_FEATURES, SIMPLE_ADD_DEVICE } from "./repPermissions";
import { keepPermissions, type Representative } from "./repStore";

describe("🔑 صلاحيات المندوب (his Oct 17 2026 ask)", () => {
  it("a rep with no list has exactly what every rep had: the same pages as before", () => {
    const perms = permissionsOf({});
    expect(allowedPaths(perms).sort()).toEqual(["/", "/clients", "/currencies", "/mailboxes", "/reminders", "/reports", "/representatives", "/settings", "/tools"]);
    for (const no of ["/store", "/starlink", "/archive", "/trash", "/money"]) expect(perms.has(`page:${no.slice(1)}`)).toBe(false);
    expect(perms.has("data:backup")).toBe(false);
  });

  it("✂️ «إضافة جهاز مبسّطة» is a restriction: off for every rep until he ticks it (his Oct 25 2026 ask for الحافظ)", () => {
    expect(basePermissions()).not.toContain(SIMPLE_ADD_DEVICE);
    expect(permissionsOf({}).has(SIMPLE_ADD_DEVICE)).toBe(false);
    expect(permissionsOf({ permissions: ["page:clients"] }).has(SIMPLE_ADD_DEVICE)).toBe(false);
    expect(permissionsOf({ permissions: [SIMPLE_ADD_DEVICE] }).has(SIMPLE_ADD_DEVICE)).toBe(true);
    expect(featureSections("مبسطه").flatMap((s) => s.features.map((f) => f.id))).toEqual([SIMPLE_ADD_DEVICE]);
  });

  it("ticking a page opens it, the always-on ones can't be removed", () => {
    const perms = permissionsOf({ permissions: ["page:store"] });
    expect(pathAllowed("/store/", allowedPaths(perms))).toBe(true);
    expect(pathAllowed("/clients", allowedPaths(perms))).toBe(false);
    expect(perms.has("page:home") && perms.has("page:settings") && perms.has("data:lock")).toBe(true);
  });

  it("sorted by group then name, and searchable in Arabic without diacritics or hamza", () => {
    const sections = featureSections();
    expect(sections.map((s) => s.id)).toEqual(["pages", "devices", "sync", "alerts", "data"]);
    for (const s of sections) {
      const labels = s.features.map((f) => f.label);
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "ar")));
    }
    expect(featureSections().flatMap((s) => s.features)).toHaveLength(REP_FEATURES.length);
    expect(featureSections("الارشيف").flatMap((s) => s.features.map((f) => f.id))).toEqual(["page:archive"]);
    expect(featureSections("فاتورة").flatMap((s) => s.features.map((f) => f.id))).toEqual(["page:store"]);
    expect(featureSections("zzz")).toEqual([]);
    expect(foldArabic("الأرشيفُ")).toBe("الارشيف");
  });

  it("says what is added and removed", () => {
    const before = permissionsOf({});
    const after = new Set([...before, "page:store"]);
    after.delete("page:reports");
    expect(permissionChanges(before, after)).toEqual({ added: ["المتجر"], removed: ["التقارير"] });
    expect(basePermissions()).toContain("page:clients");
  });

  it("a screen with an older list of reps never drops a saved permission list", () => {
    const rep = { id: "r1", name: "x", commissionPercent: 0 } as Representative;
    const out = keepPermissions({ r1: rep }, { r1: { ...rep, permissions: ["page:store"] } });
    expect(out.r1.permissions).toEqual(["page:store"]);
    expect(keepPermissions({ r1: { ...rep, permissions: [] } }, { r1: { ...rep, permissions: ["page:store"] } }).r1.permissions).toEqual([]);
  });
});
