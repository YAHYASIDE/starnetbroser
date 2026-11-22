/**
 * 👨‍💼📊 The WhatsApp agent's desk (his Nov 21 2026 brief): the conversations a person took («التحدث مع موظف») - waiting,
 * taken by a team member, given back to the agent - and what really happened (every menu reply, hand-off, Claude
 * answer, failed send), from which the statistics are counted. Both are business stores (`starnet_`: the team link
 * and the backup), so any admin takes a conversation and sees the same numbers. Pure - tested in agentDesk.test.ts.
 */

export const HANDOFFS_KEY = "starnet_agent_handoffs_v1";
export const EVENTS_KEY = "starnet_agent_events_v1";

export interface Handoff {
  id: string;
  /** The customer's last 8 digits. */
  key: string;
  phone?: string;
  name: string;
  /** What he wrote when he asked for a person, and a short summary of the conversation before. */
  text: string;
  summary: string;
  at: number;
  status: "waiting" | "taken" | "closed";
  /** ☁️ A customer of the official number: his WhatsApp id (the app answers him through the Worker) and the messages
   * since he asked for a person. */
  wa?: string;
  thread?: { from: "customer" | "staff"; text: string; at: number; by?: string }[];
  takenBy?: string;
  takenAt?: number;
  closedAt?: number;
}

export type AgentEventType = "menu" | "handoff" | "ai_answer" | "ai_handoff" | "send_fail" | "staff";

export interface AgentEvent {
  id: string;
  at: number;
  key: string;
  type: AgentEventType;
  /** The menu item (stable id) for "menu" / "handoff". */
  node?: string;
  /** The customer's words (for «أكثر الأسئلة تكرارًا»), first 120 characters. */
  text?: string;
  /** From his message to the reply sent (ms). */
  ms?: number;
  /** Claude's tokens and model (the estimated cost). */
  model?: string;
  input?: number;
  output?: number;
}

export const MAX_EVENTS = 2000;

/** A customer the agent leaves to a person until this time (ms) - the reader's `paused`. */
export function pausedUntil(handoffs: Handoff[], handoffHours: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of handoffs) {
    if (h.status === "closed") continue;
    const until = (h.takenAt ?? h.at) + handoffHours * 3600_000;
    out[h.key] = Math.max(out[h.key] ?? 0, until);
  }
  return out;
}

/** A new hand-off (one open per customer: a second request updates it). */
export function addHandoff(list: Handoff[], h: Omit<Handoff, "status" | "id"> & { id: string }): Handoff[] {
  const open = list.find((x) => x.key === h.key && x.status !== "closed");
  if (open) return list.map((x): Handoff => (x === open ? { ...x, text: h.text, summary: h.summary || x.summary, at: h.at } : x));
  return [...list, { ...h, status: "waiting" as const }].slice(-300);
}

export function takeHandoff(list: Handoff[], id: string, by: string, now: number): Handoff[] {
  return list.map((h): Handoff => (h.id === id && h.status === "waiting" ? { ...h, status: "taken", takenBy: by, takenAt: now } : h));
}

/** «إعادة المحادثة للوكيل». */
export function closeHandoff(list: Handoff[], id: string, now: number): Handoff[] {
  return list.map((h): Handoff => (h.id === id && h.status !== "closed" ? { ...h, status: "closed", closedAt: now } : h));
}

/** The open ones first (waiting, then taken), newest first. */
export function openHandoffs(list: Handoff[]): Handoff[] {
  const rank = (h: Handoff) => (h.status === "waiting" ? 0 : h.status === "taken" ? 1 : 2);
  return [...list].filter((h) => h.status !== "closed").sort((a, b) => rank(a) - rank(b) || b.at - a.at);
}

export function addEvents(list: AgentEvent[], more: AgentEvent[]): AgentEvent[] {
  if (!more.length) return list;
  const seen = new Set(list.map((e) => e.id));
  return [...list, ...more.filter((e) => !seen.has(e.id))].slice(-MAX_EVENTS);
}

