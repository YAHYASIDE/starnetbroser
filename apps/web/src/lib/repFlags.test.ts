// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  addIncomingFlags,
  canReviewFlag,
  flagsBarText,
  isBrowserTeamFlag,
  newTeamFlag,
  teamFlagMessage,
  teamFlagsFromBrowser,
  markFlagSent,
  markOwnerFlagReviewed,
  newRepFlag,
  openFlagsForDevice,
  openOwnerFlags,
  outboxForDevice,
  ownerFlagMessage,
  parseFlagPayload,
  queueFlag,
  repNeedsFlagLink,
  repReviewedMessage,
  unsentFlags,
  type RepFlag, repFlagsFromBrowser,
  FLAG_ANNOUNCE_MS,
  FLAG_KEEP_MS,
  flagsToAnnounce,
  withAnnounced,
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
    expect(ownerFlagMessage({ ...flag(), level: "urgent" }, "الحسين").startsWith("🔴 مستعجل - 🚩")).toBe(true);
    expect(ownerFlagMessage(flag(), "الحسين")).toBe("🟡 🚩 تحذير من المندوب الحسين\n📡 جهاز تجربة · demo@example.com\n📝 الطبق لا يتصل");
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

describe("🚩 the rep's phone has his channel?", () => {
  it("needs one until a copy carrying it was delivered; never without a Firebase", () => {
    const channels = { r1: { spaceId: "s1", key: "k" } };
    expect(repNeedsFlagLink("r1", false, {}, channels)).toBe(false);
    expect(repNeedsFlagLink("r1", true, {}, {})).toBe(true);
    expect(repNeedsFlagLink("r1", true, {}, channels)).toBe(true);
    expect(repNeedsFlagLink("r1", true, { r1: "s1" }, channels)).toBe(false);
    expect(repNeedsFlagLink("r1", true, { r1: "old" }, channels)).toBe(true);
  });
});

describe("🚩 over the operator's Firebase", () => {
  beforeEach(() => window.localStorage.clear());

  it("the rep's warning arrives sealed, opens only with its channel, and stays for every phone of the team (3 days)", async () => {
    const fs = fakeFirestore();
    const channel = { spaceId: "0123456789abcdef01234567", key: newLinkKey() };
    const link = { apiKey: "AIzaFAKE_key_for_tests_0000000000000", projectId: "demo-project", ...channel };
    const pushed = await pushFlags(link, [flag({ at: Date.now() })], fs.fn);
    expect(pushed.sent).toEqual(["0a1b2c3d4e5f"]);
    const stored = [...fs.docs.values()][0]!;
    expect(stored.sealed!.stringValue).not.toContain("الطبق"); // never in clear text
    // another rep's channel (other key) opens nothing
    const other = await pullFlags(link, { r2: { spaceId: channel.spaceId, key: newLinkKey() } }, fs.fn);
    expect(other.flags).toEqual([]);
    expect(fs.docs.size).toBe(1);
    const pulled = await pullFlags(link, { r1: channel }, fs.fn);
    expect(pulled.flags.map((f) => [f.id, f.repId, f.note])).toEqual([["0a1b2c3d4e5f", "r1", "الطبق لا يتصل"]]);
    expect(fs.docs.size).toBe(1); // another phone of the team reads it too
    const again = await pullFlags(link, { r1: channel }, fs.fn);
    expect(again.flags).toHaveLength(1);
    const later = await pullFlags(link, { r1: channel }, fs.fn, Date.now() + FLAG_KEEP_MS + 60_000);
    expect(later.flags).toEqual([]);
    expect(fs.docs.size).toBe(0); // gone after 3 days
  });
});

describe("🔔 each phone announces a rep's warning for itself (his Nov 8 2026 report)", () => {
  it("not announced here before, not reviewed, fresh - even when the shared store already has it", () => {
    const now = 10 * 60 * 60 * 1000;
    const f1 = { ...flag(), id: "aaaaaaaaaaaa", at: now - 60_000 };
    const f2 = { ...flag(), id: "bbbbbbbbbbbb", at: now - 60_000 };
    const f3 = { ...flag(), id: "cccccccccccc", at: now - 60_000 };
    const old = { ...flag(), id: "dddddddddddd", at: 0 };
    const store = { [f1.id]: { ...f1, receivedAt: now }, [f2.id]: { ...f2, receivedAt: now, reviewedAt: now } };
    const sentAt = { [old.id]: now - FLAG_ANNOUNCE_MS - 1 };
    expect(flagsToAnnounce([f1, f2, f3, old], sentAt, [f3.id], store, now).map((f) => f.id)).toEqual([f1.id]);
    expect(withAnnounced(["x", "y"], ["y", "z"])).toEqual(["x", "y", "z"]);
  });
});

