import { describe, expect, it } from "vitest";
import { addRepChat, chatRepsMap, removeRepChat, repChatPhones, repIdOfChat, targetChatIds, type RepChat } from "./repChatLinks";

describe("🤝 several phones per rep on the reps bot", () => {
  const one: Record<string, RepChat> = { r1: { chatId: "111", name: "هاتف 1" } };

  it("a second phone is added to the rep, the first stays", () => {
    const two = addRepChat(one, "r1", { chatId: "222", name: "هاتف 2" });
    expect(repChatPhones(two.r1).map((p) => p.chatId)).toEqual(["111", "222"]);
    expect(repIdOfChat(two, "222")).toBe("r1");
    expect(chatRepsMap(two)).toEqual({ "111": "r1", "222": "r1" });
  });

  it("a phone belongs to one rep: linking it to another moves it", () => {
    const moved = addRepChat(addRepChat(one, "r1", { chatId: "222", name: "x" }), "r2", { chatId: "111", name: "هاتف 1" });
    expect(moved.r1).toEqual({ chatId: "222", name: "x" });
    expect(moved.r2).toEqual({ chatId: "111", name: "هاتف 1" });
    // linking the same phone again doesn't duplicate it
    expect(repChatPhones(addRepChat(one, "r1", { chatId: "111", name: "هاتف 1" }).r1)).toHaveLength(1);
  });

  it("unlinking one phone keeps the others; the last one drops the rep", () => {
    const two = addRepChat(one, "r1", { chatId: "222", name: "هاتف 2" });
    expect(removeRepChat(two, "r1", "111").r1).toEqual({ chatId: "222", name: "هاتف 2" });
    expect(removeRepChat(two, "r1", "222").r1).toEqual({ chatId: "111", name: "هاتف 1" });
    expect(removeRepChat(one, "r1", "111")).toEqual({});
  });

  it("news goes to every phone, an answer only to the phone that asked", () => {
    const two = addRepChat(one, "r1", { chatId: "222", name: "هاتف 2" });
    expect(targetChatIds(two.r1)).toEqual(["111", "222"]);
    expect(targetChatIds(two.r1, "222")).toEqual(["222"]);
    expect(targetChatIds(two.r1, "999")).toEqual(["111", "222"]);
    expect(targetChatIds(undefined)).toEqual([]);
  });
});
