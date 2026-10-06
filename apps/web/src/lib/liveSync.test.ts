// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { decryptBackup, encryptBackup } from "./backupCrypto";
import type { ClientStore } from "./clientStore";
import type { FetchFn } from "./firestoreRest";
import { buildSide, trackLocal, EMPTY_TRACK, type SidePayload } from "./liveSyncData";
import { saveLiveSyncConfig } from "./liveSyncConfig";
import { applyMerge, ownerViewForRep, repView, runLiveSyncOnce } from "./liveSync";
import { currentRepOfClient } from "./repClients";
import { boundCopyKey } from "./repDeviceTransfer";
import { ACCOUNTS_KEY, CLIENTS_KEY } from "./repWorkspace";

const dev = (id: string, extra: Partial<StarlinkAccountSummary> = {}) => ({ id, name: id, ...extra }) as StarlinkAccountSummary;
const client = (id: string, name: string, extra: object = {}) => ({ id, name, createdAt: "", updatedAt: "", ...extra });

/** A fake Firestore over `docs` (path -> fields). */
function firestore(docs: Record<string, Record<string, string>>): FetchFn {
  return async (url, init) => {
    if (url.includes("accounts:signUp")) return new Response(JSON.stringify({ idToken: "t", refreshToken: "r", expiresIn: "3600" }), { status: 200 });
    const path = decodeURIComponent(url.split("/documents/")[1] ?? "");
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { fields: Record<string, { stringValue: string }> };
      docs[path] = Object.fromEntries(Object.entries(body.fields).map(([k, v]) => [k, v.stringValue]));
      return new Response("{}", { status: 200 });
    }
    const doc = docs[path];
    return doc
      ? new Response(JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, { stringValue: v }])) }), { status: 200 })
      : new Response(JSON.stringify({ error: { message: `Document "projects/p/databases/(default)/documents/${path}" not found.` } }), { status: 404 });
  };
}

describe("☁️ live link - what each phone shares and takes", () => {
  it("the operator shares, per rep, that rep's customers and his devices' links", () => {
    const clients: ClientStore = {
      mine: client("mine", "زبوني"),
      his: client("his", "زبون المندوب", { repSegments: [{ repId: "r1", from: "2026-01-01", carry: true }] }),
      linked: client("linked", "مربوط بجهازه"),
    };
    const accounts = [dev("d1", { representativeId: "r1", clientId: "linked" }), dev("d2", { representativeId: "r1" }), dev("d3", { clientId: "mine" })];
    expect(ownerViewForRep(clients, accounts, "r1")).toEqual({
      clients: { his: { name: "زبون المندوب" }, linked: { name: "مربوط بجهازه" } },
      links: { d1: "linked", d2: null },
    });
    expect(Object.keys(repView(clients, accounts).links)).toEqual(["d1", "d2", "d3"]);
  });

  it("a customer added from the rep's side becomes HIS customer on the operator's phone, and the device is linked", () => {
    const merged = applyMerge({}, [dev("d1", { representativeId: "r1" })], { clients: { c1: { name: "جديد", phone: "000" } }, links: { d1: "c1" } }, "2026-10-05T10:00:00.000Z", "r1");
    expect(merged.clients.c1).toMatchObject({ id: "c1", name: "جديد", phone: "000" });
    expect(currentRepOfClient(merged.clients.c1)).toBe("r1");
    expect(merged.accounts[0]!.clientId).toBe("c1");
    // an unlink removes the customer from the device
    expect(applyMerge({}, merged.accounts, { clients: {}, links: { d1: null } }, "x").accounts[0]!.clientId).toBeUndefined();
  });
});

