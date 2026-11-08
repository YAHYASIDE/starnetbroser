import { describe, expect, it } from "vitest";
import {
  dayLabel,
  deleteForMe,
  isReadByOthers,
  nameHue,
  readerId,
  replyOf,
  visibleMessages,
  addChatMessages,
  chatMediaKey,
  hasAudio,
  hasImage,
  STATEMENT_ASK_TEXT,
  stripChatMedia,
  withChatMedia,
  chatAtKey,
  chatNotification,
  chatTime,
  isMine,
  messagesOf,
  newChatMessage,
  parseChatPayload,
  repConv,
  repIdOfConv,
  TEAM_CONV,
  unreadCount,
  type ChatMessage,
} from "./chat";

const img = "data:image/jpeg;base64,AAAA";
let n = 0;
const rid = () => `abcdef${String(++n).padStart(6, "0")}`;

describe("🎤📞 voice messages and calls", () => {
  const voice = "data:audio/webm;codecs=opus;base64,GkXfo0AAAA==";
  it("a voice message alone is a message; its length is kept within 90 s; a bad audio is dropped", () => {
    const m = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "YAHYA", text: "", audio: voice, seconds: 12.4 }, 1, rid)!;
    expect(m).toMatchObject({ audio: voice, seconds: 12, text: "" });
    expect(chatNotification(m)).toBe("💬 YAHYA: 🎤 رسالة صوتية");
    expect(newChatMessage({ conv: TEAM_CONV, from: "owner", by: "x", text: "", audio: "data:text/html;base64,AAAA" }, 1, rid)).toBeNull();
    const back = parseChatPayload(JSON.stringify({ ...m, seconds: 500 }), TEAM_CONV)!;
    expect(back.seconds).toBe(90);
  });
  it("a call says so in words (the background notification shows it) and keeps its id", () => {
    const m = newChatMessage({ conv: repConv("r1"), from: "owner", by: "YAHYA", text: "ignored", call: { id: "abcdef123456" } }, 1, rid)!;
    expect(m).toMatchObject({ text: "📞 مكالمة صوتية", call: { id: "abcdef123456" } });
    expect(parseChatPayload(JSON.stringify(m), repConv("r1"))!.call).toEqual({ id: "abcdef123456" });
    expect(parseChatPayload(JSON.stringify({ ...m, call: { id: "../x" } }), repConv("r1"))!.call).toBeUndefined();
  });
});

