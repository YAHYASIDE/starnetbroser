import { describe, expect, it } from "vitest";
import { applyRating, EMPTY_OP_RATINGS, markReviewed, MAX_SENT, openFlags, parseRatingRecord, recordSentOp } from "./repOpRatings";

const T = "0a1b2c3d";
const sent = { token: T, repId: "r1", opId: "SIFA:customer-1", account: "🟠 حساب شخصي", text: "🔔 STAR NET | حركة مالية جديدة\n💵 العملية: 3,000 سيفا", at: 1 };

describe("✅ / ❌ under the money bot's operation messages", () => {
  it("«جيد» is recorded quietly - no open flag", () => {
    const { store, change } = applyRating(recordSentOp(EMPTY_OP_RATINGS, sent), { token: T, repId: "r1", verdict: "good", by: "Ali", at: 10 });
    expect(change).toBe("new");
    expect(store.ratings[T]).toMatchObject({ verdict: "good", by: "Ali", at: 10, history: [{ verdict: "good", by: "Ali", at: 10 }] });
    expect(openFlags(store)).toEqual([]);
  });

  it("«غير جيد» opens a flag linked to its operation, until «✓ راجعتها»", () => {
    const { store } = applyRating(recordSentOp(EMPTY_OP_RATINGS, sent), { token: T, repId: "r1", verdict: "bad", by: "Ali", at: 20 });
    const flags = openFlags(store);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.op?.opId).toBe("SIFA:customer-1");
    expect(flags[0]!.text).toContain("3,000 سيفا");
    const reviewed = markReviewed(store, T, 30);
    expect(openFlags(reviewed)).toEqual([]);
    expect(reviewed.ratings[T]!.reviewedAt).toBe(30);
  });

  it("pressing the same choice again changes nothing; changing it keeps the history", () => {
    let s = applyRating(EMPTY_OP_RATINGS, { token: T, repId: "r1", verdict: "bad", by: "Ali", at: 1 }).store;
    const again = applyRating(s, { token: T, repId: "r1", verdict: "bad", by: "Ali", at: 2 });
    expect(again.change).toBe("same");
    expect(again.store).toBe(s);
    const changed = applyRating(s, { token: T, repId: "r1", verdict: "good", by: "Ali", at: 3 });
    expect(changed.change).toBe("changed");
    s = changed.store;
    expect(s.ratings[T]!.history.map((h) => h.verdict)).toEqual(["bad", "good"]);
    expect(openFlags(s)).toEqual([]); // he changed his mind - nothing to review
    s = applyRating(markReviewed(applyRating(s, { token: T, repId: "r1", verdict: "bad", by: "Ali", at: 4 }).store, T, 5), { token: T, repId: "r1", verdict: "good", by: "Ali", at: 6 }).store;
    s = applyRating(s, { token: T, repId: "r1", verdict: "bad", by: "Ali", at: 7 }).store;
    expect(openFlags(s)).toHaveLength(1); // a new «غير جيد» is open again
  });

  it("💳 «غير جيد» from the chat keeps his reason; the same answer again changes nothing", () => {
    const input = { token: "0a1b2c3d", repId: "r1", verdict: "bad" as const, by: "الحافظ", at: 5, note: "استلمت 900 وليس 1000" };
    const first = applyRating(EMPTY_OP_RATINGS, input);
    expect(first.change).toBe("new");
    expect(first.store.ratings["0a1b2c3d"]!.note).toBe("استلمت 900 وليس 1000");
    expect(openFlags(first.store)[0]!.rating.note).toBe("استلمت 900 وليس 1000");
    expect(applyRating(first.store, { ...input, at: 9 }).change).toBe("same");
    expect(applyRating(first.store, { ...input, at: 9, note: "900 فقط" }).change).toBe("changed");
  });

  it("a rating with no sent record still shows what Telegram gave back", () => {
    const { store } = applyRating(EMPTY_OP_RATINGS, { token: T, repId: "r1", verdict: "bad", by: "Ali", at: 1, text: "نص الرسالة" });
    expect(openFlags(store)[0]!.text).toBe("نص الرسالة");
  });

  it("bad input is ignored; the service's record is parsed", () => {
    expect(applyRating(EMPTY_OP_RATINGS, { token: "zz", repId: "r1", verdict: "bad", by: "", at: 1 }).change).toBe("same");
    expect(parseRatingRecord('{"repId":"r1","token":"0a1b2c3d","verdict":"b","by":"Mamadou","at":5,"text":"x"}')).toEqual({ repId: "r1", token: T, verdict: "bad", by: "Mamadou", at: 5, text: "x" });
    expect(parseRatingRecord('{"repId":"r1","token":"0a1b2c3d","verdict":"g","at":5}')).toMatchObject({ verdict: "good", by: "المندوب" });
    expect(parseRatingRecord('{"repId":"r1","token":"0a1b2c3d","verdict":"x"}')).toBeNull();
    expect(parseRatingRecord("not json")).toBeNull();
  });

  it("keeps the newest sent operations only", () => {
    let s = EMPTY_OP_RATINGS;
    for (let i = 0; i < MAX_SENT + 5; i++) s = recordSentOp(s, { ...sent, token: i.toString(16).padStart(8, "0"), at: i });
    expect(Object.keys(s.sent)).toHaveLength(MAX_SENT);
    expect(s.sent["00000000"]).toBeUndefined();
  });
});
