import { describe, expect, it } from "vitest";
import { EVENT_LOG_MAX, eventTitle, markRead, mergeEvents, removeEvent, unreadCount, type LoggedEvent } from "./eventLog";

const ev = (id: string, at: number, text = `حدث ${id}`): LoggedEvent => ({ id, text, route: "/", at });

describe("🔔 the app's own notification list", () => {
  it("adds each event once, newest first", () => {
    const list = mergeEvents([ev("a", 1)], [ev("b", 3), ev("a", 1), ev("c", 2)]);
    expect(list.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps the newest when it grows too long", () => {
    const many = Array.from({ length: EVENT_LOG_MAX + 5 }, (_, i) => ev(`e${i}`, i));
    const list = mergeEvents([], many);
    expect(list).toHaveLength(EVENT_LOG_MAX);
    expect(list[0]!.id).toBe(`e${EVENT_LOG_MAX + 4}`);
  });

  it("unread, read, removed - only by his hand", () => {
    const list = mergeEvents([], [ev("a", 1), ev("b", 2)]);
    expect(unreadCount(list)).toBe(2);
    expect(unreadCount(markRead(list, "a"))).toBe(1);
    expect(unreadCount(markRead(list))).toBe(0);
    expect(removeEvent(list, "a").map((e) => e.id)).toEqual(["b"]);
  });

  it("the first line is the title", () => {
    expect(eventTitle({ text: "🛂 كشف توثيق\nفُحص 8" })).toEqual({ title: "🛂 كشف توثيق", body: "فُحص 8" });
  });
});
