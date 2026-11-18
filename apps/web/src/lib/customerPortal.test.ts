import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import {
  cleanRequest,
  makeOwnerKeys,
  openFromCustomer,
  openView,
  randomToken,
  readHash,
  sealForOwner,
  sealView,
} from "../../public/c/portal.js";
import {
  addPortalRequest,
  addWaiting,
  buildPortalView,
  cleanPortalStore,
  clientLink,
  joinLink,
  parseFirebaseConfig,
  portalRules,
  requestLines,
  requestNotice,
  rulesNeedPublishing,
  viewFingerprint,
  withOwner,
  type PortalSetup,
  type PortalWaiting,
} from "./customerPortal";
import { blankDevice } from "./saleDevices";
import type { ClientStore } from "./clientStore";
import type { PartyStatementRow } from "./invoiceStore";

const NOW = "2026-11-18T10:00:00.000Z";

async function setup(): Promise<PortalSetup> {
  const keys = await makeOwnerKeys();
  return { apiKey: "AIzaFakeKeyForTests_000000000000000", projectId: "fake-portal", space: "sp1", publicKey: keys.publicKey, privateJwk: keys.privateJwk, owners: ["uidA"], createdAt: NOW };
}

describe("portal.js crypto", () => {
  it("a request opens only with the owner's private key", async () => {
    const s = await setup();
    const sealed = await sealForOwner(s.publicKey, { kind: "new", name: "زبون تجريبي", phone: "", kit: "KIT000TEST" });
    expect(sealed).not.toContain("KIT000TEST");
    expect(await openFromCustomer(s.privateJwk, sealed)).toEqual({ kind: "new", name: "زبون تجريبي", phone: "", kit: "KIT000TEST" });
    const other = await makeOwnerKeys();
    await expect(openFromCustomer(other.privateJwk, sealed)).rejects.toBeTruthy();
  });

  it("a customer's page opens only with his own key", async () => {
    const key = randomToken();
    const sealed = await sealView(key, { name: "زبون" });
    expect(await openView(key, sealed)).toEqual({ name: "زبون" });
    await expect(openView(randomToken(), sealed)).rejects.toBeTruthy();
  });

  it("the public key is short enough for a link", async () => {
    expect((await setup()).publicKey.length).toBeLessThan(100);
  });
});

describe("links", () => {
  it("the request link and the customer's link carry what the page needs", async () => {
    const s = await setup();
    const j = readHash(new URL(joinLink(s, "STAR NET")).hash);
    expect(j).toEqual({ kind: "j", data: { p: "fake-portal", k: s.apiKey, s: "sp1", e: s.publicKey, n: "STAR NET" } });
    const v = readHash(new URL(clientLink(s, { token: "tok", key: "key", createdAt: NOW }, "STAR NET")).hash);
    expect(v?.kind).toBe("v");
    expect(v?.data).toMatchObject({ t: "tok", x: "key", s: "sp1" });
  });

  it("a broken or foreign hash is nothing", () => {
    expect(readHash("")).toBeNull();
    expect(readHash("#x.abc")).toBeNull();
    expect(readHash("#j.%%%")).toBeNull();
  });
});

describe("cleanRequest", () => {
  it("an existing account needs a name and a valid email; the email is lower case", () => {
    expect(cleanRequest({ kind: "existing", name: " أحمد ", email: "Fake@Example.COM", emailCode: "c1", wifiCode: "w1" })).toEqual({
      kind: "existing",
      name: "أحمد",
      phone: "",
      email: "fake@example.com",
      emailCode: "c1",
      wifiCode: "w1",
    });
    expect(cleanRequest({ kind: "existing", name: "أحمد", email: "not-an-email" })).toBeNull();
    expect(cleanRequest({ kind: "existing", name: "", email: "a@b.cd" })).toBeNull();
  });

  it("a new device needs a KIT or SN (upper case)", () => {
    expect(cleanRequest({ kind: "new", name: "س", phone: "22000000", kit: "kit123" })).toEqual({ kind: "new", name: "س", phone: "22000000", kit: "KIT123" });
    expect(cleanRequest({ kind: "new", name: "س", kit: " " })).toBeNull();
  });
});

