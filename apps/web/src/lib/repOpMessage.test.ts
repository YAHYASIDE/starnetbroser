import { describe, expect, it } from "vitest";
import type { BotAccount, BotLine } from "./repBotStatement";
import { balanceWords, escapeHtml, opsToSend, opToken, opWhen, ratingKeyboard, repOpMessage, resultWords, mergeHandoverOps } from "./repOpMessage";

const personal = (lines: BotLine[] = []): BotAccount => ({ key: "a0", title: "🟠 حساب شخصي", balance: {}, stored: {}, isProfit: false, isNamed: false, lines });
const profit: BotAccount = { key: "a1", title: "💰 حساب الربح", balance: {}, stored: {}, isProfit: true, isNamed: false, lines: [] };

function line(over: Partial<BotLine>): BotLine {
  return { id: "SIFA:customer-1", date: "2026-11-01", text: "📡 تجديد عليه · جهاز", amount: { SIFA: -3000 }, after: { SIFA: -624123 }, kind: "📡 تجديد عليه", at: "2026-11-01T01:48:00", accountId: "d1", ...over };
}

describe("🔔 the money bot's operation message (his Nov 1 2026 brief)", () => {
  it("a renewal on him: before 621,123 عليك + 3,000 → after 624,123 عليك, «زاد ما عليك»", () => {
    const m = repOpMessage("r1", personal(), line({}), { email: "fake.user240@outlook.com", name: "fake.user240@outlook.com" });
    expect(m.figures).toEqual([{ code: "SIFA", before: -621123, amount: -3000, after: -624123 }]);
    expect(m.html).toContain("🔔 <b>STAR NET | حركة مالية جديدة</b>");
    expect(m.html).toContain("🗓️ <b>01/11</b> — 01:48 ص");
    expect(m.html).toContain("📧 <code>fake.user240@outlook.com</code>");
    expect(m.html).not.toContain("📡 fake.user240"); // the name is the email - not twice
    expect(m.html).toContain("<b>💵 العملية: 3,000 سيفا</b>");
    expect(m.html).toContain("📊 الرصيد قبل: <b>621,123</b> سيفا عليك");
    expect(m.html).toContain("💰 الرصيد بعد: <b>624,123</b> سيفا عليك");
    expect(m.html).toContain("📈 النتيجة: زاد ما عليك <b>3,000 سيفا</b>");
    // the order he asked for: date, email, account, type, amount, before, after, result
    const order = ["🗓️", "📧", "🟠 حساب شخصي", "📡 تجديد عليه", "💵 العملية", "📊 الرصيد قبل", "💰 الرصيد بعد", "النتيجة"].map((w) => m.html.indexOf(w));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("his 3,000 + 1,000 = 4,000 example", () => {
    const m = repOpMessage("r1", personal(), line({ amount: { SIFA: -1000 }, after: { SIFA: -4000 } }));
    expect(m.figures[0]).toEqual({ code: "SIFA", before: -3000, amount: -1000, after: -4000 });
    expect(m.html).toContain("📊 الرصيد قبل: <b>3,000</b> سيفا عليك");
    expect(m.html).toContain("💰 الرصيد بعد: <b>4,000</b> سيفا عليك");
  });

  it("a payment received: 635,123 → 621,123 عليك, «نقص ما عليك» and the «دفعة مستلمة» header", () => {
    const m = repOpMessage("r1", personal(), line({ id: "SIFA:settlement-2", kind: "➕ له · استلمت منه نقدًا", text: "➕ له · استلمت منه نقدًا", amount: { SIFA: 14000 }, after: { SIFA: -621123 }, accountId: undefined }));
    expect(m.figures[0]).toEqual({ code: "SIFA", before: -635123, amount: 14000, after: -621123 });
    expect(m.html).toContain("STAR NET | دفعة مستلمة");
    expect(m.html).toContain("📉 النتيجة: نقص ما عليك <b>14,000 سيفا</b>");
    expect(m.html).not.toContain("📧");
  });

  it("a profit with cents: 158,963.53 + 9,862.24 = 168,825.77 أوقية لك, «زادت أرباحك»", () => {
    const m = repOpMessage("r1", profit, line({ id: "profit:device-3", kind: "📈 حصته من الربح", amount: { MRU: 9862.24 }, after: { MRU: 168825.77 } }), { email: "x@y.com", name: "حامدل" });
    expect(m.figures[0]).toEqual({ code: "MRU", before: 158963.53, amount: 9862.24, after: 168825.77 });
    expect(m.html).toContain("STAR NET | ربح جديد");
    expect(m.html).toContain("📡 حامدل");
    expect(m.html).toContain("<b>💵 العملية: 9,862.24 أوقية</b>");
    expect(m.html).toContain("📊 الرصيد قبل: <b>158,963.53</b> أوقية لك");
    expect(m.html).toContain("💰 الرصيد بعد: <b>168,825.77</b> أوقية لك");
    expect(m.html).toContain("📈 النتيجة: زادت أرباحك <b>9,862.24 أوقية</b>");
  });

  it("two operations in a row on one account chain: the second's «قبل» is the first's «بعد»", () => {
    const first = repOpMessage("r1", personal(), line({ id: "a", amount: { SIFA: -3000 }, after: { SIFA: -624123 } }));
    const second = repOpMessage("r1", personal(), line({ id: "b", amount: { SIFA: 14000 }, after: { SIFA: -610123 } }));
    expect(second.figures[0]!.before).toBe(first.figures[0]!.after);
    for (const m of [first, second]) for (const f of m.figures) expect(Math.round((f.before + f.amount) * 100) / 100).toBe(f.after);
  });

  it("crossing zero says so, and each currency is its own block", () => {
    expect(resultWords(-1000, 3000, "SIFA", false)).toBe("✅ النتيجة: سُدّد ما عليك وصار لك <b>2,000 سيفا</b>");
    expect(resultWords(1000, -3000, "SIFA", false)).toBe("⚠️ النتيجة: انتهى ما لك وصار عليك <b>2,000 سيفا</b>");
    expect(resultWords(-3000, 3000, "SIFA", false)).toBe("✅ النتيجة: سُدّد ما عليك كله (<b>3,000 سيفا</b>)");
    expect(balanceWords(0, "MRU")).toBe("<b>0</b> أوقية ✓");
    const both = repOpMessage("r1", profit, line({ amount: { MRU: 100, SIFA: 50 }, after: { MRU: 300, SIFA: 50 } }));
    expect(both.figures.map((f) => f.code)).toEqual(["MRU", "SIFA"]);
    expect(both.html.split("💵 العملية").length).toBe(3);
  });

  it("a long email, Arabic and French names, and HTML characters are shown safely", () => {
    const m = repOpMessage("r1", personal(), line({ note: "Café <test> & co", kind: "➖ عليه" }), { email: "a.very.long.fake.address.for.testing.purposes.only@outlook-example.com", name: "Jean-François محمد" });
    expect(m.html).toContain("<code>a.very.long.fake.address.for.testing.purposes.only@outlook-example.com</code>");
    expect(m.html).toContain("📡 Jean-François محمد");
    expect(m.html).toContain("Café &lt;test&gt; &amp; co");
    expect(m.plain).toContain("Café <test> & co");
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("whole سيفا, cents for أوقية; the time in 12 hours with ص / م", () => {
    const m = repOpMessage("r1", personal(), line({ amount: { SIFA: -2999.6 }, after: { SIFA: -3000.4 } }));
    expect(m.html).toContain("💵 العملية: 3,000 سيفا");
    expect(opWhen({ date: "2026-10-31", at: "2026-10-31T21:30:00" })).toEqual({ day: "31/10", time: "09:30 م" });
    expect(opWhen({ date: "2026-10-31", at: "2026-10-31T00:05:00" })).toEqual({ day: "31/10", time: "12:05 ص" });
    expect(opWhen({ date: "2026-10-31" })).toEqual({ day: "31/10" });
  });

  it("the buttons carry a short stable token of the operation (Telegram allows 64 bytes)", () => {
    const t = opToken("rep-1", "SIFA:customer-6f0c2a8e-1234-4bcd-9e10-aaaaaaaaaaaa");
    expect(t).toMatch(/^[0-9a-f]{8}$/);
    expect(opToken("rep-1", "SIFA:customer-6f0c2a8e-1234-4bcd-9e10-aaaaaaaaaaaa")).toBe(t);
    expect(opToken("rep-2", "SIFA:customer-6f0c2a8e-1234-4bcd-9e10-aaaaaaaaaaaa")).not.toBe(t);
    const kb = JSON.parse(ratingKeyboard(t));
    expect(kb.inline_keyboard[0].map((b: { text: string; callback_data: string }) => [b.text, b.callback_data])).toEqual([
      ["✅ جيد", `rt:g:${t}`],
      ["❌ غير جيد", `rt:b:${t}`],
    ]);
  });

  it("many new operations: the newest few, sent oldest first", () => {
    const found = [5, 1, 4, 2, 3].map((n) => ({ line: line({ id: String(n), at: `2026-11-01T0${n}:00:00` }) }));
    const { send, more } = opsToSend(found, 3);
    expect(send.map((x) => x.line.id)).toEqual(["3", "4", "5"]);
    expect(more).toBe(2);
  });
});

describe("🔔 the message matches his statement (built through «كشفي»'s own accounts)", () => {
  it("a named account's operations: every message's before / after is the statement's running balance", async () => {
    const { repBotAccounts } = await import("./repBotStatement");
    const book = {
      ledgers: [{ id: "L1", repId: "r1", name: "أورانج", kind: "orange" as never, currencies: ["SIFA"], createdAt: "2026-10-01T00:00:00Z" }],
      entries: [
        { id: "e1", ledgerId: "L1", direction: "debit" as const, amount: 3000, currencyCode: "SIFA", date: "2026-10-30", createdAt: "2026-10-30T10:00:00Z" },
        { id: "e2", ledgerId: "L1", direction: "debit" as const, amount: 1000, currencyCode: "SIFA", date: "2026-10-31", createdAt: "2026-10-31T10:00:00Z" },
        { id: "e3", ledgerId: "L1", direction: "credit" as const, amount: 2500, currencyCode: "SIFA", date: "2026-11-01", createdAt: "2026-11-01T10:00:00Z" },
      ],
    };
    const [account] = repBotAccounts([], book, "r1", () => "");
    const msgs = account!.lines.map((l) => repOpMessage("r1", account!, l));
    // newest first: +2500 (−4000 → −1500), −1000 (−3000 → −4000), −3000 (0 → −3000)
    expect(msgs.map((m) => m.figures[0])).toEqual([
      { code: "SIFA", before: -4000, amount: 2500, after: -1500 },
      { code: "SIFA", before: -3000, amount: -1000, after: -4000 },
      { code: "SIFA", before: 0, amount: -3000, after: -3000 },
    ]);
    for (let i = 0; i + 1 < msgs.length; i++) expect(msgs[i]!.figures[0]!.before).toBe(msgs[i + 1]!.figures[0]!.after);
    expect(msgs[0]!.html).toContain("➕ له");
    expect(msgs[2]!.html).toContain("📈 النتيجة: زاد ما عليك <b>3,000 سيفا</b>");
  });
});

describe("🤲 one handed-over sum = one message", () => {
  const acc = { key: "a0", title: "🟠 حساب شخصي", balance: {}, stored: {}, isProfit: false, isNamed: false, lines: [] };
  // 3,200 handed over: 2,600 paid a customer's device, 600 put in his account (balance 585,179 عليه → 581,979)
  const devicePart: BotLine = { id: "SIFA:c1", date: "2026-11-05", text: "x", amount: { SIFA: 2600 }, after: { SIFA: -582579 }, at: "2026-11-05T18:08:00.001Z", accountId: "d1", group: "ho-1" };
  const rest: BotLine = { id: "SIFA:s1", date: "2026-11-05", text: "➕ له · استلمت منه نقدًا", amount: { SIFA: 600 }, after: { SIFA: -581979 }, at: "2026-11-05T18:08:00.002Z", group: "ho-1" };
  const other: BotLine = { id: "SIFA:s2", date: "2026-11-05", text: "y", amount: { SIFA: 3200 }, after: { SIFA: -578779 }, at: "2026-11-05T18:10:00Z" };
  const note = (l: { accountId?: string }, _code: string, amount: number) => (l.accountId ? `${amount} عن جهاز` : `${amount} في حسابك`);

  it("adds the parts, before the first and after the last, and says where each went", () => {
    const out = mergeHandoverOps([{ account: acc, line: other }, { account: acc, line: rest }, { account: acc, line: devicePart }], note);
    expect(out).toHaveLength(2);
    const one = out.find((o) => o.ids.length === 2)!;
    expect(one.ids.sort()).toEqual(["SIFA:c1", "SIFA:s1"]);
    expect(one.line.amount).toEqual({ SIFA: 3200 });
    expect(one.line.after).toEqual({ SIFA: -581979 });
    expect(one.line.note).toBe("🤲 مبلغ واحد سلّمته: 2600 عن جهاز + 600 في حسابك");
    expect(one.line.accountId).toBeUndefined();
    const msg = repOpMessage("r1", acc, one.line);
    expect(msg.plain).toContain("3,200 سيفا");
    expect(msg.plain).toContain("585,179 سيفا عليك");
    expect(out.find((o) => o.line.id === "SIFA:s2")!.ids).toEqual(["SIFA:s2"]);
  });
});