describe("☁️ live link - a full round on the operator's phone", () => {
  beforeEach(() => window.localStorage.clear());

  it("takes the rep's encrypted side from Firebase, writes it into the app, and publishes its own side", async () => {
    const code = "TEST-CODE-1234";
    const phoneKey = "phone-key-for-tests-0000000000";
    const key = boundCopyKey(code, phoneKey);
    window.localStorage.setItem("starnet.repDeviceCodes", JSON.stringify({ r1: code }));
    window.localStorage.setItem("starnet.repPhoneKeys", JSON.stringify({ r1: phoneKey }));
    saveLiveSyncConfig({ apiKey: "AIzaFAKE_key_for_tests_0000000000000", projectId: "demo-project", spaceId: "space1", enabled: true });
    window.localStorage.setItem(CLIENTS_KEY, JSON.stringify({}));
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([dev("d1", { representativeId: "r1" })]));

    // the rep's phone already published: he added «زبون المندوب» and linked d1 to him
    const repLocal = { clients: { c1: { name: "زبون المندوب" } }, links: { d1: "c1" } };
    const repState = trackLocal(trackLocal(EMPTY_TRACK, { clients: {}, links: { d1: null } }, "2026-10-05T09:00:00.000Z"), repLocal, "2026-10-05T10:00:00.000Z");
    const repSide = buildSide(repState, repLocal, "2026-10-05T10:00:00.000Z");
    const docs: Record<string, Record<string, string>> = {
      "starnet/space1/reps/r1/sides/rep": { data: JSON.stringify(await encryptBackup(repSide, key)), at: "2026-10-05T10:00:00.000Z" },
    };
    const fetchFn = firestore(docs);

    const run = await runLiveSyncOnce(fetchFn, [{ id: "r1", name: "المندوب" }]);
    expect(run).toMatchObject({ ok: true, changed: true, reps: 1 });
    const clients = JSON.parse(window.localStorage.getItem(CLIENTS_KEY)!) as ClientStore;
    expect(clients.c1).toMatchObject({ name: "زبون المندوب" });
    expect(currentRepOfClient(clients.c1)).toBe("r1");
    expect((JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY)!) as StarlinkAccountSummary[])[0]!.clientId).toBe("c1");

    // the operator's side was published, encrypted, and the rep can read it
    const ownerDoc = docs["starnet/space1/reps/r1/sides/owner"]!;
    const ownerSide = (await decryptBackup(JSON.parse(ownerDoc.data!), key)) as SidePayload;
    expect(ownerSide.links.d1!.clientId).toBe("c1");
    expect(ownerSide.clients.c1!.name).toBe("زبون المندوب");

    // a second round with nothing new changes nothing and uploads nothing
    const before = ownerDoc.at;
    expect(await runLiveSyncOnce(fetchFn, [{ id: "r1", name: "المندوب" }])).toMatchObject({ ok: true, changed: false });
    expect(docs["starnet/space1/reps/r1/sides/owner"]!.at).toBe(before);
  }, 30_000);

  it("after the update, a device the operator linked keeps its customer even if the rep's phone wrongly published it empty", async () => {
    const code = "TEST-CODE-1234";
    const phoneKey = "phone-key-for-tests-0000000000";
    const key = boundCopyKey(code, phoneKey);
    window.localStorage.setItem("starnet.repDeviceCodes", JSON.stringify({ r1: code }));
    window.localStorage.setItem("starnet.repPhoneKeys", JSON.stringify({ r1: phoneKey }));
    saveLiveSyncConfig({ apiKey: "AIzaFAKE_key_for_tests_0000000000000", projectId: "demo-project", spaceId: "space1", enabled: true });
    window.localStorage.setItem(CLIENTS_KEY, JSON.stringify({ c1: client("c1", "زبون") }));
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([dev("d1", { representativeId: "r1", clientId: "c1" })]));
    // the old meta (before the fix) is dropped
    window.localStorage.setItem("starnet.liveSyncMeta", JSON.stringify({ "owner:r1": { state: { clients: {}, links: { d1: { value: "c1", at: "2026-10-05T09:00:00.000Z" } }, started: true } } }));

    // the rep's phone (old version) stamped the device empty when an older copy brought it
    const repLocal = { clients: {}, links: { d1: null } };
    const repState = trackLocal(trackLocal(EMPTY_TRACK, { clients: {}, links: {} }, "2026-10-05T09:00:00.000Z"), repLocal, "2026-10-05T10:00:00.000Z");
    repState.links.d1 = { value: null, at: "2026-10-05T10:00:00.000Z" };
    const docs: Record<string, Record<string, string>> = {
      "starnet/space1/reps/r1/sides/rep": { data: JSON.stringify(await encryptBackup(buildSide(repState, repLocal, "2026-10-05T10:00:00.000Z"), key)), at: "2026-10-05T10:00:00.000Z" },
    };

    await runLiveSyncOnce(firestore(docs), [{ id: "r1", name: "المندوب" }]);
    expect((JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY)!) as StarlinkAccountSummary[])[0]!.clientId).toBe("c1");
    expect(window.localStorage.getItem("starnet.liveSyncMeta")).toBeNull();
    const ownerSide = (await decryptBackup(JSON.parse(docs["starnet/space1/reps/r1/sides/owner"]!.data!), key)) as SidePayload;
    expect(ownerSide.links.d1!.clientId).toBe("c1");
  }, 30_000);
});
