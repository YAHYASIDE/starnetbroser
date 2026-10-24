import { describe, expect, it } from "vitest";
import { chunkOps, joinAsLaptop, linkCode, loadConflicts, newPhoneLink, readLinkCode, runLinkRound, startAsPhone, type LinkStorage } from "./deviceLink";
import type { FetchFn } from "./firestoreRest";

/** Firestore + anonymous sign-in, in memory - only what firestoreRest.ts calls. */
function fakeFirebase(): FetchFn {
  const docs = new Map<string, unknown>();
  return async (url, init) => {
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.includes("accounts:signUp")) return respond(200, { idToken: "t", refreshToken: "r", expiresIn: "3600" });
    const path = decodeURIComponent(url.split("/documents/")[1] ?? "");
    if (init?.method === "PATCH") {
      docs.set(path, JSON.parse(String(init.body)));
      return respond(200, {});
    }
    return docs.has(path) ? respond(200, docs.get(path)) : respond(404, { error: { status: "NOT_FOUND" } });
  };
}

function memory(initial: Record<string, string> = {}): LinkStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    readAll: () => Object.fromEntries([...data].filter(([k]) => k.startsWith("starnet_"))),
    read: (k) => data.get(k) ?? null,
    write: (k, v) => (v === null ? data.delete(k) : data.set(k, v)),
    getSetting: (k) => data.get(k) ?? null,
    setSetting: (k, v) => (v === null ? data.delete(k) : data.set(k, v)),
  };
}

const API = "AIzaSyD-fake-key-0123456789abcdefghijklmn";
const ledger = (o: unknown) => JSON.stringify(o);

describe("the phone ↔ laptop link", () => {
  it("pairs by code, carries everything both ways, and keeps a conflict", async () => {
    const firebase = fakeFirebase();
    const phone = memory({
      starnet_customer_ledger_v1: ledger({ d1: [{ id: "e1", amount: 100 }] }),
      starnet_clients_v1: ledger({ c1: { id: "c1", name: "زبون" } }),
    });
    const laptop = memory({ starnet_old_v1: "[]" });

    const made = newPhoneLink(API, "my-project-123");
    if (!made.ok) throw new Error(made.message);
    startAsPhone(phone, made.config);
    const code = linkCode(made.config);
    const read = readLinkCode(code);
    if (!read.ok) throw new Error(read.message);
    expect(read.config).toMatchObject({ role: "laptop", spaceId: made.config.spaceId, key: made.config.key });
    joinAsLaptop(laptop, read.config);
    expect(laptop.data.has("starnet_old_v1")).toBe(false);

    // phone sends all it has; the laptop receives it
    expect((await runLinkRound(phone, firebase)).sent).toBe(2);
    const got = await runLinkRound(laptop, firebase);
    expect(got.ok).toBe(true);
    expect(JSON.parse(laptop.data.get("starnet_customer_ledger_v1")!)).toEqual({ d1: [{ id: "e1", amount: 100 }] });
    expect(got.changedKeys.sort()).toEqual(["starnet_clients_v1", "starnet_customer_ledger_v1"]);

    // a payment on the laptop and another on the phone - both end on both
    laptop.write("starnet_customer_ledger_v1", ledger({ d1: [{ id: "e1", amount: 100 }, { id: "e2", amount: -50 }] }));
    phone.write("starnet_customer_ledger_v1", ledger({ d1: [{ id: "e1", amount: 100 }, { id: "e3", amount: 20 }] }));
    await runLinkRound(laptop, firebase);
    await runLinkRound(phone, firebase);
    await runLinkRound(laptop, firebase);
    const both = { d1: [{ id: "e1", amount: 100 }, { id: "e3", amount: 20 }, { id: "e2", amount: -50 }] };
    expect(JSON.parse(phone.data.get("starnet_customer_ledger_v1")!)).toEqual(both);
    expect(JSON.parse(laptop.data.get("starnet_customer_ledger_v1")!).d1).toHaveLength(3);

    // the same customer renamed on both: the later wins, the other is a conflict
    phone.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "من الهاتف" } }));
    await runLinkRound(phone, firebase, new Date("2026-10-24T10:00:00Z"));
    laptop.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "من اللابتوب" } }));
    await runLinkRound(laptop, firebase, new Date("2026-10-24T10:05:00Z"));
    await runLinkRound(phone, firebase, new Date("2026-10-24T10:06:00Z"));
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!).c1.name).toBe("من اللابتوب");
    expect(JSON.parse(laptop.data.get("starnet_clients_v1")!).c1.name).toBe("من اللابتوب");
    expect(loadConflicts(laptop)).toHaveLength(1);
    expect(loadConflicts(laptop)[0]).toMatchObject({ kept: "local", k: "starnet_clients_v1", r: "c1" });
  });

  it("refuses a wrong code and a wrong key", async () => {
    expect(readLinkCode("hello").ok).toBe(false);
    expect(readLinkCode("STARNET-LINK-abc").ok).toBe(false);
  });

  it("cuts big changes into batches", () => {
    const ops = Array.from({ length: 10 }, (_, i) => ({ k: "k", s: "array" as const, r: String(i), v: "x".repeat(100), at: "t" }));
    expect(chunkOps(ops, 300).length).toBeGreaterThan(3);
    expect(chunkOps(ops, 300).flat()).toHaveLength(10);
  });
});