describe("💬 messages", () => {
  it("nothing to send = no message; text trimmed and capped; a bad picture dropped", () => {
    expect(newChatMessage({ conv: TEAM_CONV, from: "owner", by: "YAHYA", text: "  " }, 1, rid)).toBeNull();
    const m = newChatMessage({ conv: TEAM_CONV, from: "owner", by: " YAHYA ", member: "phone", text: ` ${"x".repeat(2400)} `, image: "javascript:x" }, 5, rid)!;
    expect(m.text).toHaveLength(2000);
    expect(m.by).toBe("YAHYA");
    expect(m.image).toBeUndefined();
    const withDevice = newChatMessage({ conv: repConv("r1"), from: "rep", by: "", text: "", device: { id: "d1", name: "DEMO 1" } }, 5, rid)!;
    expect(withDevice).toMatchObject({ by: "المندوب", device: { id: "d1", name: "DEMO 1" }, text: "" });
  });

  it("a document opens into the conversation it came on; the team never has a «rep» message; junk is refused", () => {
    const m = newChatMessage({ conv: repConv("r1"), from: "rep", by: "الحسين", text: "السلام", image: img }, 9, rid)!;
    const back = parseChatPayload(JSON.stringify({ ...m, conv: "team" }), repConv("r1"))!;
    expect(back).toMatchObject({ conv: "rep:r1", from: "rep", text: "السلام", image: img, at: 9 });
    expect(parseChatPayload(JSON.stringify(m), TEAM_CONV)).toBeNull();
    expect(parseChatPayload(JSON.stringify({ ...m, id: "../x" }), repConv("r1"))).toBeNull();
    expect(parseChatPayload("not json", TEAM_CONV)).toBeNull();
    expect(parseChatPayload(JSON.stringify({ id: "abcdef123456", text: "" }), TEAM_CONV)).toBeNull();
  });

  it("added once, oldest first, nothing dropped", () => {
    const a = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "a", text: "1" }, 20, rid)!;
    const b = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "b", text: "2" }, 10, rid)!;
    let r = addChatMessages({}, [a, b]);
    expect(r.added).toHaveLength(2);
    r = addChatMessages(r.store, [a]);
    expect(r.added).toHaveLength(0);
    expect(messagesOf(r.store, TEAM_CONV).map((m) => m.text)).toEqual(["2", "1"]);
  });

  it("mine and unread: by member on the team, by side with a rep", () => {
    const store = Object.fromEntries(
      [
        { id: "abcdef000001", conv: TEAM_CONV, from: "owner" as const, by: "YAHYA", member: "phone", text: "a", at: 10 },
        { id: "abcdef000002", conv: TEAM_CONV, from: "owner" as const, by: "م2", member: "m2", text: "b", at: 20 },
        { id: "abcdef000003", conv: "rep:r1", from: "rep" as const, by: "الحسين", text: "c", at: 30 },
        { id: "abcdef000004", conv: "rep:r1", from: "owner" as const, by: "YAHYA", text: "d", at: 40 },
      ].map((m) => [m.id, m]),
    );
    const me = { rep: false, memberId: "phone" };
    expect(unreadCount(store, TEAM_CONV, {}, me)).toBe(1);
    expect(unreadCount(store, TEAM_CONV, { team: 20 }, me)).toBe(0);
    expect(unreadCount(store, "rep:r1", {}, me)).toBe(1);
    expect(unreadCount(store, "rep:r1", {}, { rep: true, memberId: "" })).toBe(1);
    expect(isMine(store.abcdef000004!, me)).toBe(true);
  });

  it("words: conversation ids, notification, time, query key", () => {
    expect(repIdOfConv("rep:r9")).toBe("r9");
    expect(repIdOfConv(TEAM_CONV)).toBeNull();
    expect(chatNotification({ by: "الحسين", text: "", image: img })).toBe("💬 الحسين: 📷 صورة");
    const now = new Date(2026, 10, 7, 15, 0).getTime();
    expect(chatTime(new Date(2026, 10, 7, 14, 5).getTime(), now)).toBe("14:05");
    expect(chatTime(new Date(2026, 10, 6, 9, 1).getTime(), now)).toBe("أمس 09:01");
    expect(chatTime(new Date(2026, 9, 2, 9, 1).getTime(), now)).toBe("2026/10/02 09:01");
    expect(chatAtKey(1700000000000)).toBe("001700000000000");
    expect(chatAtKey(5) < chatAtKey(40)).toBe(true);
  });
});

