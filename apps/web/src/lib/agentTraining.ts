/**
 * 🎓 «تدريب الوكيل» (his Nov 21 2026 ask: «أريد مكانًا خاصًا بردود الواتس أدرّبه فيه، وكل الأسئلة التي تأتيه يعطيها
 * لي لأعلّمه كي يجاوب»). His choices: a page in «المزيد»; the agent answers in the customer's language (simple standard
 * Arabic or French); his answer to a waiting question goes to the customer at once; a question it doesn't know gets a
 * short «انتظر» and, after two of them without his answer, the agent stays silent with that customer (no Claude cost)
 * until he answers - at most 24 hours.
 *
 * Two business stores (`starnet_`: in the backup and in the team link, so he trains from his own phone and the agent on
 * «المسؤول 2» learns at once): the questions it handed to him, and the lessons (a question + his answer) it reads
 * before every reply. Pure - tested in agentTraining.test.ts.
 */

export const QUESTIONS_KEY = "starnet_agent_questions_v1";
export const LESSONS_KEY = "starnet_agent_lessons_v1";

/** A message the agent didn't know (or he marked): waiting for his answer. */
export interface AgentQuestion {
  id: string;
  /** The WhatsApp message's id on the agent's phone - its «رد» sends his answer. */
  messageId: string;
  /** The sender's last 8 digits. */
  key: string;
  phone?: string;
  name: string;
  text: string;
  at: number;
  /** What the agent sent («انتظر…»), "" when it stayed silent. */
  agentReply: string;
  /** Why it handed off, one Arabic line. */
  reason: string;
  status: "open" | "answered" | "dismissed";
  answer?: string;
  answeredAt?: number;
  /** His answer on its way to the customer (only the agent's phone sends it). */
  send?: "waiting" | "sent" | "failed";
  sentAt?: number;
}

/** What he taught: the agent follows it, in the customer's language. */
export interface AgentLesson {
  id: string;
  question: string;
  answer: string;
  createdAt: number;
  updatedAt: number;
}

/** After this many questions without his answer, the agent is silent with that customer. */
export const SILENT_AFTER = 2;
/** …at most this long. */
export const SILENT_MS = 24 * 60 * 60 * 1000;
/** The lessons the agent reads (newest first) - a long list costs on every reply. */
export const MAX_PROMPT_LESSONS = 60;
const MAX_QUESTIONS = 300;

