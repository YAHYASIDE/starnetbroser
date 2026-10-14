import { describe, expect, it } from "vitest";
import { parsePastedSession, toCookieEditorJson } from "./pastedSession";

describe("parsePastedSession - a Starlink session pasted from another browser", () => {
  it("reads Cookie-Editor's JSON export, keeping only starlink.com, grouped by address", () => {
    const json = JSON.stringify([
      { domain: ".starlink.com", path: "/", name: "demo_auth", value: "AAA111", httpOnly: true, secure: true },
      { domain: "www.starlink.com", path: "/", name: "demo_pref", value: "en" },
      { domain: "api.starlink.com", path: "/", name: "demo_api", value: "BBB" },
      { domain: ".example.com", path: "/", name: "other", value: "x" },
    ]);
    const result = parsePastedSession(json);
    expect(result).toEqual({
      ok: true,
      count: 3,
      cookiesByUrl: {
        "https://starlink.com/": "demo_auth=AAA111",
        "https://www.starlink.com/": "demo_pref=en",
        "https://api.starlink.com/": "demo_api=BBB",
      },
    });
  });

  it("reads a Netscape cookies.txt and a plain cookie header", () => {
    const netscape = ["# Netscape HTTP Cookie File", "#HttpOnly_.starlink.com\tTRUE\t/\tTRUE\t0\tdemo_auth\tAAA", ".starlink.com\tTRUE\t/\tTRUE\t0\tdemo_b\tB"].join("\n");
    expect(parsePastedSession(netscape)).toMatchObject({ ok: true, count: 2, cookiesByUrl: { "https://starlink.com/": "demo_auth=AAA; demo_b=B" } });
    expect(parsePastedSession("Cookie: demo_a=1; demo_b=2")).toMatchObject({ ok: true, count: 2, cookiesByUrl: { "https://starlink.com/": "demo_a=1; demo_b=2" } });
  });

  it("refuses an empty paste, a paste with no starlink.com cookie, and malformed names", () => {
    expect(parsePastedSession("  ").ok).toBe(false);
    expect(parsePastedSession(JSON.stringify([{ domain: ".example.com", name: "a", value: "b" }]))).toMatchObject({ ok: false });
    expect(parsePastedSession("just some text")).toMatchObject({ ok: false });
    expect(parsePastedSession(JSON.stringify([{ domain: ".starlink.com", name: "bad name", value: "x" }])).ok).toBe(false);
  });
});

describe("📤 toCookieEditorJson - a device's session out to Chrome / Kiwi / Firefox (Cookie-Editor → Import)", () => {
  it("starlink.com cookies only, once each, and pasting it back gives the same session", () => {
    const session = { "https://www.starlink.com/": "a=1; b=x=y", "https://api.starlink.com/": "c=3", "https://login.example.com/": "z=9", bad: "q=1" };
    const { json, count } = toCookieEditorJson({ ...session, "https://www.starlink.com/account": "a=1" }, new Date("2026-10-14T00:00:00Z"));
    expect(count).toBe(3);
    const list = JSON.parse(json) as { domain: string; name: string; value: string; secure: boolean; expirationDate: number }[];
    expect(list.map((c) => [c.domain, c.name, c.value])).toEqual([["www.starlink.com", "a", "1"], ["www.starlink.com", "b", "x=y"], ["api.starlink.com", "c", "3"]]);
    expect(list[0]!.secure).toBe(true);
    expect(list[0]!.expirationDate).toBe(Math.floor(Date.parse("2027-10-14T00:00:00Z") / 1000));
    const back = parsePastedSession(json);
    expect(back.ok && back.count).toBe(3);
    expect(toCookieEditorJson({}).count).toBe(0);
  });
});
