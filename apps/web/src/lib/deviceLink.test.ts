import { describe, expect, it } from "vitest";
import { activityNotification } from "./teamActivity";
import { chunkOps, compareCounts, isLinkedKey, loadPendingDeletions, joinAsLaptop, joinParts, splitOp, joinAsMember, linkCode, loadActivityLog, loadConflicts, loadLinkConfig, loadLinkState, loadOrigins, loadTeam, newPhoneLink, readLinkCode, runLinkRound, startAsPhone, type LinkStorage } from "./deviceLink";
import type { FetchFn } from "./firestoreRest";

/** Firestore + anonymous sign-in, in memory - only what firestoreRest.ts calls. */
function fakeFirebase(stats: { writes: number; reads: number } = { writes: 0, reads: 0 }): FetchFn {
  const docs = new Map<string, unknown>();
  return async (url, init) => {
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (url.includes("accounts:signUp")) return respond(200, { idToken: "t", refreshToken: "r", expiresIn: "3600" });
    if (url.endsWith(":batchGet")) {
      stats.reads += 1;
      const names = (JSON.parse(String(init?.body)) as { documents: string[] }).documents;
      return respond(200, names.map((name) => {
        const p = name.split("/documents/")[1] ?? "";
        return docs.has(p) ? { found: { name, ...(docs.get(p) as object) } } : { missing: name };
      }));
    }
    const path = decodeURIComponent(url.split("/documents/")[1] ?? "");
    if (init?.method === "PATCH") {
      stats.writes += 1;
      // Firestore refuses a document over 1 MiB
      if (String(init.body).length > 1_048_576) return respond(400, { error: { status: "INVALID_ARGUMENT", message: "Document too large" } });
      docs.set(path, JSON.parse(String(init.body)));
      return respond(200, {});
    }
    stats.reads += 1;
    return docs.has(path) ? respond(200, docs.get(path)) : respond(404, { error: { status: "NOT_FOUND" } });
  };
}

