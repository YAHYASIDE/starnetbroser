import { describe, expect, it } from "vitest";
import { isOnMailDomain, normalizeMailDomain, DEFAULT_MAIL_DOMAIN, loadMailDomain } from "./mailDomain";
import { isLinkedKey } from "./deviceLink";
import { suggestEmail } from "./emailSuggest";

describe("📮 بريد على نطاقي (his Oct 17 2026 choice)", () => {
  it("takes the domain however he types it", () => {
    expect(normalizeMailDomain(" @Demo-Shop.com ")).toBe("demo-shop.com");
    expect(normalizeMailDomain("https://demo-shop.com/")).toBe("demo-shop.com");
    expect(normalizeMailDomain("demo shop")).toBe("");
  });

  it("knows its addresses, and suggests them from the name", () => {
    expect(isOnMailDomain("Ahmed.Salem427@demo-shop.com", "demo-shop.com")).toBe(true);
    expect(isOnMailDomain("ahmed@outlook.com", "demo-shop.com")).toBe(false);
    expect(isOnMailDomain("ahmed@demo-shop.com", "")).toBe(false);
    expect(suggestEmail("أحمد ولد سالم", () => 0, "demo-shop.com")).toBe("ahmed.salem100@demo-shop.com");
  });
});

describe("📮 his domain by default (Nov 22 2026 «لا تُظهر لي أوتلوك أبدًا»)", () => {
  it("a phone that never saved a domain uses starnet-om.com", () => {
    const data = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) },
    };
    expect(loadMailDomain()).toBe(DEFAULT_MAIL_DOMAIN);
    expect(DEFAULT_MAIL_DOMAIN).toBe("starnet-om.com");
    window.localStorage.setItem("starnet.mailDomain", "other-shop.com");
    expect(loadMailDomain()).toBe("other-shop.com");
    delete (globalThis as { window?: unknown }).window;
  });

  it("the domain and the activation password travel to every phone of the team (sealed)", () => {
    expect(isLinkedKey("starnet.mailDomain")).toBe(true);
    expect(isLinkedKey("starnet.activationPassword")).toBe(true);
  });
});
