import { describe, expect, it } from "vitest";
import { CLOUD_RULES, COMMIT_WRITES, diagnoseFirebase, EMPTY_CURSOR, MAX_RECORD_CHARS, docOp, newJoinCode, opFields, planCommits, recordDocId, sinceQuery, takeNew, uidOf, type CloudDoc } from "./cloudDb";
import type { SyncOp } from "./deviceSync";

const fb = { projectId: "p1" };
const op = (r: string, v: string | null, k = "starnet_clients_v1"): SyncOp => ({ k, s: "array", r, v, at: "2026-11-25T10:00:00.000Z" });

function doc(o: SyncOp, by: string, u: string): CloudDoc {
  return { name: `projects/p1/databases/(default)/documents/starnet/sp/records/${recordDocId(o.k, o.r)}`, fields: { ...opFields(o, by), u: { timestampValue: u } } };
}

describe("☁️ cloudDb - one record = one document", () => {
  it("a record's id is stable, path-safe and different per store / record", () => {
    const a = recordDocId("starnet_clients_v1", "c1");
    expect(a).toBe(recordDocId("starnet_clients_v1", "c1"));
    expect(a).not.toBe(recordDocId("starnet_clients_v1", "c2"));
    expect(a).not.toBe(recordDocId("starnet_cash_entries_v1", "c1"));
    expect(a).not.toMatch(/[/+=]/);
    expect(recordDocId("k", "دفعة/عربية")).not.toContain("/");
    expect(recordDocId("k", "x".repeat(3000)).length).toBeLessThan(100);
  });

  it("a change goes up and comes back the same (a deletion too)", () => {
    const set = op("c1", '{"id":"c1","name":"أحمد"}');
    const back = docOp(doc(set, "m1", "2026-11-25T10:00:01Z"));
    expect(back).toMatchObject({ k: set.k, s: "array", r: "c1", v: set.v, at: set.at, by: "m1" });
    const del = docOp(doc(op("c1", null), "m1", "2026-11-25T10:00:02Z"));
    expect(del?.v).toBeNull();
  });

  it("commits: ≤ the write limit each, every write stamps the server time, a too-big record is refused", () => {
    const ops = Array.from({ length: COMMIT_WRITES + 5 }, (_, i) => op(`c${i}`, `{"id":"c${i}"}`));
    ops.push(op("huge", "x".repeat(MAX_RECORD_CHARS + 1)));
    const { commits, tooBig } = planCommits(fb, "sp", ops, "m1");
    expect(commits.map((c) => c.length)).toEqual([COMMIT_WRITES, 5]);
    expect(commits[0]![0]!.updateTransforms).toEqual([{ fieldPath: "u", setToServerValue: "REQUEST_TIME" }]);
    expect(commits[0]![0]!.update.name).toContain("projects/p1/databases/(default)/documents/starnet/sp/records/");
    expect(tooBig.map((o) => o.r)).toEqual(["huge"]);
  });
});

describe("☁️ cloudDb - reading what changed", () => {
  it("skips my own changes and the ones already applied; the cursor moves to the newest", () => {
    const d1 = doc(op("c1", "{}"), "other", "2026-11-25T10:00:01Z");
    const d2 = doc(op("c2", "{}"), "me", "2026-11-25T10:00:02Z");
    const first = takeNew(EMPTY_CURSOR, [d1, d2], "me");
    expect(first.ops.map((o) => o.r)).toEqual(["c1"]);
    expect(first.cursor.u).toBe("2026-11-25T10:00:02Z");
    // the overlap reads them again: nothing twice
    const again = takeNew(first.cursor, [d1, d2], "me");
    expect(again.ops).toEqual([]);
    // the same record changed again later: read
    const d1b = doc(op("c1", '{"x":1}'), "other", "2026-11-25T10:00:05Z");
    expect(takeNew(again.cursor, [d1, d1b], "me").ops.map((o) => o.v)).toEqual(['{"x":1}']);
  });

  it("forgets seen documents older than the overlap window", () => {
    const old = doc(op("c1", "{}"), "o", "2026-11-25T10:00:00Z");
    const recent = doc(op("c2", "{}"), "o", "2026-11-25T10:10:00Z");
    const { cursor } = takeNew(EMPTY_CURSOR, [old, recent], "me");
    expect(Object.keys(cursor.seen)).toEqual([recordDocId("starnet_clients_v1", "c2")]);
  });

  it("the query starts before the cursor (a late commit is still read) and pages after the last one", () => {
    const q = sinceQuery({ u: "2026-11-25T10:10:00.000Z", seen: {} }, null);
    expect(q.structuredQuery.where.fieldFilter.value.timestampValue).toBe("2026-11-25T10:08:00.000Z");
    const p = sinceQuery(EMPTY_CURSOR, { u: "2026-11-25T10:00:00Z", name: "n1" });
    expect(p.structuredQuery.startAt?.values[1]).toEqual({ referenceValue: "n1" });
    expect(p.structuredQuery.where.fieldFilter.value.timestampValue).toBe("1970-01-01T00:00:00Z");
  });
});

describe("☁️ cloudDb - the lock", () => {
  it("the rules: records only for members, the join code never readable, the rest of the app unchanged", () => {
    expect(CLOUD_RULES).toContain("match /records/{id}");
    expect(CLOUD_RULES).toContain("allow read, write: if isMember();");
    expect(CLOUD_RULES).not.toMatch(/match \/private\/\{doc\} \{[^}]*allow read/);
    expect(CLOUD_RULES).toContain("!(col in ['records', 'members', 'private'])");
    // the rules already on his project stay
    expect(CLOUD_RULES).toContain("match /users/{uid}");
  });

  it("a join code is 16 easy characters; the uid is read from the token", () => {
    expect(newJoinCode()).toMatch(/^[a-z2-9]{16}$/);
    const payload = btoa(JSON.stringify({ user_id: "U1" })).replace(/=+$/, "");
    expect(uidOf(`x.${payload}.y`)).toBe("U1");
    expect(uidOf("bad")).toBeNull();
  });
});

describe("🔍 diagnoseFirebase", () => {
  it("says what Google answered, without the key", async () => {
    const fetchFn = async (url: string) =>
      url.includes("accounts:signUp")
        ? new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for key AIzaSyD-secret-key-123" } }), { status: 429 })
        : new Response("{}", { status: 404 });
    const lines = await diagnoseFirebase({ apiKey: "AIzaSyD-secret-key-123", projectId: "p1" }, "sp", fetchFn);
    expect(lines[0]).toBe("المشروع: p1");
    expect(lines[1]).toContain("429");
    expect(lines[1]).toContain("RESOURCE_EXHAUSTED");
    expect(lines.join(" ")).not.toContain("secret-key");
  });
});