describe("👥 team alerts on a device (his Nov 7 2026 ask)", () => {
  const fixed = () => "0123456789abcdef0123";
  it("a member writes one: by his name, 🔴 / 🟡; urgent ones come first in the bar", () => {
    const t = newTeamFlag({ deviceId: "d1", deviceName: "DEMO 1", note: "  الطبق لا يتصل  ", level: "urgent", by: "المسؤول 2" }, 1000, fixed)!;
    expect(t).toMatchObject({ repId: "", by: "المسؤول 2", level: "urgent", note: "الطبق لا يتصل", receivedAt: 1000 });
    expect(newTeamFlag({ deviceId: "d1", deviceName: "DEMO 1", note: " ", level: "normal", by: "x" })).toBeNull();
    const normal = newTeamFlag({ deviceId: "d2", deviceName: "DEMO 2", note: "تغيير الباقة", level: "normal", by: "اللابتوب" }, 5000, () => "aaaaaaaaaaaaaaaaaaaa")!;
    const store = addIncomingFlags({}, [t, normal], 5000).store;
    expect(openOwnerFlags(store).map((f) => f.deviceName)).toEqual(["DEMO 1", "DEMO 2"]);
    expect(flagsBarText(openOwnerFlags(store))).toBe("🔴 🚩 2 تنبيه من الفريق · DEMO 1");
    expect(teamFlagMessage(t)).toBe("🔴 🚩 المسؤول 2 - DEMO 1: الطبق لا يتصل");
  });

  it("only YAHYA closes a team alert; a rep's warning anyone; nothing linked - whoever sees it", () => {
    const team = { repId: "", by: "المسؤول 2" };
    expect(canReviewFlag(team, true, true)).toBe(true);
    expect(canReviewFlag(team, true, false)).toBe(false);
    expect(canReviewFlag(team, false, false)).toBe(true);
    expect(canReviewFlag({ repId: "rep1" }, true, false)).toBe(true);
  });

  it("🚩 from a device's browser: one alert per staged read, never twice; a gone device is skipped", () => {
    const syncs = [
      { syncId: "s1", accountId: "d1", fields: { teamFlag: { note: "لا يتصل", level: "urgent", at: 2000 } } },
      { syncId: "s2", accountId: "gone", fields: { teamFlag: { note: "x" } } },
    ];
    const { flags, syncIds } = teamFlagsFromBrowser(syncs, [{ id: "d1", name: "DEMO 1", email: "demo@example.com" }], "YAHYA");
    expect(syncIds).toEqual(["s1", "s2"]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ id: "browser-s1", deviceName: "DEMO 1", email: "demo@example.com", level: "urgent", by: "YAHYA", at: 2000 });
    const once = addIncomingFlags({}, flags).store;
    expect(addIncomingFlags(once, teamFlagsFromBrowser(syncs, [{ id: "d1", name: "DEMO 1" }], "YAHYA").flags).added).toHaveLength(0);
    expect(isBrowserTeamFlag(syncs[0]!)).toBe(true);
    // 📸 a small picture rides with it; anything else is dropped
    const withShot = teamFlagsFromBrowser([{ syncId: "s3", accountId: "d1", fields: { teamFlag: { note: "x", image: "data:image/jpeg;base64,AAAA" } } }], [{ id: "d1", name: "DEMO 1" }], "Y").flags[0];
    expect(withShot!.image).toBe("data:image/jpeg;base64,AAAA");
    const bad = teamFlagsFromBrowser([{ syncId: "s4", accountId: "d1", fields: { teamFlag: { note: "x", image: "javascript:1" } } }], [{ id: "d1", name: "DEMO 1" }], "Y").flags[0];
    expect(bad!.image).toBeUndefined();
    expect(isBrowserTeamFlag({ fields: {} })).toBe(false);
  });
});


describe("🚩 a rep's browser alert goes on his channel (his Nov 7 2026 report)", () => {
  const devices = [{ id: "d1", name: "DEMO 1", email: "demo@example.com" }];
  const image = "data:image/jpeg;base64,AAAA";
  it("becomes his warning with its level and picture, with a stable hex id the operator accepts", () => {
    const reads = [
      { syncId: "s-1", accountId: "d1", fields: { teamFlag: { note: "لا يتصل", level: "urgent", at: 5, image } } },
      { syncId: "s-2", accountId: "nobody", fields: { teamFlag: { note: "x" } } },
      { syncId: "s-3", accountId: "d1", fields: {} },
    ];
    const { flags, syncIds } = repFlagsFromBrowser(reads, devices, "rep1");
    expect(syncIds).toEqual(["s-1", "s-2"]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ repId: "rep1", deviceId: "d1", note: "لا يتصل", level: "urgent", image, at: 5 });
    expect(repFlagsFromBrowser(reads, devices, "rep1").flags[0]!.id).toBe(flags[0]!.id);
    const back = parseFlagPayload(JSON.stringify(flags[0]), "rep1");
    expect(back).toMatchObject({ id: flags[0]!.id, level: "urgent", image });
  });
  it("a picture that isn't a small JPEG is dropped", () => {
    const back = parseFlagPayload(JSON.stringify({ id: "abcdef1234", deviceId: "d1", note: "n", image: "javascript:alert(1)" }), "rep1");
    expect(back?.image).toBeUndefined();
  });
});
