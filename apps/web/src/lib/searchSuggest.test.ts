import { describe, expect, it } from "vitest";
import { imageQueries, suggestSearch, type SuggestSource } from "./searchSuggest";

// Fake data only.
const sources: SuggestSource[] = [
  { kind: "device", id: "d1", title: "DEMO HOME", fields: ["wifidemo8589@gmail.com", "KIT301234567"] },
  { kind: "device", id: "d2", title: "wifi demo shop", fields: ["shop.demo@outlook.com"] },
  { kind: "client", id: "c1", title: "محمد التجربة", fields: ["22200001111"] },
  { kind: "rep", id: "r1", title: "مندوب تجربة", fields: [] },
];

describe("🔎 suggestions while typing (his Oct 30 2026 ask)", () => {
  it("«wifi demo» finds the email without spaces too, the closest first", () => {
    const hits = suggestSearch("wifi demo", sources);
    expect(hits.map((h) => h.id)).toEqual(["d2", "d1"]);
    expect(hits[1]!.hit).toBe("wifidemo8589@gmail.com");
  });

  it("customers, reps, a phone, a typo; nothing under 2 letters", () => {
    expect(suggestSearch("التجربه", sources).map((h) => h.id)).toEqual(["c1"]);
    expect(suggestSearch("مندوب", sources)[0]!.kind).toBe("rep");
    expect(suggestSearch("0000111", sources).map((h) => h.id)).toEqual(["c1"]);
    expect(suggestSearch("shopp", sources).map((h) => h.id)).toEqual(["d2"]);
    expect(suggestSearch("w", sources)).toEqual([]);
  });
});

describe("📷 searching by a picture's text", () => {
  it("emails, KIT numbers and phone numbers first, then the lines", () => {
    const text = "Starlink Kit\nKIT: 301234567AB\nDemo.User@Outlook.com\nTel +222 2000 1111\nمحمد التجربة";
    const q = imageQueries(text);
    expect(q[0]).toBe("demo.user@outlook.com");
    expect(q).toContain("301234567AB");
    expect(q).toContain("20001111");
    expect(q).toContain("محمد التجربة");
  });
});
