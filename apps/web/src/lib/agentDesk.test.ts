import { describe, expect, it } from "vitest";
import { addEvents, addHandoff, closeHandoff, menuStats, openHandoffs, pausedUntil, takeHandoff, type AgentEvent } from "./agentDesk";

// Fake numbers and names only.
const H = 3600_000;

describe("👨‍💼 conversations a person takes", () => {
  it("waiting → taken → back to the agent; the agent is silent meanwhile", () => {
    let list = addHandoff([], { id: "h1", key: "70000001", name: "زبون", text: "موظف", summary: "", at: 1000 });
    list = addHandoff(list, { id: "h2", key: "70000001", name: "زبون", text: "أريد موظفًا", summary: "", at: 2000 });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: "waiting", text: "أريد موظفًا", at: 2000 });
    expect(pausedUntil(list, 24)).toEqual({ "70000001": 2000 + 24 * H });
    list = takeHandoff(list, "h1", "المسؤول 2", 5000);
    expect(list[0]).toMatchObject({ status: "taken", takenBy: "المسؤول 2" });
    expect(pausedUntil(list, 24)).toEqual({ "70000001": 5000 + 24 * H });
    list = addHandoff(list, { id: "h3", key: "70000002", name: "آخر", text: "موظف", summary: "", at: 6000 });
    expect(openHandoffs(list).map((h) => h.id)).toEqual(["h3", "h1"]);
    list = closeHandoff(list, "h1", 7000);
    expect(pausedUntil(list, 24)).toEqual({ "70000002": 6000 + 24 * H });
  });
});

describe("📊 statistics from what really happened", () => {
  it("counts menus, items, questions, hand-offs, failures, reply time, tokens", () => {
    const ev = (id: string, type: AgentEvent["type"], extra: Partial<AgentEvent> = {}): AgentEvent => ({ id, at: 100, key: "70000001", type, ...extra });
    let events = addEvents([], [
      ev("1", "menu", { node: "pay", ms: 1000 }),
      ev("2", "menu", { node: "py_ways", key: "70000002", ms: 3000 }),
      ev("3", "menu", { node: "pay" }),
      ev("4", "handoff", { node: "staff" }),
      ev("5", "ai_answer", { text: "كم سعر التجديد؟", input: 3000, output: 100, ms: 5000 }),
      ev("6", "ai_answer", { text: "كم سعر التجديد", input: 3000, output: 100 }),
      ev("7", "ai_handoff", { text: "تخفيض؟", input: 1000, output: 50 }),
      ev("8", "send_fail"),
    ]);
    events = addEvents(events, [ev("1", "menu")]);
    expect(events).toHaveLength(8);
    const s = menuStats(events);
    expect(s).toMatchObject({ customersWithMenu: 2, handoffs: 1, solved: 5, unsolved: 2, sendFailures: 1, avgReplyMs: 3000, aiReplies: 3, inputTokens: 7000, outputTokens: 250 });
    expect(s.topItems[0]).toEqual(["pay", 2]);
    expect(s.topQuestions).toEqual([["كم سعر التجديد", 2]]);
    expect(menuStats(events, 200).solved).toBe(0);
  });
});
