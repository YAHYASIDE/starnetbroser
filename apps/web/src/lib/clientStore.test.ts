import { describe, expect, it } from "vitest";
import {
  Client,
  countLinkedAccounts,
  createClient,
  deleteClient,
  getClient,
  listClients,
  searchClients,
  updateClient,
} from "./clientStore";

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "محمد أحمد",
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("createClient", () => {
  it("trims the name/phone and assigns an id + timestamps", () => {
    const { store, client: created } = createClient({}, { name: "  محمد أحمد  ", phone: "  22212345  " });
    expect(created.name).toBe("محمد أحمد");
    expect(created.phone).toBe("22212345");
    expect(created.id).toBeTruthy();
    expect(store[created.id]).toEqual(created);
  });

  it("omits phone entirely when not given", () => {
    const { client: created } = createClient({}, { name: "زبون بلا هاتف" });
    expect(created.phone).toBeUndefined();
  });

  it("gives two calls distinct ids without mutating the input store", () => {
    const store = {};
    const a = createClient(store, { name: "أ" });
    const b = createClient(store, { name: "ب" });
    expect(a.client.id).not.toBe(b.client.id);
    expect(store).toEqual({});
  });
});

describe("updateClient", () => {
  it("updates name/phone and bumps updatedAt, leaving id/createdAt untouched", () => {
    const store = { c1: client() };
    const updated = updateClient(store, "c1", { name: "محمد علي", phone: "600" });
    expect(updated.c1.name).toBe("محمد علي");
    expect(updated.c1.phone).toBe("600");
    expect(updated.c1.id).toBe("c1");
    expect(updated.c1.createdAt).toBe("2026-09-20T10:00:00.000Z");
  });

  it("is a no-op for an unknown clientId", () => {
    const store = { c1: client() };
    expect(updateClient(store, "does-not-exist", { name: "x" })).toEqual(store);
  });

  it("does not mutate the input store", () => {
    const store = { c1: client() };
    updateClient(store, "c1", { name: "محمد علي" });
    expect(store.c1.name).toBe("محمد أحمد");
  });
});

describe("getClient", () => {
  it("returns undefined for an undefined clientId", () => {
    expect(getClient({ c1: client() }, undefined)).toBeUndefined();
  });

  it("returns undefined for an unknown clientId", () => {
    expect(getClient({ c1: client() }, "nope")).toBeUndefined();
  });

  it("returns the matching client", () => {
    const store = { c1: client() };
    expect(getClient(store, "c1")).toEqual(store.c1);
  });
});

describe("listClients / searchClients", () => {
  const store = {
    a: client({ id: "a", name: "سالم", phone: "22211111" }),
    b: client({ id: "b", name: "أحمد", phone: "22222222" }),
    c: client({ id: "c", name: "خديجة", phone: "22233333" }),
  };

  it("listClients sorts by name", () => {
    expect(listClients(store).map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("searchClients with an empty query returns everyone, sorted", () => {
    expect(searchClients(store, "").map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("searchClients matches by partial name, case-insensitively", () => {
    expect(searchClients(store, "حمد").map((c) => c.id)).toEqual(["b"]);
  });

  it("searchClients matches by partial phone", () => {
    expect(searchClients(store, "3333").map((c) => c.id)).toEqual(["c"]);
  });

  it("searchClients returns nothing for a non-matching query", () => {
    expect(searchClients(store, "zzz")).toEqual([]);
  });
});

describe("countLinkedAccounts", () => {
  it("counts only accounts whose clientId matches", () => {
    const accounts = [{ clientId: "c1" }, { clientId: "c2" }, { clientId: "c1" }, {}];
    expect(countLinkedAccounts(accounts, "c1")).toBe(2);
    expect(countLinkedAccounts(accounts, "c2")).toBe(1);
    expect(countLinkedAccounts(accounts, "c3")).toBe(0);
  });
});

describe("deleteClient", () => {
  it("removes the client record", () => {
    const store = { c1: client() };
    expect(deleteClient(store, "c1")).toEqual({});
  });

  it("is a no-op for an unknown clientId", () => {
    const store = { c1: client() };
    expect(deleteClient(store, "does-not-exist")).toEqual(store);
  });

  it("does not mutate the input store", () => {
    const store = { c1: client() };
    deleteClient(store, "c1");
    expect(store).toEqual({ c1: client() });
  });

  it("leaves every other client untouched", () => {
    const store = { a: client({ id: "a" }), b: client({ id: "b", name: "آخر" }) };
    const next = deleteClient(store, "a");
    expect(next).toEqual({ b: client({ id: "b", name: "آخر" }) });
  });
});
