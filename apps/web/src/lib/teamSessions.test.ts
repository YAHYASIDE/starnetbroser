import { describe, expect, it } from "vitest";
import type { FetchFn } from "./firestoreRest";
import type { LinkConfig, TeamMember } from "./deviceLink";
import { runSessionRound, sessionFingerprint, sessionsToSend, sessionsToTake } from "./teamSessions";

// Fake data only - no real cookie.
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
    const local = { d1: { "https://starlink.com": "s=1" }, d2: {} };
    expect(sessionsToSend(local, {}, 0)).toEqual(["d1"]);
    const sent = { d1: { h: sessionFingerprint({ "https://starlink.com": "s=1" }), at: 0 } };
    expect(sessionsToSend(local, sent, 1)).toEqual([]);
    const changed = { d1: { "https://starlink.com": "s=2" } };
    expect(sessionsToSend(changed, sent, 60_000)).toEqual([]);
    expect(sessionsToSend(changed, sent, 6 * 3_600_000)).toEqual(["d1"]);
  });

  it("takes a newer session only where this phone has none - unless asked", () => {
    const newest = { d1: { member: "m1", at: 10 }, d2: { member: "m1", at: 10 } };
    const local = { d1: { u: "mine" } };
    expect(sessionsToTake(newest, {}, local, {}, false).map((t) => t.id)).toEqual(["d2"]);
    expect(sessionsToTake(newest, {}, local, {}, true).map((t) => t.id)).toEqual(["d1", "d2"]);
    expect(sessionsToTake(newest, { d2: 10 }, local, {}, false)).toEqual([]);
  });

  it("a device signed in on the phone opens signed in on «المسؤول 2», and is not sent back", async () => {
    const firebase = fakeFirebase();
    const phone = member("phone", { d1: { "https://starlink.com": "s=1" } });
    const admin = member("m1", {});
    expect(await runSessionRound(phone.deps(firebase, 1000))).toMatchObject({ ok: true, sent: 1 });
    expect(await runSessionRound(admin.deps(firebase, 2000))).toMatchObject({ ok: true, sent: 0, taken: 1 });
    expect(admin.jar.d1).toEqual({ "https://starlink.com": "s=1" });
    expect(await runSessionRound(admin.deps(firebase, 3000))).toMatchObject({ sent: 0, taken: 0 });
  });
});
