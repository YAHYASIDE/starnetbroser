import { describe, expect, it } from "vitest";
import {
  addLesson,
  addQuestion,
  answerQuestion,
  answersToSend,
  dismissQuestion,
  isSilencedFor,
  lessonsText,
  markSent,
  MAX_PROMPT_LESSONS,
  removeLesson,
  SILENT_MS,
  trainingCounts,
  updateLesson,
  type AgentLesson,
  type AgentQuestion,
} from "./agentTraining";

// Fake numbers and names only.
const NOW = 1_800_000_000_000;
const msg = (n: number, key = "70000001") => ({ messageId: `m${n}`, key, name: "زبون", text: `سؤال ${n}`, at: NOW + n, agentReply: "انتظر قليلًا", reason: "لا أعرف" });

describe("🎓 the agent's training (his Nov 21 2026 ask)", () => {
  it("keeps each handed-off message once", () => {
    let qs: AgentQuestion[] = [];
    qs = addQuestion(qs, msg(1), NOW);
    qs = addQuestion(qs, msg(1), NOW);
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ status: "open", text: "سؤال 1", key: "70000001" });
  });

  it("is silent with a customer after two questions without his answer, for 24 hours at most", () => {
    let qs: AgentQuestion[] = [];
    qs = addQuestion(qs, msg(1), NOW);
    expect(isSilencedFor(qs, "70000001", NOW + 10)).toBe(false);
    qs = addQuestion(qs, msg(2), NOW);
    expect(isSilencedFor(qs, "70000001", NOW + 10)).toBe(true);
    expect(isSilencedFor(qs, "70000002", NOW + 10)).toBe(false);
    expect(isSilencedFor(qs, "70000001", NOW + SILENT_MS + 10)).toBe(false);
  });

  it("his answer goes out, becomes a lesson and lets the agent speak again", () => {
    let qs: AgentQuestion[] = [];
    qs = addQuestion(qs, msg(1), NOW);
    qs = addQuestion(qs, msg(2), NOW);
    const { questions, lessons } = answerQuestion(qs, [], qs[1]!.id, "  سعر التجديد 20,000 أوقية ", NOW + 100);
    expect(questions[1]).toMatchObject({ status: "answered", answer: "سعر التجديد 20,000 أوقية", send: "waiting" });
    expect(questions[0]!.status).toBe("dismissed");
    expect(isSilencedFor(questions, "70000001", NOW + 200)).toBe(false);
    expect(lessons).toEqual([expect.objectContaining({ question: "سؤال 2", answer: "سعر التجديد 20,000 أوقية" })]);
    expect(answersToSend(questions).map((q) => q.id)).toEqual([questions[1]!.id]);
    const sent = markSent(questions, questions[1]!.id, true, NOW + 300);
    expect(answersToSend(sent)).toEqual([]);
    expect(sent[1]).toMatchObject({ send: "sent", sentAt: NOW + 300 });
    expect(trainingCounts(markSent(questions, questions[1]!.id, false, NOW)).failed).toBe(1);
  });

  it("an empty answer changes nothing; «تجاهل» only closes it", () => {
    const qs = addQuestion([], msg(1), NOW);
    expect(answerQuestion(qs, [], qs[0]!.id, "  ", NOW)).toEqual({ questions: qs, lessons: [] });
    const dismissed = dismissQuestion(qs, qs[0]!.id);
    expect(dismissed[0]!.status).toBe("dismissed");
    expect(trainingCounts(dismissed).open).toBe(0);
  });

  it("lessons: the same question replaces its answer; edit, delete", () => {
    let ls: AgentLesson[] = addLesson([], "كم سعر التجديد", "20,000 أوقية", NOW);
    ls = addLesson(ls, "كم سعر التجديد", "22,000 أوقية", NOW + 1);
    expect(ls).toHaveLength(1);
    expect(ls[0]).toMatchObject({ answer: "22,000 أوقية", updatedAt: NOW + 1 });
    ls = addLesson(ls, "", "لا نعطي معلومات الأرباح أبدًا", NOW + 2);
    ls = updateLesson(ls, ls[1]!.id, "", "لا نتكلم عن الأرباح", NOW + 3);
    expect(lessonsText(ls)).toBe("- لا نتكلم عن الأرباح\n- Q: كم سعر التجديد\n  A: 22,000 أوقية");
    expect(removeLesson(ls, ls[0]!.id)).toHaveLength(1);
    expect(lessonsText([])).toBe("");
  });

  it("the agent reads the newest lessons only", () => {
    let ls: AgentLesson[] = [];
    for (let i = 0; i < MAX_PROMPT_LESSONS + 5; i++) ls = addLesson(ls, `س${i}`, `ج${i}`, NOW + i);
    const text = lessonsText(ls);
    expect(text.split("\n- ").length).toBe(MAX_PROMPT_LESSONS);
    expect(text.startsWith(`- Q: س${MAX_PROMPT_LESSONS + 4}`)).toBe(true);
    expect(text).not.toContain("Q: س0\n");
  });
});