describe("💬 WhatsApp-like: reply, forward, delete, ✓✓", () => {
  const base = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, conv: TEAM_CONV, from: "owner", by: "YAHYA", member: "phone", text: "نص", at: 10, ...extra });

  it("a reply carries a short quote; forwarded is marked", () => {
    const original = base("abcdef000010", { text: "الطبق لا يتصل منذ الصباح" });
    const r = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "م2", member: "m2", text: "سأراه", reply: replyOf(original), forwarded: true }, 20, rid)!;
    expect(r.reply).toEqual({ id: "abcdef000010", by: "YAHYA", preview: "الطبق لا يتصل منذ الصباح" });
    expect(r.forwarded).toBe(true);
    expect(parseChatPayload(JSON.stringify(r), TEAM_CONV)!.reply!.id).toBe("abcdef000010");
  });

  it("delete for everyone: a hidden control message that only the sender's own counts", () => {
    const msg = base("abcdef000020", { image: img });
    const mine = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "YAHYA", member: "phone", text: "", deleteOf: "abcdef000020" }, 30, rid)!;
    const someoneElse = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "م2", member: "m2", text: "", deleteOf: "abcdef000020" }, 30, rid)!;
    expect(parseChatPayload(JSON.stringify(mine), TEAM_CONV)!.deleteOf).toBe("abcdef000020");
    const onlyOther = visibleMessages({ [msg.id]: msg, [someoneElse.id]: someoneElse }, TEAM_CONV);
    expect(onlyOther).toHaveLength(1);
    expect(onlyOther[0]!.image).toBe(img);
    const gone = visibleMessages({ [msg.id]: msg, [mine.id]: mine }, TEAM_CONV);
    expect(gone).toEqual([expect.objectContaining({ id: "abcdef000020", deleted: true, text: "" })]);
    expect(gone[0]!.image).toBeUndefined();
  });

  it("delete for me keeps a contentless mark", () => {
    const store = deleteForMe({ abcdef000030: base("abcdef000030", { image: img }) }, "abcdef000030");
    expect(store.abcdef000030).toMatchObject({ deleted: true, text: "" });
    expect(store.abcdef000030!.image).toBeUndefined();
    expect(deleteForMe(store, "nothing")).toBe(store);
  });

  it("✓✓ blue when another reader saw it; readers per side", () => {
    expect(readerId(TEAM_CONV, { rep: false, memberId: "phone" })).toBe("phone");
    expect(readerId(repConv("r1"), { rep: false, memberId: "phone" })).toBe("owner");
    expect(readerId(repConv("r1"), { rep: true, memberId: "" })).toBe("rep");
    const seen = { team: { phone: 100, m2: 50 } };
    expect(isReadByOthers({ conv: TEAM_CONV, at: 40 }, seen, "phone")).toBe(true);
    expect(isReadByOthers({ conv: TEAM_CONV, at: 60 }, seen, "phone")).toBe(false);
  });

  it("day lines and steady name colors", () => {
    const now = new Date(2026, 10, 8, 12).getTime();
    expect(dayLabel(new Date(2026, 10, 8, 1).getTime(), now)).toBe("اليوم");
    expect(dayLabel(new Date(2026, 10, 7, 23).getTime(), now)).toBe("أمس");
    expect(dayLabel(new Date(2026, 9, 2).getTime(), now)).toBe("2026/10/02");
    expect(nameHue("المسؤول 2")).toBe(nameHue("المسؤول 2"));
    expect(nameHue("a")).not.toBe(nameHue("b"));
  });
});


describe("🧾📄💾 statements, files, media kept apart (his Nov 8 2026 asks)", () => {
  const pdf = "data:application/pdf;base64,JVBERi0xLjQK";
  it("a PDF travels with its name and size; anything else is refused; only a rep asks for a statement", () => {
    const m = newChatMessage({ conv: repConv("r1"), from: "owner", by: "YAHYA", text: "🧾 كشف", file: { name: "كشف/المندوب.pdf", data: pdf } }, 1, rid)!;
    expect(m.file).toMatchObject({ name: "كشف المندوب.pdf", data: pdf });
    expect(parseChatPayload(JSON.stringify(m), repConv("r1"))!.file!.data).toBe(pdf);
    expect(parseChatPayload(JSON.stringify({ ...m, file: { name: "x", data: "data:text/html;base64,AAAA" } }), repConv("r1"))!.file).toBeUndefined();
    const ask = newChatMessage({ conv: repConv("r1"), from: "rep", by: "الحسين", text: "", statementAsk: true }, 1, rid)!;
    expect(ask).toMatchObject({ text: STATEMENT_ASK_TEXT, statementAsk: true });
    expect(newChatMessage({ conv: repConv("r1"), from: "owner", by: "x", text: "hi", statementAsk: true }, 1, rid)!.statementAsk).toBeUndefined();
  });

  it("nothing is dropped any more, whatever the number", () => {
    const many: ChatMessage[] = Array.from({ length: 700 }, (_, i) => ({ id: `abcdef${String(i).padStart(6, "0")}`, conv: TEAM_CONV, from: "owner", by: "x", text: String(i), at: i }));
    expect(messagesOf(addChatMessages({}, many).store, TEAM_CONV)).toHaveLength(700);
  });

  it("the picture / voice / file go to the media store and come back whole", () => {
    const m = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "x", text: "", image: img, file: { name: "a.pdf", data: pdf } }, 1, rid)!;
    const split = stripChatMedia(m)!;
    expect(split.message.image).toBeUndefined();
    expect(split.message.file).toEqual({ name: "a.pdf", size: m.file!.size });
    expect(split.message.stored).toEqual(["image", "file"]);
    expect(hasImage(split.message) && !hasAudio(split.message)).toBe(true);
    expect(stripChatMedia(split.message)).toBeNull();
    expect(withChatMedia(split.message, split.payload)).toMatchObject({ image: img, file: { name: "a.pdf", data: pdf } });
    expect(chatMediaKey("abc")).toBe("chatmedia:abc");
  });
});
