import { describe, expect, it } from "vitest";
import type { FetchFn } from "./firestoreRest";
import type { LinkConfig, TeamMember } from "./deviceLink";
import { cleanSent, isSignedInSession, runSessionRound, sessionsNoteText, sessionFingerprint, sessionsToSend, sessionsToTake } from "./teamSessions";

// Fake data only - no real cookie.
const IN = (v: string) => ({ "https://starlink.com": `_ga=x; Starlink.Com.Access.V1=chunks-2; Starlink.Com.Access.V1C1=${v}` });
const OUT = { "https://starlink.com": "_ga=x; cf_bm=y" };
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

const base = { apiKey: "AIzaSyD-fake-key-0123456789abcdefghijklmn", projectId: "my-project-123", spaceId: "a".repeat(24), key: "b".repeat(64), enabled: true };
const team: TeamMember[] = [
  { id: "phone", name: "هاتفي", at: "" },
  { id: "m1", name: "المسؤول 2", at: "" },
];

function member(memberId: string, cookies: Record<string, Record<string, string>>) {
  const settings = new Map<string, string>();
  const jar = { ...cookies };
  return {
    jar,
    deps: (fetchFn: FetchFn, now: number) => ({
      config: { ...base, memberId, name: memberId } as LinkConfig,
      team,
      accountIds: ["d1", "d2"],
      exportSessions: async (ids: string[]) => Object.fromEntries(ids.filter((id) => jar[id]).map((id) => [id, jar[id]!])),
      importSessions: async (s: Record<string, Record<string, string>>) => {
        Object.assign(jar, s);
        return { ok: true, importedCount: Object.keys(s).length };
      },
      getSetting: (k: string) => settings.get(k) ?? null,
      setSetting: (k: string, v: string | null) => (v === null ? settings.delete(k) : settings.set(k, v)),
      fetchFn,
      now,
    }),
  };
}

describe("🔐 Starlink sessions in the team (his Oct 31 2026 choice)", () => {
  it("sends a new session, resends a changed one only after 6 hours", () => {
    const local = { d1: IN("1"), d2: {}, d3: OUT };
    expect(sessionsToSend(local, {}, 0)).toEqual(["d1"]);
    const sent = { d1: { h: sessionFingerprint(IN("1")), at: 0 } };
    expect(sessionsToSend(local, sent, 1)).toEqual([]);
    const changed = { d1: IN("2") };
    expect(sessionsToSend(changed, sent, 60_000)).toEqual([]);
    expect(sessionsToSend(changed, sent, 6 * 3_600_000)).toEqual(["d1"]);
  });

  it("takes a newer session only where this phone has none - unless asked", () => {
    const newest = { d1: { member: "m1", at: 10 }, d2: { member: "m1", at: 10 } };
    const local = { d1: IN("mine"), d2: OUT };
    expect(sessionsToTake(newest, {}, local, {}, false).map((t) => t.id)).toEqual(["d2"]);
    // signed out here: what this phone sent before (an older build sent the empty one) doesn't stop it
    expect(sessionsToTake(newest, {}, local, { d2: { h: "x", at: 99 } }, false).map((t) => t.id)).toEqual(["d2"]);
    expect(sessionsToTake(newest, {}, local, {}, true).map((t) => t.id)).toEqual(["d1", "d2"]);
    expect(sessionsToTake(newest, { d2: 10 }, local, {}, false)).toEqual([]);
  });

  it("a device signed in on the phone opens signed in on «المسؤول 2», and is not sent back", async () => {
    const firebase = fakeFirebase();
    const phone = member("phone", { d1: IN("1") });
    const admin = member("m1", {});
    expect(await runSessionRound(phone.deps(firebase, 1000))).toMatchObject({ ok: true, sent: 1 });
    expect(await runSessionRound(admin.deps(firebase, 2000))).toMatchObject({ ok: true, sent: 0, taken: 1 });
    expect(admin.jar.d1).toEqual(IN("1"));
    expect(await runSessionRound(admin.deps(firebase, 3000))).toMatchObject({ sent: 0, taken: 0 });
  });

  it("🔑 tells a Starlink sign-in from what any visit leaves", () => {
    expect(isSignedInSession(IN("abc"))).toBe(true);
    expect(isSignedInSession({ "Starlink.Com.Access.V1": "chunks-1" })).toBe(true);
    expect(isSignedInSession(OUT)).toBe(false);
    expect(isSignedInSession({ "https://starlink.com": "Starlink.Com.Access.V1=" })).toBe(false);
    expect(isSignedInSession(undefined)).toBe(false);
    expect(cleanSent({ d1: { h: "a", at: 1 }, d2: { h: "b", at: 2 } }, { d1: IN("1"), d2: OUT })).toEqual({ sent: { d1: { h: "a", at: 1 } }, dropped: 1 });
  });

  it("his Nov 5 2026 report: «المسؤول 2» opened the devices signed out first - the team's sessions still come in", async () => {
    const firebase = fakeFirebase();
    const phone = member("phone", { d1: IN("1"), d2: IN("2") });
    // «المسؤول 2» opened both devices once (signed out), and an older build sent those as its own, newer
    const admin = member("m1", { d1: OUT, d2: OUT });
    expect(await runSessionRound(phone.deps(firebase, 1000))).toMatchObject({ ok: true, sent: 2 });
    const older = admin.deps(firebase, 2000);
    older.setSetting("starnet.teamSessionsSent", JSON.stringify({ d1: { h: "x", at: 2000 }, d2: { h: "y", at: 2000 } }));
    // its round: nothing of its own goes out, both of the phone's come in
    expect(await runSessionRound(older)).toMatchObject({ ok: true, sent: 0, taken: 2 });
    expect(admin.jar.d1).toEqual(IN("1"));
    expect(admin.jar.d2).toEqual(IN("2"));
    // the phone, asked to take the team's («📥»), never gets an empty one back
    expect(await runSessionRound(phone.deps(firebase, 3000), true)).toMatchObject({ ok: true });
    expect(phone.jar.d1).toEqual(IN("1"));
  });

  it("a ticket under another name shows by its size; the note says where a session stops", async () => {
    expect(isSignedInSession({ "https://starlink.com": `x=1; Starlink.Com.Sso=t` })).toBe(true);
    expect(isSignedInSession({ "https://api.starlink.com": `tk=${"a".repeat(1200)}` })).toBe(true);
    expect(isSignedInSession({ "https://starlink.com": `tk=${"a".repeat(300)}` })).toBe(false);
    const firebase = fakeFirebase();
    const phone = member("phone", { d1: IN("1"), d2: OUT });
    const admin = member("m1", { d1: OUT });
    const p = await runSessionRound(phone.deps(firebase, 1000));
    expect(sessionsNoteText(p)).toBe("🔐 هنا: 1 مسجّلة · 1 بلا دخول | من الفريق: 0 متاحة · أُخذت 0 | أُرسلت 1");
    const a = await runSessionRound(admin.deps(firebase, 2000), true);
    expect(sessionsNoteText(a)).toBe("🔐 هنا: 1 مسجّلة · 0 بلا دخول | من الفريق: 1 متاحة · أُخذت 1 | أُرسلت 0");
    expect(sessionsNoteText({ ok: false, sent: 0, taken: 0, message: "الربط غير مفعّل" })).toBe("⚠️ الجلسات: الربط غير مفعّل");
  });
});
