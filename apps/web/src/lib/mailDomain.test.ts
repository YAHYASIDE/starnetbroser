import { describe, expect, it } from "vitest";
import { isOnMailDomain, normalizeMailDomain } from "./mailDomain";
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