function memory(initial: Record<string, string> = {}): LinkStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    readAll: () => Object.fromEntries([...data].filter(([k]) => isLinkedKey(k))),
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
    expect(read.config).toMatchObject({ spaceId: made.config.spaceId, key: made.config.key });
    expect(read.config.memberId).toMatch(/^m[0-9a-f]{12}$/);
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

    // the same customer renamed on both: the phone (YAHYA, the main one) wins even though the laptop's is later -
    // his Nov 6 2026 choice; the laptop's is kept in its «تعارضات»
    phone.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "من الهاتف" } }));
    await runLinkRound(phone, firebase, new Date("2026-10-24T10:00:00Z"));
    laptop.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "من اللابتوب" } }));
    await runLinkRound(laptop, firebase, new Date("2026-10-24T10:05:00Z"));
    await runLinkRound(phone, firebase, new Date("2026-10-24T10:06:00Z"));
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!).c1.name).toBe("من الهاتف");
    expect(JSON.parse(laptop.data.get("starnet_clients_v1")!).c1.name).toBe("من الهاتف");
    expect(loadConflicts(laptop)).toHaveLength(1);
    expect(loadConflicts(laptop)[0]).toMatchObject({ kept: "remote", k: "starnet_clients_v1", r: "c1", lost: JSON.stringify({ id: "c1", name: "من اللابتوب" }) });

    // the other way: both in one round each, the phone's later - still the phone's
    laptop.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "لابتوب 2" } }));
    phone.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "هاتف 2" } }));
    await runLinkRound(laptop, firebase, new Date("2026-10-24T11:00:00Z"));
    await runLinkRound(phone, firebase, new Date("2026-10-24T11:01:00Z"));
    await runLinkRound(laptop, firebase, new Date("2026-10-24T11:02:00Z"));
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!).c1.name).toBe("هاتف 2");
    expect(JSON.parse(laptop.data.get("starnet_clients_v1")!).c1.name).toBe("هاتف 2");
  });

  it("👥 a team of three (his Oct 31 2026 «المسؤول 2»): every change reaches every member", async () => {
    const firebase = fakeFirebase();
    const phone = memory({ starnet_demo_accounts_v1: ledger([{ id: "a1", name: "DEMO 1" }]) });
    const laptop = memory();
    const admin2 = memory({ starnet_mine_v1: "[]" });
    const made = newPhoneLink(API, "my-project-123");
    if (!made.ok) throw new Error(made.message);
    startAsPhone(phone, made.config);
    const code = linkCode(made.config);
    const forLaptop = readLinkCode(code);
    const forAdmin = readLinkCode(code);
    if (!forLaptop.ok || !forAdmin.ok) throw new Error();
    expect(forLaptop.config.memberId).not.toBe(forAdmin.config.memberId);
    joinAsMember(laptop, forLaptop.config, "اللابتوب");
    joinAsMember(admin2, forAdmin.config, "المسؤول 2");
    expect(admin2.data.has("starnet_mine_v1")).toBe(false);

    const t = (m: number) => new Date(Date.UTC(2026, 9, 31, 10, m));
    await runLinkRound(phone, firebase, t(0));
    await runLinkRound(laptop, firebase, t(1));
    await runLinkRound(admin2, firebase, t(2));
    expect(JSON.parse(admin2.data.get("starnet_demo_accounts_v1")!)).toEqual([{ id: "a1", name: "DEMO 1" }]);
    expect(loadTeam(admin2).map((m) => m.name).sort()).toEqual(["اللابتوب", "المسؤول 2", "هاتفي"].sort());

    // «المسؤول 2» records a device: the phone and the laptop both get it (the team list is re-read after a minute)
    admin2.write("starnet_demo_accounts_v1", ledger([{ id: "a1", name: "DEMO 1" }, { id: "a2", name: "DEMO 2" }]));
    await runLinkRound(admin2, firebase, t(3));
    await runLinkRound(phone, firebase, t(10));
    await runLinkRound(laptop, firebase, t(11));
    expect(JSON.parse(phone.data.get("starnet_demo_accounts_v1")!).map((a: { id: string }) => a.id)).toEqual(["a1", "a2"]);
    expect(JSON.parse(laptop.data.get("starnet_demo_accounts_v1")!).map((a: { id: string }) => a.id)).toEqual(["a1", "a2"]);
    // the phone knows who added it, and logged it
    expect(loadOrigins(phone)["starnet_demo_accounts_v1|a2"]?.by).toBe("المسؤول 2");
    expect(loadActivityLog(phone)[0]).toMatchObject({ by: "المسؤول 2", kind: "add", label: "📡 جهاز DEMO 2", notable: true });

    // the phone renames it, the laptop removes a1: «المسؤول 2» ends with both, nothing echoes back
    phone.write("starnet_demo_accounts_v1", ledger([{ id: "a1", name: "DEMO 1" }, { id: "a2", name: "DEMO 2B" }]));
    await runLinkRound(phone, firebase, t(12));
    laptop.write("starnet_demo_accounts_v1", ledger([{ id: "a2", name: "DEMO 2" }]));
    await runLinkRound(laptop, firebase, t(13));
    await runLinkRound(admin2, firebase, t(14));
    expect(JSON.parse(admin2.data.get("starnet_demo_accounts_v1")!)).toEqual([{ id: "a2", name: "DEMO 2B" }]);
    const quiet = await runLinkRound(admin2, firebase, t(15));
    expect(quiet.sent).toBe(0);
  });

  it("an older phone ↔ laptop link still reads: its role is its member id, its one cursor the other side's", () => {
    const laptop = memory({
      "starnet.deviceLink": JSON.stringify({ apiKey: API, projectId: "my-project-123", spaceId: "a".repeat(24), key: "b".repeat(64), role: "laptop", enabled: true }),
      "starnet.deviceLinkState": JSON.stringify({ seq: 2, cursor: 5, confirmed: [], held: [] }),
    });
    expect(loadLinkConfig(laptop)).toMatchObject({ memberId: "laptop", name: "اللابتوب" });
    expect(loadLinkState(laptop).cursors).toEqual({ phone: 5 });
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

  it("📦 a big record (a rep's «تسجيلاتي» with sessions, his Nov 5 2026 report) goes in parts and arrives whole", async () => {
    const firebase = fakeFirebase();
    const big = "s".repeat(2_300_000); // over Firestore's 1 MiB, even before sealing
    const inbox = JSON.stringify({ files: [{ id: "f1", repId: "r1", file: big, pendingCount: 2 }], decisions: {} });
    const phone = memory({ starnet_rep_inbox_v1: inbox, starnet_clients_v1: ledger({ c1: { id: "c1", name: "زبون" } }), "starnet.repDeviceCodes": JSON.stringify({ r1: "CODE-FAKE" }), "starnet.telegramToken": "fake" });
    const admin2 = memory();
    const made = newPhoneLink(API, "my-project-123");
    if (!made.ok) throw new Error(made.message);
    startAsPhone(phone, made.config);
    const read = readLinkCode(linkCode(made.config));
    if (!read.ok) throw new Error();
    joinAsMember(admin2, read.config, "المسؤول 2");

    const sent = await runLinkRound(phone, firebase);
    expect(sent.ok).toBe(true);
    const got = await runLinkRound(admin2, firebase);
    expect(got.ok).toBe(true);
    const arrived = JSON.parse(admin2.data.get("starnet_rep_inbox_v1") ?? "null");
    expect(arrived?.files?.[0]?.file === big && arrived.files[0].repId === "r1").toBe(true);
    expect(admin2.data.has("starnet_clients_v1")).toBe(true);
    // the reps' codes come too (the second phone opens and approves his files) - other settings never do
    expect(admin2.data.get("starnet.repDeviceCodes")).toBe(JSON.stringify({ r1: "CODE-FAKE" }));
    expect(admin2.data.has("starnet.telegramToken")).toBe(false);
  });

  it("joins parts back, waits for missing ones, drops a half-written record", () => {
    const op = { k: "k", s: "single" as const, r: "_", v: "abcdefghij", at: "t" };
    const parts = splitOp(op, 4, () => "p1");
    expect(parts.map((p) => p.v)).toEqual(["abcd", "efgh", "ij"]);
    const small = { k: "x", s: "array" as const, r: "1", v: "1", at: "t" };
    // all here
    expect(joinParts([{ seq: 1, ops: [small, parts[0]!] }, { seq: 2, ops: [parts[1]!, parts[2]!] }], 2, true)).toEqual({ ops: [small, op], cursor: 2 });
    // the last part not read yet: back to before the first one (the small one before it stays)
    expect(joinParts([{ seq: 1, ops: [small] }, { seq: 2, ops: [parts[0]!] }, { seq: 3, ops: [parts[1]!] }], 3, false)).toEqual({ ops: [small], cursor: 1 });
    // the sender finished and it is still missing: never written - dropped, the reading moves on
    expect(joinParts([{ seq: 1, ops: [parts[0]!] }, { seq: 2, ops: [small] }], 2, true)).toEqual({ ops: [small], cursor: 2 });
  });

  it("⚡ in the middle of something only sends - nothing is written here, nothing read", async () => {
    const stats = { writes: 0, reads: 0 };
    const firebase = fakeFirebase(stats);
    const phone = memory({ starnet_clients_v1: ledger({ c1: { id: "c1", name: "زبون" } }) });
    const laptop = memory();
    const made = newPhoneLink(API, "my-project-123");
    if (!made.ok) throw new Error(made.message);
    startAsPhone(phone, made.config);
    const read = readLinkCode(linkCode(made.config));
    if (!read.ok) throw new Error();
    joinAsLaptop(laptop, read.config);
    await runLinkRound(phone, firebase);
    await runLinkRound(laptop, firebase);

    laptop.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "زبون" }, c2: { id: "c2", name: "جديد" } }));
    phone.write("starnet_demo_accounts_v1", ledger([{ id: "a1", name: "DEMO 1" }]));
    await runLinkRound(laptop, firebase);
    const quick = await runLinkRound(phone, firebase, new Date(), { sendOnly: true });
    expect(quick.sent).toBe(1);
    expect(quick.changedKeys).toEqual([]);
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!).c2).toBeUndefined();
    // nothing new here: no Firebase call at all
    const before = stats.reads + stats.writes;
    await runLinkRound(phone, firebase, new Date(), { sendOnly: true });
    expect(stats.reads + stats.writes).toBe(before);
    // then the full round brings the laptop's, and the laptop gets the phone's
    const full = await runLinkRound(phone, firebase);
    expect(full.changedKeys).toEqual(["starnet_clients_v1"]);
    await runLinkRound(laptop, firebase);
    expect(JSON.parse(laptop.data.get("starnet_demo_accounts_v1")!)).toEqual([{ id: "a1", name: "DEMO 1" }]);
  });

  async function pair() {
    const firebase = fakeFirebase();
    const phone = memory({
      starnet_demo_accounts_v1: ledger([{ id: "a1", name: "DEMO 1" }, { id: "a2", name: "DEMO 2" }]),
      starnet_clients_v1: ledger({ c1: { id: "c1", name: "زبون" } }),
      starnet_customer_ledger_v1: ledger({ a1: [{ id: "e1", amount: 100, currency: "MRU" }] }),
      starnet_cash_entries_v1: ledger([{ id: "k1", sourceId: "e1", amount: 100 }]),
    });
    const admin2 = memory();
    const made = newPhoneLink(API, "my-project-123");
    if (!made.ok) throw new Error(made.message);
    startAsPhone(phone, made.config);
    const read = readLinkCode(linkCode(made.config));
    if (!read.ok) throw new Error();
    joinAsMember(admin2, read.config, "المسؤول 2");
    await runLinkRound(phone, firebase);
    await runLinkRound(admin2, firebase);
    return { firebase, phone, admin2 };
  }

  it("🗑️ a deletion on «المسؤول 2» is applied on YAHYA at once (his Nov 26 2026) and shows in the log", async () => {
    const { firebase, phone, admin2 } = await pair();
    // «المسؤول 2» deletes a payment (and its cash entry goes with it) and adds a customer in the same round
    admin2.write("starnet_customer_ledger_v1", ledger({ a1: [] }));
    admin2.write("starnet_cash_entries_v1", ledger([]));
    admin2.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "زبون" }, c2: { id: "c2", name: "جديد" } }));
    await runLinkRound(admin2, firebase);
    const r = await runLinkRound(phone, firebase);
    expect(r.pending ?? 0).toBe(0);
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!).c2.name).toBe("جديد");
    expect(JSON.parse(phone.data.get("starnet_customer_ledger_v1")!).a1 ?? []).toHaveLength(0);
    expect(JSON.parse(phone.data.get("starnet_cash_entries_v1")!)).toHaveLength(0);
    expect(loadPendingDeletions(phone)).toHaveLength(0);
    // the log says who deleted what, and the round's notification leads with it
    const dels = loadActivityLog(phone).filter((a) => a.kind === "del");
    expect(dels.map((a) => a.label).sort()).toEqual(["💵 الكاش 100", "💵 عملية 100 أوقية"].sort());
    expect(dels.every((a) => a.by === "المسؤول 2" && a.notable)).toBe(true);
    expect(activityNotification(r.incoming)).toContain("🗑️ حذف من الفريق (2)");
    // and it reaches «المسؤول 2» side unchanged (nothing comes back)
    await runLinkRound(phone, firebase);
    await runLinkRound(admin2, firebase);
    expect(JSON.parse(admin2.data.get("starnet_cash_entries_v1")!)).toHaveLength(0);
  });

  it("🗑️ a device sent to the trash and a customer deleted on «المسؤول 2» reach YAHYA at once", async () => {
    const { firebase, phone, admin2 } = await pair();
    admin2.write("starnet_clients_v1", ledger({}));
    admin2.write("starnet_demo_accounts_v1", ledger([{ id: "a1", name: "DEMO 1", deletedAt: "2026-11-06" }, { id: "a2", name: "DEMO 2" }]));
    await runLinkRound(admin2, firebase);
    await runLinkRound(phone, firebase);
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!)).toEqual({});
    expect(JSON.parse(phone.data.get("starnet_demo_accounts_v1")!)[0].deletedAt).toBe("2026-11-06");
    expect(loadPendingDeletions(phone)).toHaveLength(0);
    // what YAHYA deletes goes the same way
    phone.write("starnet_clients_v1", ledger({ c9: { id: "c9", name: "آخر" } }));
    phone.write("starnet_clients_v1", ledger({}));
    await runLinkRound(phone, firebase);
    await runLinkRound(admin2, firebase);
    expect(JSON.parse(admin2.data.get("starnet_clients_v1")!)).toEqual({});
  });

  it("🔢 the copy counts each store and checks it against YAHYA; the % while it comes in", async () => {
    const { firebase, phone, admin2 } = await pair();
    await runLinkRound(phone, firebase);
    await runLinkRound(admin2, firebase);
    const st = loadLinkState(admin2);
    expect(st.counts?.starnet_demo_accounts_v1).toBe(2);
    expect(st.counts?.starnet_customer_ledger_v1).toBe(1);
    expect(compareCounts(st.counts!, st.theirCounts!.phone!.counts)).toEqual([]);
    expect(st.progress).toEqual({ done: 1, total: 1 });
    expect(compareCounts({ starnet_demo_accounts_v1: 170 }, { starnet_demo_accounts_v1: 171 })).toEqual([{ k: "starnet_demo_accounts_v1", label: "📡 الأجهزة", mine: 170, theirs: 171 }]);
  });

  async function phoneAndLaptop(initial: Record<string, string>) {
    const stats = { writes: 0, reads: 0 };
    const firebase = fakeFirebase(stats);
    const phone = memory(initial);
    const laptop = memory();
    const made = newPhoneLink(API, "my-project-123");
    if (!made.ok) throw new Error(made.message);
    startAsPhone(phone, made.config);
    const read = readLinkCode(linkCode(made.config));
    if (!read.ok) throw new Error();
    joinAsLaptop(laptop, read.config);
    await runLinkRound(phone, firebase);
    await runLinkRound(laptop, firebase);
    return { firebase, stats, phone, laptop };
  }

  it("💳 a D paid on another phone is not undone by the main phone's unpaid copy (his Nov 19 2026 report)", async () => {
    const pending = { id: "e1", kind: "debit", amount: 100, starlinkCost: { status: "pending", amount: 50 } };
    const { firebase, phone, laptop } = await phoneAndLaptop({ starnet_customer_ledger_v1: ledger({ d1: [pending] }) });
    // the laptop pays the D; meanwhile the main phone changed the same operation by itself (a bill read)
    const paid = { ...pending, starlinkCost: { status: "settled", amount: 50, paidAt: "2026-11-19", settledAt: "2026-11-19T10:00:00.000Z" } };
    laptop.write("starnet_customer_ledger_v1", ledger({ d1: [paid] }));
    phone.write("starnet_customer_ledger_v1", ledger({ d1: [{ ...pending, starlinkCost: { status: "pending", amount: 51 } }] }));
    await runLinkRound(laptop, firebase, new Date("2026-11-19T10:00:01Z"));
    await runLinkRound(phone, firebase, new Date("2026-11-19T10:00:05Z"));
    await runLinkRound(laptop, firebase, new Date("2026-11-19T10:00:06Z"));
    expect(JSON.parse(phone.data.get("starnet_customer_ledger_v1")!).d1[0].starlinkCost.status).toBe("settled");
    expect(JSON.parse(laptop.data.get("starnet_customer_ledger_v1")!).d1[0].starlinkCost.status).toBe("settled");

    // a real «إلغاء التسديد» made after the payment still wins
    const undone = { ...pending, starlinkCost: { status: "pending", amount: 50, unsettledAt: "2026-11-19T11:00:00.000Z" } };
    phone.write("starnet_customer_ledger_v1", ledger({ d1: [undone] }));
    laptop.write("starnet_customer_ledger_v1", ledger({ d1: [{ ...paid, note: "x" }] }));
    await runLinkRound(laptop, firebase, new Date("2026-11-19T11:00:01Z"));
    await runLinkRound(phone, firebase, new Date("2026-11-19T11:00:02Z"));
    await runLinkRound(laptop, firebase, new Date("2026-11-19T11:00:03Z"));
    expect(JSON.parse(laptop.data.get("starnet_customer_ledger_v1")!).d1[0].starlinkCost.status).toBe("pending");
  });

  it("📵 a full phone loses nothing: the team's changes come in once there is room", async () => {
    const { firebase, phone, laptop } = await phoneAndLaptop({ starnet_clients_v1: ledger({ c1: { id: "c1", name: "زبون" } }) });
    laptop.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "زبون" }, c2: { id: "c2", name: "جديد" } }));
    await runLinkRound(laptop, firebase);
    const write = phone.write;
    phone.write = () => {
      throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    };
    const refused = await runLinkRound(phone, firebase);
    expect(refused).toMatchObject({ ok: false, storageFull: true });
    phone.write = write;
    const later = await runLinkRound(phone, firebase);
    expect(later.ok).toBe(true);
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!).c2).toEqual({ id: "c2", name: "جديد" });
  });

  it("🔗 a change sent while busy reaches the others even when nothing else moves (his Nov 20 2026 report)", async () => {
    const { firebase, phone, laptop } = await phoneAndLaptop({ starnet_clients_v1: ledger({ c1: { id: "c1", name: "زبون" } }) });
    await runLinkRound(phone, firebase);
    // the admin edits a client while busy (a sheet open): only a send-only round runs, then he leaves the app
    laptop.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "زبون معدّل" } }));
    expect((await runLinkRound(laptop, firebase, new Date(), { sendOnly: true })).sent).toBe(1);
    // the main phone's next round sees it at once - it was never announced before
    const got = await runLinkRound(phone, firebase);
    expect(got.changedKeys).toEqual(["starnet_clients_v1"]);
    expect(JSON.parse(phone.data.get("starnet_clients_v1")!).c1.name).toBe("زبون معدّل");
    // and the same the other way: the main phone busy, the admin's full round gets it
    phone.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "زبون 2" } }));
    await runLinkRound(phone, firebase, new Date(), { sendOnly: true });
    await runLinkRound(phone, firebase); // a later full round with nothing else new
    expect((await runLinkRound(laptop, firebase)).changedKeys).toEqual(["starnet_clients_v1"]);
    expect(JSON.parse(laptop.data.get("starnet_clients_v1")!).c1.name).toBe("زبون 2");
  });

  it("🛡️ an old build can't move or unpin a pinned rate - it is refused and corrected (his Nov 21 2026 report)", async () => {
    const T1 = "2026-11-19T10:00:00.000Z";
    const eur = { code: "EUR", name: "يورو", symbol: "€", rateFromUsd: 0.86, updatedAt: T1, enabled: true, pinnedAt: T1 };
    const { firebase, phone, laptop } = await phoneAndLaptop({ starnet_currencies_v1: ledger({ EUR: eur }) });
    // the laptop (an older build) writes the euro at 0.2675 without the pin
    const { pinnedAt: _p, ...noPin } = eur;
    laptop.write("starnet_currencies_v1", ledger({ EUR: { ...noPin, rateFromUsd: 0.2675 } }));
    await runLinkRound(laptop, firebase);
    const got = await runLinkRound(phone, firebase);
    expect(got.refused).toBe(1);
    expect(JSON.parse(phone.data.get("starnet_currencies_v1")!).EUR).toEqual(eur);
    // the phone sent the pinned euro back: the laptop is corrected
    await runLinkRound(laptop, firebase);
    expect(JSON.parse(laptop.data.get("starnet_currencies_v1")!).EUR).toEqual(eur);
    // his unpin with the code (unpinnedAt) goes through
    phone.write("starnet_currencies_v1", ledger({ EUR: { ...noPin, unpinnedAt: "2026-11-21T09:00:00.000Z" } }));
    await runLinkRound(phone, firebase);
    await runLinkRound(laptop, firebase);
    expect(JSON.parse(laptop.data.get("starnet_currencies_v1")!).EUR.pinnedAt).toBeUndefined();
  });

  it("👥 two admins sync with each other while the main phone is off (his Nov 21 2026 report)", async () => {
    const { firebase, phone } = await phoneAndLaptop({ starnet_clients_v1: ledger({ c1: { id: "c1", name: "زبون" } }) });
    const made = loadLinkConfig(phone)!;
    const a = memory();
    const b = memory();
    const ra = readLinkCode(linkCode(made));
    const rb = readLinkCode(linkCode(made));
    if (!ra.ok || !rb.ok) throw new Error();
    joinAsMember(a, ra.config, "المسؤول 2");
    joinAsMember(b, rb.config, "المسؤول 3");
    await runLinkRound(a, firebase, new Date(Date.now() + 70_000));
    await runLinkRound(b, firebase, new Date(Date.now() + 70_000));
    await runLinkRound(a, firebase, new Date(Date.now() + 140_000));
    expect(JSON.parse(b.data.get("starnet_clients_v1")!).c1.name).toBe("زبون");
    // the main phone is off from here: A edits, B gets it
    a.write("starnet_clients_v1", ledger({ c1: { id: "c1", name: "زبون معدّل" } }));
    await runLinkRound(a, firebase, new Date(Date.now() + 200_000));
    await runLinkRound(b, firebase, new Date(Date.now() + 210_000));
    expect(JSON.parse(b.data.get("starnet_clients_v1")!).c1.name).toBe("زبون معدّل");
    // and a deletion on B reaches A (only the main phone holds deletions)
    b.write("starnet_clients_v1", ledger({}));
    await runLinkRound(b, firebase, new Date(Date.now() + 220_000));
    await runLinkRound(a, firebase, new Date(Date.now() + 230_000));
    expect(JSON.parse(a.data.get("starnet_clients_v1") ?? "{}").c1).toBeUndefined();
  });

  it("⚡ many batches come in a few requests", async () => {
    const { firebase, stats, phone, laptop } = await phoneAndLaptop({ starnet_clients_v1: ledger({}) });
    for (let i = 0; i < 30; i++) {
      const all = JSON.parse(laptop.data.get("starnet_clients_v1") ?? "{}");
      all[`c${i}`] = { id: `c${i}`, name: `زبون ${i}` };
      laptop.write("starnet_clients_v1", ledger(all));
      await runLinkRound(laptop, firebase, new Date(), { sendOnly: true });
    }
    await runLinkRound(laptop, firebase); // the full round publishes how many batches there are
    stats.reads = 0;
    await runLinkRound(phone, firebase);
    expect(Object.keys(JSON.parse(phone.data.get("starnet_clients_v1")!))).toHaveLength(30);
    // team + head + 2 batchGets (25 + 5) - was 30 reads of one batch each
    expect(stats.reads).toBeLessThanOrEqual(5);
  });
});

