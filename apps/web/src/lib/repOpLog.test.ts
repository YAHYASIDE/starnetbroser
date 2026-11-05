import { describe, expect, it } from "vitest";
import { findOps, importSent, logOp, markProofKept, nextSerial, opProofKey, opReceiptDoc, opSourceText, type LoggedOp } from "./repOpLog";

const base = (over: Partial<Omit<LoggedOp, "serial">> = {}): Omit<LoggedOp, "serial"> => ({
  repId: "r1",
  ids: ["SIFA:s1"],
  token: "0a1b2c3d",
  at: "2026-11-05T18:08:00.000Z",
  sentAt: "2026-11-05T18:08:05.000Z",
  account: "🟠 حساب شخصي",
  kind: "➕ له · استلمت منه نقدًا",
  figures: [{ code: "SIFA", before: -585179, amount: 3200, after: -581979 }],
  text: "🔔 STAR NET | دفعة مستلمة\n🔢 رقم العملية: #1\n💵 العملية: 3,200 سيفا",
  source: "🤖 من رسالته في البوت: «سلّمت 3200»",
  ...over,
});

describe("📜 the operations log", () => {
  it("each rep counts his own; the same message twice is one", () => {
    let store = {};
    expect(nextSerial(store, "r1")).toBe(1);
    let r = logOp(store, base());
    store = r.store;
    expect(r.serial).toBe(1);
    r = logOp(store, base({ token: "11111111" }));
    store = r.store;
    expect(r.serial).toBe(2);
    expect(logOp(store, base({ repId: "r2", token: "22222222" })).serial).toBe(1);
    const again = logOp(store, base());
    expect(again.serial).toBe(1);
    expect(again.store).toBe(store);
    expect(nextSerial(store, "r1")).toBe(3);
  });

  it("what the bot sent before gets numbers once, oldest first", () => {
    const sent = [
      { token: "bbbbbbbb", repId: "r1", opId: "x2", account: "a", text: "second", at: 20 },
      { token: "aaaaaaaa", repId: "r1", opId: "x1", account: "a", text: "first", at: 10 },
      { token: "cccccccc", repId: "r2", opId: "y", account: "a", text: "other rep", at: 5 },
    ];
    const store = importSent({}, "r1", sent);
    expect(store.r1!.ops.map((o) => [o.serial, o.text, o.imported])).toEqual([[1, "first", true], [2, "second", true]]);
    expect(importSent(store, "r1", sent)).toBe(store);
  });

  it("finds by number, amount or word; newest first", () => {
    let store = logOp({}, base()).store;
    store = logOp(store, base({ token: "11111111", text: "💵 العملية: 600 سيفا", source: "✍️ سجّلتها أنت في التطبيق" })).store;
    expect(findOps(store, "r1").map((o) => o.serial)).toEqual([2, 1]);
    expect(findOps(store, "r1", "#1").map((o) => o.serial)[0]).toBe(1);
    expect(findOps(store, "r1", "600").map((o) => o.serial)).toEqual([2]);
    expect(findOps(store, "r1", "سلّمت").map((o) => o.serial)).toEqual([1]);
    expect(markProofKept(store, "r1", 1).r1!.ops.find((o) => o.serial === 1)!.proofKept).toBe(true);
    expect(opProofKey({ repId: "r1", serial: 7 })).toBe("oplog:r1:7");
  });

  it("says where it came from", () => {
    expect(opSourceText({ requestText: "سلّمت 3200", byBot: true })).toBe("🤖 من رسالته في البوت: «سلّمت 3200» - ثم وافقت عليها");
    expect(opSourceText({ byBot: false })).toBe("✍️ سجّلتها أنت في التطبيق");
    expect(opSourceText({ byBot: true, handoverNote: "🤲 مبلغ واحد سلّمته: 2,600 + 600" })).toBe("🤖 من بوت الأموال\n🤲 مبلغ واحد سلّمته: 2,600 + 600");
  });

  it("the receipt carries the number, the figures and the source", () => {
    const op = { ...base(), serial: 57 };
    const doc = opReceiptDoc(op, "الحسين");
    expect(doc.title).toBe("إيصال عملية #57");
    const cells = doc.rows.map((r) => r.join(" = "));
    expect(cells).toContain("رقم العملية = #57");
    expect(cells).toContain("المبلغ = +3,200 سيفا");
    expect(cells).toContain("الرصيد قبل = 585,179 سيفا عليه");
    expect(cells.find((c) => c.startsWith("المصدر"))).toContain("سلّمت 3200");
  });
});
