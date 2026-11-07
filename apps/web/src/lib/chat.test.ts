import { describe, expect, it } from "vitest";
import {
  addChatMessages,
  chatAtKey,
  chatNotification,
  chatTime,
  isMine,
  messagesOf,
  newChatMessage,
  parseChatPayload,
  pruneChat,
  repConv,
  repIdOfConv,
  TEAM_CONV,
  unreadCount,
  type ChatMessage,
} from "./chat";

const img = "data:image/jpeg;base64,AAAA";
let n = 0;
const rid = () => `abcdef${String(++n).padStart(6, "0")}`;

describe("💬 messages", () => {
  it("nothing to send = no message; text trimmed and capped; a bad picture dropped", () => {
    expect(newChatMessage({ conv: TEAM_CONV, from: "owner", by: "YAHYA", text: "  " }, 1, rid)).toBeNull();
    const m = newChatMessage({ conv: TEAM_CONV, from: "owner", by: " YAHYA ", member: "phone", text: ` ${"x".repeat(1200)} `, image: "javascript:x" }, 5, rid)!;
    expect(m.text).toHaveLength(1000);
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

  it("added once, oldest first, the last 500 of a conversation kept", () => {
    const a = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "a", text: "1" }, 20, rid)!;
    const b = newChatMessage({ conv: TEAM_CONV, from: "owner", by: "b", text: "2" }, 10, rid)!;
    let r = addChatMessages({}, [a, b]);
    expect(r.added).toHaveLength(2);
    r = addChatMessages(r.store, [a]);
    expect(r.added).toHaveLength(0);
    expect(messagesOf(r.store, TEAM_CONV).map((m) => m.text)).toEqual(["2", "1"]);
    const many: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({ id: `abcdef0000${i}0`, conv: TEAM_CONV, from: "owner", by: "x", text: String(i), at: i }));
    const pruned = pruneChat(Object.fromEntries(many.map((m) => [m.id, m])), 4);
    expect(messagesOf(pruned, TEAM_CONV).map((m) => m.text)).toEqual(["2", "3", "4", "5"]);
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