export interface MenuStats {
  /** Different customers who got a menu. */
  customersWithMenu: number;
  /** Menu items by use, most first: [node id, count]. */
  topItems: [string, number][];
  /** The customers' words Claude answered, most repeated first (normalized): [text, count]. */
  topQuestions: [string, number][];
  handoffs: number;
  /** Answered by the menus or by Claude without a person. */
  solved: number;
  /** Claude handed to a person, or nothing could be sent. */
  unsolved: number;
  sendFailures: number;
  /** Average ms from his message to the reply (null = none measured). */
  avgReplyMs: number | null;
  /** Claude's replies counted, and their tokens. */
  aiReplies: number;
  inputTokens: number;
  outputTokens: number;
}

function normQ(s: string): string {
  return s.trim().toLowerCase().replace(/[إأآ]/g, "ا").replace(/[؟?!.،,]+/g, "").replace(/\s+/g, " ").slice(0, 60);
}

/** The numbers since `since` (ms), from the events only - nothing estimated is shown as an operation. */
export function menuStats(events: AgentEvent[], since = 0): MenuStats {
  const list = events.filter((e) => e.at >= since);
  const customers = new Set<string>();
  const items = new Map<string, number>();
  const questions = new Map<string, number>();
  let handoffs = 0;
  let solved = 0;
  let unsolved = 0;
  let fails = 0;
  let msSum = 0;
  let msN = 0;
  let ai = 0;
  let input = 0;
  let output = 0;
  for (const e of list) {
    if (e.type === "menu") {
      customers.add(e.key);
      if (e.node) items.set(e.node, (items.get(e.node) ?? 0) + 1);
      solved++;
    } else if (e.type === "handoff") {
      handoffs++;
      if (e.node) items.set(e.node, (items.get(e.node) ?? 0) + 1);
    } else if (e.type === "ai_answer") {
      solved++;
      if (e.text) questions.set(normQ(e.text), (questions.get(normQ(e.text)) ?? 0) + 1);
    } else if (e.type === "ai_handoff") {
      unsolved++;
      if (e.text) questions.set(normQ(e.text), (questions.get(normQ(e.text)) ?? 0) + 1);
    } else if (e.type === "send_fail") {
      fails++;
      unsolved++;
    }
    if (e.type === "ai_answer" || e.type === "ai_handoff") {
      ai++;
      input += e.input ?? 0;
      output += e.output ?? 0;
    }
    if (typeof e.ms === "number" && e.ms >= 0 && e.ms < 3600_000) {
      msSum += e.ms;
      msN++;
    }
  }
  const top = <T,>(m: Map<T, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    customersWithMenu: customers.size,
    topItems: top(items, 6),
    topQuestions: top(questions, 6).filter(([, c]) => c > 1),
    handoffs,
    solved,
    unsolved,
    sendFailures: fails,
    avgReplyMs: msN ? Math.round(msSum / msN) : null,
    aiReplies: ai,
    inputTokens: input,
    outputTokens: output,
  };
}

// ---- the stores ----

function read<T>(key: string): T[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export const DESK_EVENT = "starnet:agent-desk";

export function loadHandoffs(): Handoff[] {
  return read<Handoff>(HANDOFFS_KEY);
}

export function saveHandoffs(list: Handoff[]): void {
  window.localStorage.setItem(HANDOFFS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(DESK_EVENT));
}

export function loadEvents(): AgentEvent[] {
  return read<AgentEvent>(EVENTS_KEY);
}

export function recordEvents(more: AgentEvent[]): void {
  if (!more.length) return;
  try {
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(addEvents(loadEvents(), more)));
    window.dispatchEvent(new Event(DESK_EVENT));
  } catch {
    // a full phone: only the statistics miss it
  }
}

/** A message in a person's conversation (☁️ official number): the customer's, or the staff's reply. */
export function addToThread(list: Handoff[], wa: string, m: { from: "customer" | "staff"; text: string; at: number; by?: string }): Handoff[] {
  const open = [...list].reverse().find((h) => h.wa === wa && h.status !== "closed");
  if (!open) return list;
  return list.map((h) => (h === open ? { ...h, thread: [...(h.thread ?? []), m].slice(-50) } : h));
}
