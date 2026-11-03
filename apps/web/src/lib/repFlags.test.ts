// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  addIncomingFlags,
  markFlagSent,
  markOwnerFlagReviewed,
  newRepFlag,
  openFlagsForDevice,
  openOwnerFlags,
  outboxForDevice,
  ownerFlagMessage,
  parseFlagPayload,
  queueFlag,
  repReviewedMessage,
  unsentFlags,
  type RepFlag,
} from "./repFlags";
import { pullFlags, pushFlags } from "./repFlagLink";
import type { FetchFn } from "./firestoreRest";
import { newLinkKey } from "./deviceSyncCrypto";

const flag = (over: Partial<RepFlag> = {}): RepFlag => ({ id: "0a1b2c3d4e5f", repId: "r1", deviceId: "d1", deviceName: "جهاز تجربة", email: "demo@example.com", note: "الطبق لا يتصل", at: 10, ...over });

describe("🚩 a rep's warning", () => {
  it("is made from a note, trimmed; an empty note is nothing", () => {
    expect(newRepFlag({ repId: "r1", deviceId: "d1", deviceName: "", email: "demo@example.com", note: "  الطبق لا يتصل  " }, 5, () => "abcdef123456")).toEqual({
      id: "abcdef123456",
      repId: "r1",
      deviceId: "d1",
      deviceName: "demo@example.com",
      email: "demo@example.com",
      note: "الطبق لا يتصل",
      at: 5,
    });
    expect(newRepFlag({ repId: "r1", deviceId: "d1", deviceName: "x", note: "   " })).toBeNull();
  });

  it("the operator keeps it once, open until «✓ راجعته»", () => {
    let { store, added } = addIncomingFlags({}, [flag(), flag({ id: "ffff00001111", deviceId: "d2", at: 20 })], 100);
    expect(added).toHaveLength(2);
    expect(openOwnerFlags(store).map((f) => f.id)).toEqual(["ffff00001111", "0a1b2c3d4e5f"]);
    expect(openFlagsForDevice(store, "d1")).toHaveLength(1);
    const again = addIncomingFlags(store, [flag()], 200);
    expect(again.added).toEqual([]);
    expect(again.store).toBe(store);
    store = markOwnerFlagReviewed(store, "0a1b2c3d4e5f", 300);
    expect(openFlagsForDevice(store, "d1")).toEqual([]);
    expect(store["0a1b2c3d4e5f"]!.reviewedAt).toBe(300);
    ({ store } = { store });
  });

  it("a document's content belongs to its channel's rep; junk is refused", () => {
    expect(parseFlagPayload(JSON.stringify(flag({ repId: "someone-else" })), "r1")?.repId).toBe("r1");
    expect(parseFlagPayload(JSON.stringify({ ...flag(), id: "../x" }), "r1")).toBeNull();
    expect(parseFlagPayload(JSON.stringify({ ...flag(), note: " " }), "r1")).toBeNull();
    expect(parseFlagPayload("not json", "r1")).toBeNull();
  });

  it("the messages name the device and the note", () => {
    expect(ownerFlagMessage(flag(), "الحسين")).toBe("🚩 تحذير من المندوب الحسين\n📡 جهاز تجربة · demo@example.com\n📝 الطبق لا يتصل");
    expect(repReviewedMessage(flag())).toContain("✓ راجع المسؤول تحذيرك على جهاز تجربة");
  });

  it("the rep's outbox: queued, sent once, shown per device", () => {
    let out = queueFlag([], flag());
    out = queueFlag(out, flag({ id: "ffff00001111", at: 20 }));
    expect(unsentFlags(out).map((f) => f.id)).toEqual(["0a1b2c3d4e5f", "ffff00001111"]);
    out = markFlagSent(out, "0a1b2c3d4e5f", 50);
    expect(unsentFlags(out).map((f) => f.id)).toEqual(["ffff00001111"]);
    expect(outboxForDevice(out, "d1").map((i) => i.flag.id)).toEqual(["ffff00001111", "0a1b2c3d4e5f"]);
  });
});

/** An in-memory Firestore: signUp, PATCH, GET collection, DELETE. */
function fakeFirestore() {
  const docs = new Map<string, Record<string, { stringValue: string }>>();
  const fn: FetchFn = async (url, init) => {
    if (url.includes("accounts:signUp")) return new Response(JSON.stringify({ idToken: "tok", refreshToken: "ref", expiresIn: "3600" }), { status: 200 });
    const path = decodeURIComponent(url.split("/documents/")[1]!.split("?")[0]!);
    if (init?.method === "PATCH") {
      docs.set(path, (JSON.parse(String(init.body)) as { fields: Record<string, { stringValue: string }> }).fields);
      return new Response("{}", { status: 200 });
    }
    if (init?.method === "DELETE") {
      docs.delete(path);
      return new Response("{}", { status: 200 });
    }
    const documents = [...docs.entries()].filter(([p]) => p.startsWith(path + "/") && !p.slice(path.length + 1).includes("/")).map(([p, fields]) => ({ name: `projects/x/databases/(default)/documents/${p}`, fields }));
    return new Response(JSON.stringify(documents.length ? { documents } : {}), { status: 200 });
  };
  return { fn, docs };
}

describe("🚩 over the operator's Firebase", () => {
  beforeEach(() => window.localStorage.clear());

  it("the rep's warning arrives sealed, opens only with its channel, and is deleted once read", async () => {
    const fs = fakeFirestore();
    const channel = { spaceId: "0123456789abcdef01234567", key: newLinkKey() };
    const link = { apiKey: "AIzaFAKE_key_for_tests_0000000000000", projectId: "demo-project", ...channel };
    const pushed = await pushFlags(link, [flag()], fs.fn);
    expect(pushed.sent).toEqual(["0a1b2c3d4e5f"]);
    const stored = [...fs.docs.values()][0]!;
    expect(stored.sealed!.stringValue).not.toContain("الطبق"); // never in clear text
    // another rep's channel (other key) opens nothing
    const other = await pullFlags(link, { r2: { spaceId: channel.spaceId, key: newLinkKey() } }, fs.fn);
    expect(other.flags).toEqual([]);
    expect(fs.docs.size).toBe(1);
    const pulled = await pullFlags(link, { r1: channel }, fs.fn);
    expect(pulled.flags.map((f) => [f.id, f.repId, f.note])).toEqual([["0a1b2c3d4e5f", "r1", "الطبق لا يتصل"]]);
    expect(fs.docs.size).toBe(0);
  });
});
