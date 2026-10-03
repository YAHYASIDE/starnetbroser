import { describe, expect, it } from "vitest";
import { createSupplier, getSupplier, listSuppliers, searchSuppliers, Supplier, updateSupplier } from "./supplierStore";

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: "s1",
    name: "مورّد الأجهزة",
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("createSupplier", () => {
  it("trims the name/phone and assigns an id + timestamps", () => {
    const { store, supplier: created } = createSupplier({}, { name: "  مورّد الأجهزة  ", phone: "  22212345  " });
    expect(created.name).toBe("مورّد الأجهزة");
    expect(created.phone).toBe("22212345");
    expect(created.id).toBeTruthy();
    expect(store[created.id]).toEqual(created);
  });

  it("omits phone entirely when not given", () => {
    const { supplier: created } = createSupplier({}, { name: "مورّد بلا هاتف" });
    expect(created.phone).toBeUndefined();
  });
});

describe("updateSupplier", () => {
  it("updates name/phone and bumps updatedAt, leaving id/createdAt untouched", () => {
    const store = { s1: supplier() };
    const updated = updateSupplier(store, "s1", { name: "مورّد جديد", phone: "600" });
    expect(updated.s1.name).toBe("مورّد جديد");
    expect(updated.s1.phone).toBe("600");
    expect(updated.s1.id).toBe("s1");
    expect(updated.s1.createdAt).toBe("2026-09-20T10:00:00.000Z");
  });

  it("is a no-op for an unknown supplierId", () => {
    const store = { s1: supplier() };
    expect(updateSupplier(store, "does-not-exist", { name: "x" })).toEqual(store);
  });
});

describe("getSupplier", () => {
  it("returns undefined for an undefined supplierId", () => {
    expect(getSupplier({ s1: supplier() }, undefined)).toBeUndefined();
  });

  it("returns the matching supplier", () => {
    const store = { s1: supplier() };
    expect(getSupplier(store, "s1")).toEqual(store.s1);
  });
});

describe("listSuppliers / searchSuppliers", () => {
  const store = {
    a: supplier({ id: "a", name: "سالم للتوريد", phone: "22211111" }),
    b: supplier({ id: "b", name: "أحمد للأجهزة", phone: "22222222" }),
    c: supplier({ id: "c", name: "خديجة للاكسسوارات", phone: "22233333" }),
  };

  it("listSuppliers sorts by name", () => {
    expect(listSuppliers(store).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("searchSuppliers with an empty query returns everyone, sorted", () => {
    expect(searchSuppliers(store, "").map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("searchSuppliers matches by partial name, case-insensitively", () => {
    expect(searchSuppliers(store, "حمد").map((s) => s.id)).toEqual(["b"]);
  });

  it("searchSuppliers matches by partial phone", () => {
    expect(searchSuppliers(store, "3333").map((s) => s.id)).toEqual(["c"]);
  });

  it("searchSuppliers returns nothing for a non-matching query", () => {
    expect(searchSuppliers(store, "zzz")).toEqual([]);
  });
});