function newId(prefix: string, now: number): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `${prefix}${now.toString(36)}${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function cleanQuestions(raw: unknown): AgentQuestion[] {
  return Array.isArray(raw) ? raw.filter((q): q is AgentQuestion => !!q && typeof q === "object" && typeof (q as AgentQuestion).id === "string" && typeof (q as AgentQuestion).text === "string") : [];
}

export function cleanLessons(raw: unknown): AgentLesson[] {
  return Array.isArray(raw) ? raw.filter((l): l is AgentLesson => !!l && typeof l === "object" && typeof (l as AgentLesson).id === "string" && typeof (l as AgentLesson).answer === "string") : [];
}

/** A handed-off message → a waiting question (the same message twice = once). Newest last; the oldest answered /
 * dismissed ones go first when the list is long. */
export function addQuestion(
  questions: AgentQuestion[],
  input: { messageId: string; key: string; phone?: string; name: string; text: string; at: number; agentReply: string; reason: string },
  now: number,
): AgentQuestion[] {
  if (questions.some((q) => q.messageId === input.messageId)) return questions;
  const next = [...questions, { id: newId("q", now), ...input, status: "open" as const }];
  if (next.length <= MAX_QUESTIONS) return next;
  const drop = next.findIndex((q) => q.status !== "open");
  return drop >= 0 ? next.filter((_, i) => i !== drop) : next.slice(1);
}

/** The questions from `key` still waiting for him, of the last SILENT_MS. */
export function openFrom(questions: AgentQuestion[], key: string, now: number): AgentQuestion[] {
  return questions.filter((q) => q.key === key && q.status === "open" && now - q.at < SILENT_MS);
}

/** The agent stays silent with this customer: SILENT_AFTER questions without his answer (in the last 24 hours). */
export function isSilencedFor(questions: AgentQuestion[], key: string, now: number): boolean {
  return openFrom(questions, key, now).length >= SILENT_AFTER;
}

/** He answers a waiting question: it goes to the customer at once (`send` waiting) and becomes a lesson. Every other
 * open question of that customer is answered by it too (he answered the conversation), so the agent speaks again. */
export function answerQuestion(
  questions: AgentQuestion[],
  lessons: AgentLesson[],
  id: string,
  answer: string,
  now: number,
): { questions: AgentQuestion[]; lessons: AgentLesson[] } {
  const text = answer.trim();
  const q = questions.find((x) => x.id === id);
  if (!q || !text) return { questions, lessons };
  const next = questions.map((x) => {
    if (x.id === id) return { ...x, status: "answered" as const, answer: text, answeredAt: now, send: "waiting" as const };
    if (x.key === q.key && x.status === "open") return { ...x, status: "dismissed" as const };
    return x;
  });
  return { questions: next, lessons: addLesson(lessons, q.text, text, now) };
}

/** «تجاهل»: no answer, no lesson - the customer is no longer counted as waiting. */
export function dismissQuestion(questions: AgentQuestion[], id: string): AgentQuestion[] {
  return questions.map((q) => (q.id === id && q.status === "open" ? { ...q, status: "dismissed" as const } : q));
}

/** His answers waiting to go out (the agent's phone sends them through the message's «رد»). */
export function answersToSend(questions: AgentQuestion[]): AgentQuestion[] {
  return questions.filter((q) => q.status === "answered" && q.send === "waiting" && !!q.answer);
}

export function markSent(questions: AgentQuestion[], id: string, sent: boolean, now: number): AgentQuestion[] {
  return questions.map((q) => (q.id === id ? { ...q, send: sent ? ("sent" as const) : ("failed" as const), ...(sent ? { sentAt: now } : {}) } : q));
}

/** A lesson (a correction from the test chat, or one he writes himself). The same question again replaces its answer. */
export function addLesson(lessons: AgentLesson[], question: string, answer: string, now: number): AgentLesson[] {
  const q = question.trim();
  const a = answer.trim();
  if (!a) return lessons;
  const same = lessons.find((l) => q && l.question.trim() === q);
  if (same) return lessons.map((l) => (l === same ? { ...l, answer: a, updatedAt: now } : l));
  return [...lessons, { id: newId("l", now), question: q, answer: a, createdAt: now, updatedAt: now }];
}

export function updateLesson(lessons: AgentLesson[], id: string, question: string, answer: string, now: number): AgentLesson[] {
  const a = answer.trim();
  if (!a) return lessons;
  return lessons.map((l) => (l.id === id ? { ...l, question: question.trim(), answer: a, updatedAt: now } : l));
}

export function removeLesson(lessons: AgentLesson[], id: string): AgentLesson[] {
  return lessons.filter((l) => l.id !== id);
}

/** What the agent reads: his lessons, newest first, at most MAX_PROMPT_LESSONS. "" when none. */
export function lessonsText(lessons: AgentLesson[]): string {
  const latest = [...lessons].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PROMPT_LESSONS);
  if (!latest.length) return "";
  return latest.map((l) => (l.question ? `- Q: ${l.question}\n  A: ${l.answer}` : `- ${l.answer}`)).join("\n");
}

/** The page's counts: waiting for him, his answers not sent. */
export function trainingCounts(questions: AgentQuestion[]): { open: number; failed: number } {
  return { open: questions.filter((q) => q.status === "open").length, failed: questions.filter((q) => q.send === "failed").length };
}

// ---- the stores (localStorage) ----

function read<T>(key: string, clean: (raw: unknown) => T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return clean(raw ? JSON.parse(raw) : []);
  } catch {
    return clean([]);
  }
}

export const TRAINING_EVENT = "starnet:agent-training";

export function loadQuestions(): AgentQuestion[] {
  return read(QUESTIONS_KEY, cleanQuestions);
}

export function saveQuestions(questions: AgentQuestion[]): void {
  window.localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions));
  window.dispatchEvent(new Event(TRAINING_EVENT));
}

export function loadLessons(): AgentLesson[] {
  return read(LESSONS_KEY, cleanLessons);
}

export function saveLessons(lessons: AgentLesson[]): void {
  window.localStorage.setItem(LESSONS_KEY, JSON.stringify(lessons));
  window.dispatchEvent(new Event(TRAINING_EVENT));
}