describe("setup", () => {
  it("reads the pasted firebaseConfig snippet", () => {
    const snippet = `const firebaseConfig = {\n  apiKey: "AIzaSyFAKE-fake_fake_fake_fake_000",\n  authDomain: "fake-portal.firebaseapp.com",\n  projectId: "fake-portal",\n};`;
    expect(parseFirebaseConfig(snippet)).toEqual({ apiKey: "AIzaSyFAKE-fake_fake_fake_fake_000", projectId: "fake-portal" });
    expect(parseFirebaseConfig(`{"apiKey":"AIzaSyFAKE-fake_fake_fake_fake_000","projectId":"fake-portal"}`)).not.toBeNull();
    expect(parseFirebaseConfig("hello")).toBeNull();
  });

  it("the rules let only his phones read requests and write pages", () => {
    const rules = portalRules(["uidA", "uidB"]);
    expect(rules).toContain("request.auth.uid in ['uidA', 'uidB']");
    expect(rules).toContain("allow get: if true;");
    expect(rules).not.toMatch(/views\/\{token\} \{\s*allow (list|read)/);
  });

  it("a new phone of his asks for the rules again", async () => {
    let s = await setup();
    expect(rulesNeedPublishing(s)).toBe(true);
    s = { ...s, rulesOwners: ["uidA"] };
    expect(rulesNeedPublishing(s)).toBe(false);
    s = withOwner(s, "uidB");
    expect(rulesNeedPublishing(s)).toBe(true);
    expect(withOwner(s, "uidB")).toBe(s);
  });

  it("a stored value that is not a setup is ignored", () => {
    expect(cleanPortalStore(null)).toEqual({ links: {} });
    expect(cleanPortalStore({ setup: { apiKey: 1 } })).toEqual({ links: {} });
  });
});

function device(id: string, patch: Partial<StarlinkAccountSummary>): StarlinkAccountSummary {
  return { ...blankDevice(id, NOW), ...patch };
}

describe("«حسابي»", () => {
  const row = (patch: Partial<PartyStatementRow>): PartyStatementRow => ({
    id: "r",
    type: "device-charge",
    date: "2026-11-01",
    createdAt: "2026-11-01T00:00:00Z",
    currencyCode: "MRU",
    deviceName: "جهاز 1",
    amount: 12000,
    paid: 0,
    delta: 12000,
    balanceAfter: 12000,
    ...patch,
  });

  it("shows his live devices, what he owes per currency and his last operations", () => {
    const view = buildPortalView({
      business: "STAR NET",
      client: { name: "زبون تجريبي" },
      devices: [device("d1", { name: "جهاز 1", rechargeDate: "2099-01-05" }), device("d2", { name: "قديم", deletedAt: NOW }), device("d3", { name: "جديد", pendingActivation: { soldAt: "2026-11-18" } })],
      owed: { MRU: 12000, SIFA: 10000, USD: -5 },
      rows: [row({}), row({ id: "p", type: "device-payment", delta: -2000, amount: 2000 }), row({ id: "x", type: "deleted", delta: 0 })],
      payLines: "بنكيلي: 00000000",
      usualPrice: (d) => (d.id === "d1" ? { amount: 12000, currency: "MRU" } : null),
      now: NOW,
    });
    expect(view.devices.map((d) => d.name)).toEqual(["جهاز 1", "جديد"]);
    expect(view.devices[0]).toMatchObject({ renewal: "2099-01-05", price: "12,000 أوقية" });
    expect(view.devices[0].daysLeft).toBeGreaterThan(0);
    expect(view.devices[1]).toMatchObject({ renewal: "", daysLeft: null, status: "⏳ لم يُفعَّل بعد" });
    expect(view.owed).toEqual(["12,000 أوقية", "10,000 سيفا"]);
    expect(view.credit).toEqual(["5 دولار"]);
    expect(view.rows.map((r) => r.amount)).toEqual(["+ 12,000 أوقية", "- 2,000 أوقية"]);
    expect(view.pay).toContain("بنكيلي");
    expect(view.pay).toContain("فرانك");
  });

  it("the same page at another time is not sent again", () => {
    const base = { business: "B", client: { name: "n" }, devices: [], owed: {}, rows: [], payLines: "", usualPrice: () => null };
    expect(viewFingerprint(buildPortalView({ ...base, now: "a" }))).toBe(viewFingerprint(buildPortalView({ ...base, now: "b" })));
  });
});

describe("requests", () => {
  const ids = () => {
    let n = 0;
    return () => `id${++n}`;
  };
  const existing: PortalWaiting = { id: "w1", at: NOW, request: { kind: "existing", name: "زبون تجريبي", phone: "+222 22 00 00 01", email: "fake1@example.com", emailCode: "e-code", wifiCode: "w-code" } };
  const fresh: PortalWaiting = { id: "w2", at: NOW, request: { kind: "new", name: "آخر", phone: "", kit: "KIT0000FAKE" } };

  it("an account he already has → a device with his email and codes, on his customer found by the number", () => {
    const clients: ClientStore = { c1: { id: "c1", name: "زبون معروف", phone: "22000001", createdAt: NOW, updatedAt: NOW } };
    const r = addPortalRequest([], clients, existing, NOW, ids());
    expect(r.newClient).toBeUndefined();
    expect(r.created).toMatchObject({ clientId: "c1", name: "زبون معروف", expectedEmail: "fake1@example.com", expectedEmailPassword: "e-code", wifiPassword: "w-code", fromPortal: NOW });
    expect(r.created?.pendingActivation).toBeUndefined();
  });

  it("a new KIT → a «غير مفعّل» device on a new customer", () => {
    const r = addPortalRequest([], {}, fresh, NOW, ids());
    expect(r.newClient).toMatchObject({ name: "آخر" });
    expect(r.newClient?.phone).toBeUndefined();
    expect(r.created).toMatchObject({ kitNumber: "KIT0000FAKE", pendingActivation: { soldAt: "2026-11-18" }, clientId: r.newClient?.id });
    const sn = addPortalRequest([], {}, { ...fresh, request: { ...fresh.request, kit: "2DWC0000FAKE" } }, NOW, ids());
    expect(sn.created).toMatchObject({ serialNumber: "2DWC0000FAKE", kitNumber: "" });
  });

  it("a device already here makes nothing", () => {
    const here = [device("d1", { expectedEmail: "FAKE1@example.com" }), device("d2", { kitNumber: "KIT0000FAKE" })];
    expect(addPortalRequest(here, {}, existing, NOW, ids())).toMatchObject({ existing: { id: "d1" }, accounts: here });
    expect(addPortalRequest(here, {}, fresh, NOW, ids()).existing?.id).toBe("d2");
  });

  it("waiting requests are kept once each", () => {
    expect(addWaiting([existing], [existing, fresh, fresh]).map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("the notification never shows the codes; his sheet does", () => {
    expect(requestNotice(existing.request)).not.toContain("e-code");
    expect(requestNotice(existing.request)).not.toContain("w-code");
    expect(requestLines(existing.request).join(" ")).toContain("e-code");
    expect(requestNotice(fresh.request)).toContain("KIT0000FAKE");
  });
});
