import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { clientByPhone, customerAnswer, devicesFromWhatsApp, emailsIn, phoneKey, whatsappAnswers } from "./whatsappDesk";
import type { ClientStore } from "./clientStore";

// Fake data only.
const clients: ClientStore = { c1: { id: "c1", name: "زبون تجريبي", phone: "+222 2000 0001", createdAt: "x", updatedAt: "x" } };
let n = 0;
const newId = () => `id${++n}`;
const NOW = "2026-11-12T10:00:00.000Z";

describe("💬 WhatsApp Business (his Nov 12 2026 ask)", () => {
  it("a number matches whatever its form; emails are found once, lower case", () => {
    expect(phoneKey("0022220000001")).toBe("20000001");
    expect(phoneKey("22220000001@s.whatsapp.net")).toBe("20000001");
    expect(phoneKey("123")).toBeNull();
    expect(clientByPhone(clients, "22220000001")?.id).toBe("c1");
    expect(emailsIn("ايميلي Fake.User@Example.com. و fake.user@example.com")).toEqual(["fake.user@example.com"]);
  });

  it("an email creates a «غير مفعّل» device on the customer of that number; a known email or no email makes nothing", () => {
    const known = [{ id: "a1", name: "قديم", expectedEmail: "old@example.com" } as StarlinkAccountSummary];
    const r = devicesFromWhatsApp(known, clients, [
      { id: "m1", phone: "22220000001", name: "زبون تجريبي", text: "هذا ايميلي new@example.com", at: 1 },
      { id: "m2", phone: "22220000001", name: "زبون تجريبي", text: "OLD@example.com", at: 2 },
      { id: "m3", phone: "22220000001", name: "زبون تجريبي", text: "السلام عليكم", at: 3 },
    ], NOW, newId);
    expect(r.created).toHaveLength(1);
    expect(r.created[0]).toMatchObject({ expectedEmail: "new@example.com", clientId: "c1", name: "زبون تجريبي", pendingActivation: { soldAt: "2026-11-12" } });
    expect(r.newClients).toEqual([]);
  });

  it("an unknown number becomes a new customer with the WhatsApp name", () => {
    const r = devicesFromWhatsApp([], clients, [{ id: "m1", phone: "22230000002", name: "أحمد", text: "x@example.com", at: 1 }], NOW, newId);
    expect(r.newClients[0]).toMatchObject({ name: "أحمد", phone: "22230000002" });
    expect(r.created[0]!.clientId).toBe(r.newClients[0]!.id);
  });

  it("his answer: each device's state and renewal, and what he owes", () => {
    const d = { id: "a1", name: "جهاز تجريبي", clientId: "c1", serviceStatus: "active", rechargeDate: "" } as StarlinkAccountSummary;
    const text = customerAnswer({ name: "زبون تجريبي" }, [d], { SIFA: 8000 });
    expect(text).toContain("🛰️ جهاز تجريبي: ✅ يعمل");
    expect(text).toContain("💰 عليك: 8,000 سيفا");
    expect(text).toContain("رد آلي");
    const answers = whatsappAnswers(clients, [d], () => ({}));
    expect(Object.keys(answers)).toEqual(["20000001"]);
    expect(answers["20000001"]).toContain("لا شيء عليك");
  });
});

describe("🗑️ WhatsApp twins (his Nov 13 2026 report)", () => {
  it("a WhatsApp device whose email was then added by hand goes to the trash; the hand-added one stays", async () => {
    const { trashWhatsAppTwins } = await import("./whatsappDesk");
    const wa = { id: "w1", name: "x", expectedEmail: "same@example.com", pendingActivation: { soldAt: "2026-11-13" }, fromWhatsApp: "2026-11-13T08:00:00Z" } as StarlinkAccountSummary;
    const legacy = { id: "w2", name: "y", expectedEmail: "two@example.com", pendingActivation: { soldAt: "2026-11-12" }, addedAt: "2026-11-12T20:00:00Z" } as StarlinkAccountSummary;
    const sold = { id: "s1", name: "z", expectedEmail: "same@example.com", pendingActivation: { soldAt: "2026-11-13" }, storeInvoiceId: "inv", addedAt: "2026-11-13T09:00:00Z" } as StarlinkAccountSummary;
    const hand = { id: "h1", name: "real", expectedEmail: "Same@Example.com" } as StarlinkAccountSummary;
    const hand2 = { id: "h2", name: "real2", starlinkAccountEmail: "two@example.com" } as StarlinkAccountSummary;
    const r = trashWhatsAppTwins([wa, legacy, sold, hand, hand2], "2026-11-13T10:00:00Z");
    expect(r.trashed.map((a) => a.id)).toEqual(["w1", "w2"]);
    expect(r.accounts.find((a) => a.id === "s1")!.deletedAt).toBeUndefined();
    expect(trashWhatsAppTwins([wa], "now").trashed).toEqual([]);
  });

  it("a rep's message makes no device", () => {
    const r = devicesFromWhatsApp([], clients, [{ id: "m1", phone: "22240000004", name: "المندوب", text: "rep@example.com", at: 1 }], NOW, newId, ["+222 4000 0004"]);
    expect(r.created).toEqual([]);
    expect(r.newClients).toEqual([]);
  });
});
