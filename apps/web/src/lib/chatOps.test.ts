import { describe, expect, it } from "vitest";
import { chatOpFrom, chatOpMessageId, cleanChatOp, cleanChatOpRate, opStatusOf } from "./chatOps";
import { newChatMessage, parseChatPayload, repConv, TEAM_CONV, visibleMessages } from "./chat";
import { opToken } from "./repOpMessage";
import type { BotAccount, BotLine } from "./repBotStatement";

const line: BotLine = { id: "l:demo-1", date: "2026-11-09", text: "💵 دفعة", kind: "💵 دفعة استلمتها", amount: { MRU: 1000 }, after: { MRU: 4000 }, at: "2026-11-09T10:30:00.000Z" };
const account: BotAccount = { key: "a0", title: "🟢 حساب الأوقية", balance: { MRU: 4000 }, stored: { MRU: 4000 }, isProfit: false, isNamed: false, lines: [line] };
let n = 0;
const rid = () => `abcdef${String(++n).padStart(6, "0")}`;

describe("💳 operation cards in the rep's conversation (his Nov 9 2026 brief)", () => {
  it("before · the operation · after per currency, its token and number, never a balance change", () => {
    const op = chatOpFrom("r1", account, line, { name: "DEMO 1", email: "demo@example.com" }, 12);
    expect(op).toMatchObject({ token: opToken("r1", "l:demo-1"), serial: 12, headline: "دفعة مستلمة", account: "🟢 حساب الأوقية", day: "09/11" });
    expect(op.figures).toEqual([{ code: "MRU", before: 3000, amount: 1000, after: 4000 }]);
    expect(op.device).toEqual({ name: "DEMO 1", email: "demo@example.com" });
  });

  it("the same operation is always the same message (no double card); only the operator's side sends cards", () => {
    const op = chatOpFrom("r1", account, line);
    const a = newChatMessage({ conv: repConv("r1"), from: "owner", by: "YAHYA", text: "", op }, 1, rid)!;
    const b = newChatMessage({ conv: repConv("r1"), from: "owner", by: "YAHYA", text: "", op }, 2, rid)!;
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(chatOpMessageId(op.token));
    expect(a.text).toContain("1,000 MRU");
    expect(parseChatPayload(JSON.stringify(a), repConv("r1"))!.op!.figures[0]!.after).toBe(4000);
    expect(parseChatPayload(JSON.stringify({ ...a, from: "rep" }), repConv("r1"))?.op).toBeUndefined();
    expect(newChatMessage({ conv: TEAM_CONV, from: "owner", by: "x", text: "", op }, 1, rid)?.op).toBeUndefined();
    expect(cleanChatOp({ ...op, figures: [] })).toBeUndefined();
  });

  it("«جيد / غير جيد»: a hidden answer from the rep; «غير جيد» says why; the card shows his last answer", () => {
    const op = chatOpFrom("r1", account, line);
    const card = newChatMessage({ conv: repConv("r1"), from: "owner", by: "YAHYA", text: "", op }, 1, rid)!;
    const bad = newChatMessage({ conv: repConv("r1"), from: "rep", by: "الحافظ", text: "", opRate: { token: op.token, verdict: "bad", note: " المبلغ 900 فقط " } }, 5, rid)!;
    expect(bad.text).toBe("❌ غير جيد: المبلغ 900 فقط");
    const good = newChatMessage({ conv: repConv("r1"), from: "rep", by: "الحافظ", text: "", opRate: { token: op.token, verdict: "good" } }, 9, rid)!;
    expect(good.text).toBe("");
    expect(newChatMessage({ conv: repConv("r1"), from: "owner", by: "x", text: "", opRate: { token: op.token, verdict: "good" } }, 1, rid)).toBeNull();
    const store = Object.fromEntries([card, bad, good].map((m) => [m.id, m]));
    expect(visibleMessages(store, repConv("r1")).map((m) => m.id)).toEqual([card.id]);
    expect(opStatusOf([bad], op.token)).toEqual({ state: "bad", at: 5, note: "المبلغ 900 فقط" });
    expect(opStatusOf([bad, good], op.token)).toEqual({ state: "good", at: 9 });
    expect(opStatusOf([], op.token)).toEqual({ state: "waiting" });
    expect(cleanChatOpRate({ token: "zz", verdict: "good" })).toBeUndefined();
    expect(parseChatPayload(JSON.stringify(bad), repConv("r1"))!.opRate).toEqual({ token: op.token, verdict: "bad", note: "المبلغ 900 فقط" });
  });
});
