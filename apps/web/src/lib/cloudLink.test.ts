import { describe, expect, it } from "vitest";
import { isLinkedKey, joinAsMember, linkCode, loadCloud, moveTeamToCloud, newPhoneLink, readLinkCode, runLinkRound, startAsPhone, type LinkStorage } from "./deviceLink";
import type { FetchFn } from "./firestoreRest";

type Fields = Record<string, { stringValue?: string; booleanValue?: boolean; timestampValue?: string }>;

/**
 * Firestore with the NEW rules, in memory: the old link's documents (PATCH / GET / batchGet), and the cloud's commit /
 * runQuery / count - records readable only by members, «private» never readable. One shared server; each phone gets
 * its own fetch (its own uid).
 */
function cloudServer(opts: { newRules: boolean } = { newRules: true }) {
  const docs = new Map<string, { fields: Fields }>();
  let clock = Date.parse("2026-11-25T10:00:00Z");
  const members = () => [...docs.keys()].filter((p) => /^starnet\/[^/]+\/members\//.test(p)).map((p) => p.split("/").pop()!);
  const stats = { commits: 0, queries: 0 };
  const phone = (uid: string): FetchFn => async (url, init) => {
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const payload = btoa(JSON.stringify({ user_id: uid })).replace(/=+$/, "");
    if (url.includes("accounts:signUp")) return respond(200, { idToken: `x.${payload}.y`, refreshToken: "r", expiresIn: "3600" });
    const isMember = members().includes(uid);
    const denied = () => respond(403, { error: { status: "PERMISSION_DENIED" } });
    if (url.endsWith(":commit")) {
      stats.commits += 1;
      const writes = (JSON.parse(String(init?.body)) as { writes: { update: { name: string; fields: Fields }; updateTransforms?: unknown[]; currentDocument?: { exists: boolean } }[] }).writes;
      clock += 1000;
      for (const w of writes) {
        const p = w.update.name.split("/documents/")[1]!;
        if (opts.newRules && p.includes("/records/") && !isMember) return denied();
        if (opts.newRules && p.includes("/members/")) {
          const space = p.split("/")[1];
          const join = docs.get(`starnet/${space}/private/join`)?.fields.code?.stringValue;
          const owner = docs.get(`starnet/${space}`)?.fields.owner?.stringValue;
          if (p.split("/").pop() !== uid || (owner !== uid && w.update.fields.code?.stringValue !== join)) return denied();
        }
        if (w.currentDocument?.exists === false && docs.has(p)) return respond(400, { error: { status: "ALREADY_EXISTS" } });
      }
      for (const w of writes) {
        const p = w.update.name.split("/documents/")[1]!;
        const fields = { ...w.update.fields };
        if (w.updateTransforms?.length) fields.u = { timestampValue: new Date(clock).toISOString() };
        docs.set(p, { fields });
      }
      return respond(200, {});
    }
    if (url.endsWith(":runQuery")) {
      stats.queries += 1;
      if (opts.newRules && !isMember) return denied();
      const parent = decodeURIComponent(url.split("/documents/")[1]!.replace(":runQuery", ""));
      const q = (JSON.parse(String(init?.body)) as { structuredQuery: { where: { fieldFilter: { value: { timestampValue: string } } }; startAt?: { values: [{ timestampValue: string }, { referenceValue: string }] }; limit: number } }).structuredQuery;
      const from = q.where.fieldFilter.value.timestampValue;
      let rows = [...docs.entries()]
        .filter(([p, d]) => p.startsWith(`${parent}/records/`) && (d.fields.u?.timestampValue ?? "") >= from)
        .map(([p, d]) => ({ name: `projects/p/databases/(default)/documents/${p}`, fields: d.fields }))
        .sort((a, b) => (a.fields.u!.timestampValue! < b.fields.u!.timestampValue! ? -1 : a.fields.u!.timestampValue! > b.fields.u!.timestampValue! ? 1 : a.name < b.name ? -1 : 1));
      if (q.startAt) {
        const [u, n] = [q.startAt.values[0].timestampValue, q.startAt.values[1].referenceValue];
        rows = rows.filter((r) => r.fields.u!.timestampValue! > u || (r.fields.u!.timestampValue === u && r.name > n));
      }
      return respond(200, rows.slice(0, q.limit).map((document) => ({ document })));
    }
    if (url.endsWith(":runAggregationQuery")) {
      if (opts.newRules && !isMember) return denied();
      const parent = decodeURIComponent(url.split("/documents/")[1]!.replace(":runAggregationQuery", ""));
      const n = [...docs.entries()].filter(([p, d]) => p.startsWith(`${parent}/records/`) && d.fields.d?.booleanValue === false).length;
      return respond(200, [{ result: { aggregateFields: { n: { integerValue: String(n) } } } }]);
    }
    if (url.endsWith(":batchGet")) {
      const names = (JSON.parse(String(init?.body)) as { documents: string[] }).documents;
      return respond(200, names.map((name) => {
        const p = name.split("/documents/")[1] ?? "";
        return docs.has(p) ? { found: { name, ...docs.get(p) } } : { missing: name };
      }));
    }
    const path = decodeURIComponent(url.split("/documents/")[1] ?? "");
    if (init?.method === "PATCH") {
      docs.set(path, JSON.parse(String(init.body)) as { fields: Fields });
      return respond(200, {});
    }
    if (opts.newRules && path.includes("/private/")) return denied();
    return docs.has(path) ? respond(200, docs.get(path)) : respond(404, { error: { status: "NOT_FOUND" } });
  };
  return { phone, docs, stats };
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

async function team(newRules = true) {
  const server = cloudServer({ newRules });
  const main = memory({
    starnet_clients_v1: JSON.stringify([{ id: "c1", name: "زبون 1" }, { id: "c2", name: "زبون 2" }]),
    starnet_cash_entries_v1: JSON.stringify([{ id: "e1", amount: 500, currency: "MRU" }]),
    "starnet.activationPassword": "secret-not-for-the-cloud",
  });
  const admin = memory();
  const made = newPhoneLink(API, "my-project-123");
  if (!made.ok) throw new Error(made.message);
  startAsPhone(main, made.config);
  const read = readLinkCode(linkCode(made.config));
  if (!read.ok) throw new Error(read.message);
  joinAsMember(admin, read.config, "المسؤول 2");
  const mainF = server.phone("U-main");
  const adminF = server.phone("U-admin");
  // the old link first: the admin has everything
  await runLinkRound(main, mainF);
  await runLinkRound(admin, adminF);
  return { server, main, admin, mainF, adminF };
}

describe("☁️ the team on Firebase (his Nov 25 2026 choice)", () => {
  it("refuses to move while the old open rules are published", async () => {
    const { main, mainF } = await team(false);
    const r = await moveTeamToCloud(main, mainF);
    expect(r.ok).toBe(false);
    expect(loadCloud(main).on).toBe(false);
  });

  it("moves every business record (never the shared secrets), counted back by the server", async () => {
    const { server, main, mainF } = await team();
    const r = await moveTeamToCloud(main, mainF);
    expect(r).toEqual({ ok: true, sent: 3, counted: 3 });
    const records = [...server.docs.entries()].filter(([p]) => p.includes("/records/"));
    expect(records).toHaveLength(3);
    expect(records.some(([, d]) => (d.fields.v?.stringValue ?? "").includes("secret"))).toBe(false);
    expect(loadCloud(main).on).toBe(true);
  });

  it("the admin joins by itself, and changes go both ways through Firebase", async () => {
    const { server, main, admin, mainF, adminF } = await team();
    await moveTeamToCloud(main, mainF);
    // it looks for the main phone's note once a minute
    await runLinkRound(admin, adminF);
    expect(loadCloud(admin).on).toBe(false);
    await runLinkRound(admin, adminF, new Date(Date.now() + 61_000));
    expect(loadCloud(admin).on).toBe(true);
    // the admin adds a payment
    admin.write("starnet_cash_entries_v1", JSON.stringify([{ id: "e1", amount: 500, currency: "MRU" }, { id: "e2", amount: 70, currency: "MRU" }]));
    await runLinkRound(admin, adminF);
    expect([...server.docs.values()].some((d) => d.fields.r?.stringValue === "e2")).toBe(true);
    await runLinkRound(main, mainF);
    expect(JSON.parse(main.data.get("starnet_cash_entries_v1")!).map((e: { id: string }) => e.id)).toEqual(["e1", "e2"]);
    // the main phone renames a customer
    main.write("starnet_clients_v1", JSON.stringify([{ id: "c1", name: "زبون واحد" }, { id: "c2", name: "زبون 2" }]));
    await runLinkRound(main, mainF);
    await runLinkRound(admin, adminF);
    expect(JSON.parse(admin.data.get("starnet_clients_v1")!)[0].name).toBe("زبون واحد");
  });

  it("a phone that was off gets everything from Firebase alone (the main phone is off)", async () => {
    const { server, main, mainF } = await team();
    await moveTeamToCloud(main, mainF);
    // a new member, the old link's batches gone (only the cloud holds the state)
    for (const p of [...server.docs.keys()]) if (p.includes("/batches/")) server.docs.delete(p);
    const late = memory();
    const made = loadCloud(main);
    expect(made.on).toBe(true);
    const cfg = JSON.parse(main.data.get("starnet.deviceLink")!);
    joinAsMember(late, { ...cfg, memberId: "mlate000000", name: "جديد" }, "جديد");
    const f = server.phone("U-late");
    await runLinkRound(late, f); // joins
    await runLinkRound(late, f); // reads
    expect(JSON.parse(late.data.get("starnet_clients_v1") ?? "[]")).toHaveLength(2);
    expect(JSON.parse(late.data.get("starnet_cash_entries_v1") ?? "[]")).toHaveLength(1);
  });

  it("a stranger signed in to the same Firebase can't read or write the records", async () => {
    const { server, main, mainF } = await team();
    await moveTeamToCloud(main, mainF);
    const stranger = server.phone("U-stranger");
    const cfg = JSON.parse(main.data.get("starnet.deviceLink")!) as { spaceId: string };
    const res = await stranger(`https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/starnet/${cfg.spaceId}:runQuery`, {
      method: "POST",
      body: JSON.stringify({ structuredQuery: { where: { fieldFilter: { value: { timestampValue: "1970-01-01T00:00:00Z" } } }, limit: 10 } }),
    });
    expect(res.status).toBe(403);
  });

  it("a phone whose Firebase sign-in changed joins again by itself with its code", async () => {
    const { server, main, admin, mainF, adminF } = await team();
    await moveTeamToCloud(main, mainF);
    await runLinkRound(admin, adminF, new Date(Date.now() + 61_000));
    const newIdentity = server.phone("U-admin-2");
    await runLinkRound(admin, newIdentity); // refused, joins again
    main.write("starnet_cash_entries_v1", JSON.stringify([{ id: "e1", amount: 500, currency: "MRU" }, { id: "e9", amount: 9, currency: "MRU" }]));
    await runLinkRound(main, mainF);
    // remove the old link's batches: only Firebase can bring it
    for (const p of [...server.docs.keys()]) if (p.includes("/batches/")) server.docs.delete(p);
    await runLinkRound(admin, newIdentity);
    expect(JSON.parse(admin.data.get("starnet_cash_entries_v1")!).map((e: { id: string }) => e.id)).toContain("e9");
  });
});
