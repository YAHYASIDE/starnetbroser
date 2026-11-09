import { describe, expect, it } from "vitest";
import { chatRows, EMPTY_PREFS, foldSearch, togglePref } from "./chatList";

const rows = [
  { conv: "team", title: "👥 الفريق", lastAt: 10, unread: 0, texts: ["صباح الخير", "الطبق لا يتصل"] },
  { conv: "rep:r1", title: "🤝 مندوب تجريبي", lastAt: 30, unread: 2, texts: ["أرسلت الدفعة"] },
  { conv: "rep:r2", title: "🤝 مندوب آخر", lastAt: 20, unread: 0, texts: ["تمام"] },
];

describe("💬 organising the conversations (his Nov 9 2026 brief)", () => {
  it("📌 pinned first, then the newest; 🗄️ archived only under its filter (or a search)", () => {
    let prefs = togglePref(EMPTY_PREFS, "pinned", "team");
    expect(chatRows(rows, prefs, "all", "").map((r) => r.conv)).toEqual(["team", "rep:r1", "rep:r2"]);
    prefs = togglePref(prefs, "archived", "rep:r2");
    expect(chatRows(rows, prefs, "all", "").map((r) => r.conv)).toEqual(["team", "rep:r1"]);
    expect(chatRows(rows, prefs, "archived", "").map((r) => r.conv)).toEqual(["rep:r2"]);
    expect(chatRows(rows, prefs, "all", "تمام").map((r) => r.conv)).toEqual(["rep:r2"]);
    // archiving unpins, pinning unarchives
    expect(togglePref(prefs, "archived", "team").pinned).toEqual([]);
    expect(togglePref(prefs, "pinned", "rep:r2").archived).toEqual([]);
  });

  it("filters, and the search finds a name or what was written (hamza / ta marbuta folded)", () => {
    expect(chatRows(rows, EMPTY_PREFS, "unread", "").map((r) => r.conv)).toEqual(["rep:r1"]);
    expect(chatRows(rows, EMPTY_PREFS, "reps", "").map((r) => r.conv)).toEqual(["rep:r1", "rep:r2"]);
    expect(chatRows(rows, EMPTY_PREFS, "team", "").map((r) => r.conv)).toEqual(["team"]);
    const found = chatRows(rows, EMPTY_PREFS, "all", "الدفعه");
    expect(found).toEqual([expect.objectContaining({ conv: "rep:r1", hit: "أرسلت الدفعة" })]);
    expect(chatRows(rows, EMPTY_PREFS, "all", "اخر").map((r) => r.conv)).toEqual(["rep:r2"]);
    expect(foldSearch("أإآ ة ى")).toBe("ااا ه ي");
  });
});
