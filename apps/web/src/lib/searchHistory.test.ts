// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { addSearch, loadSearchHistory, removeSearch, saveSearchHistory } from "./searchHistory";

describe("🕘 the home search's history", () => {
  beforeEach(() => window.localStorage.clear());

  it("newest first; typing letter by letter leaves one entry; a repeat moves up", () => {
    let h: string[] = [];
    h = addSearch(h, "سا");
    h = addSearch(h, "سالم");
    expect(h).toEqual(["سالم"]);
    h = addSearch(h, "KIT3040");
    h = addSearch(h, "  سالم ");
    expect(h).toEqual(["سالم", "KIT3040"]);
    expect(addSearch(h, "أ")).toEqual(h); // one letter isn't a search
    expect(removeSearch(h, "KIT3040")).toEqual(["سالم"]);
  });

  it("keeps the last 15", () => {
    let h: string[] = [];
    for (let i = 0; i < 20; i++) h = addSearch(h, `جهاز ${i}x`);
    expect(h).toHaveLength(15);
    expect(h[0]).toBe("جهاز 19x");
  });

  it("saved on the phone, never in the backup", () => {
    saveSearchHistory(["سالم"]);
    expect(loadSearchHistory()).toEqual(["سالم"]);
    expect(Object.keys(window.localStorage).some((k) => k.startsWith("starnet_"))).toBe(false);
    saveSearchHistory([]);
    expect(loadSearchHistory()).toEqual([]);
  });
});
