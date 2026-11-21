/**
 * 🤖 «وكيل واتساب» (his Nov 15 2026 ask - agent 5 of the list I offered): Claude answers his WhatsApp customers by
 * itself. His choices: **only the numbers he sets for a test at first** (later «كل من يراسلني»), it **answers alone**,
 * about: the device and its renewal, what the customer owes, prices and how to pay, and internet checks. Anything else
 * (or a fact it doesn't have) → a polite «سأحوّل سؤالك» + a phone notification to him. Never a group, never a rep.
 * Pure: the words, the facts and the settings shapes. lib/whatsappAgentLink.ts runs it; the phone (WhatsAppAgentRules.java)
 * keeps each message's notification to send the answer.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client } from "./clientStore";
import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import { phoneKey, renewalWords, statusWords } from "./whatsappDesk";

// ---- his settings (phone-only: each phone reads its own WhatsApp) ----

export const AGENT_SETTINGS_KEY = "starnet.whatsappAgent";

export interface AgentSettings {
  on: boolean;
  /** «كل من يراسلني» - off until he ends the test. */
  everyone: boolean;
  /** His test numbers, as he typed them. */
  numbers: string[];
  /** 🧠 «وكيل أذكى» (his Nov 21 2026 choice): Claude Sonnet instead of Haiku - smarter, about 20 times the cost. */
  smart?: boolean;
}

export const NO_AGENT: AgentSettings = { on: false, everyone: false, numbers: [] };

export function cleanAgentSettings(raw: unknown): AgentSettings {
  if (!raw || typeof raw !== "object") return NO_AGENT;
  const r = raw as Partial<AgentSettings>;
  return {
    on: r.on === true,
    everyone: r.everyone === true,
    numbers: Array.isArray(r.numbers) ? r.numbers.filter((n): n is string => typeof n === "string") : [],
    ...(r.smart === true ? { smart: true } : {}),
  };
}

export const AGENT_FAST_MODEL = "claude-haiku-5-5";
export const AGENT_SMART_MODEL = "claude-sonnet-5-5";

/** The model the agent asks: Haiku, or Sonnet when he turned on «🧠 وكيل أذكى». */
export function agentModel(s: Pick<AgentSettings, "smart">): string {
  return s.smart ? AGENT_SMART_MODEL : AGENT_FAST_MODEL;
}

/**
 * 🤖 The reader's pack for answering while the app is closed (WhatsAppAgentNative.java): everything the app would put in
 * one request. `chats` only for the customers who wrote in the last 24 hours; `open` = his questions still waiting per
 * customer (the silence rule). His key travels to the reader only - phone-only, never in a backup.
 */
export function buildAgentPack(input: {
  apiKey: string;
  model: string;
  business: string;
  payment: string;
  lessons: string;
  facts: Record<string, string>;
  chats: Record<string, AgentTurn[]>;
  open: Record<string, number>;
  menu?: string;
  now: number;
}): string {
  const recent: Record<string, AgentTurn[]> = {};
  for (const [k, turns] of Object.entries(input.chats)) {
    if (turns.length && input.now - turns[turns.length - 1]!.at < 24 * 3600_000) recent[k] = turns.slice(-MAX_TURNS);
  }
  return JSON.stringify({
    apiKey: input.apiKey,
    model: input.model,
    system: AGENT_SYSTEM,
    schema: AGENT_SCHEMA,
    business: input.business,
    payment: input.payment,
    lessons: input.lessons,
    menu: input.menu ?? "",
    facts: input.facts,
    chats: recent,
    open: input.open,
  });
}

/** «22 22 33 44» / «+222…» / one per line or comma → the last 8 digits of each, once. */
export function agentNumberKeys(numbers: string[]): string[] {
  const out: string[] = [];
  for (const n of numbers.flatMap((x) => x.split(/[\n,،;]+/))) {
    const k = phoneKey(n);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

// ---- the conversation with each number (phone-only, the last turns) ----

export interface AgentTurn {
  from: "customer" | "agent";
  text: string;
  at: number;
}

export const MAX_TURNS = 12;

export function withTurns(chat: AgentTurn[], ...turns: AgentTurn[]): AgentTurn[] {
  return [...chat, ...turns].slice(-MAX_TURNS);
}

// ---- what Claude is told ----

export const AGENT_SYSTEM = `You are the WhatsApp assistant of STAR NET, a small Starlink reseller in Mauritania and Mali. You answer the customer's newest message on behalf of STAR NET.

Write like a polite person on WhatsApp: short (1 to 4 short lines), warm, no long lists. Answer in the customer's language: a customer writing Arabic (any dialect) gets simple standard Arabic (فصحى بسيطة) - never Gulf or other dialect words like الحين، زين، شنهو، وش، ابغى؛ a customer writing French gets French; anything else gets simple standard Arabic. Never say you are an AI model; if asked, you are STAR NET's automatic assistant.

You may only talk about:
1. The customer's own devices: whether each works, its renewal (expiry) date, a pending restriction, its KIT and serial numbers.
2. What the customer owes, per currency, exactly as given.
3. Renewal prices (the customer's usual price as given) and how to pay (the payment lines given).
4. Basic internet checks: unplug the router or power supply for 2 minutes then plug it back; check the cables are firmly in; make sure the dish sees open sky with nothing above it (trees, walls); in the Starlink app look at the status and obstructions.

When the question is unclear, ask ONE short question back instead of guessing or handing off, with numbered choices taken from the facts and the owner's lessons: which price (a new device, a renewal, a plan - say which plans the lessons name), or which device when he has several («1️⃣ …  2️⃣ …», his devices by name). When the customer then answers with a number or a word, read it against your last choices in the conversation. Asking back is not a handoff.

When "Owner's menu" is given: answer a greeting, or the customer's first message of the day, with one short greeting line and then the menu exactly as written (same numbers, same lines). When he answers with a menu number or an item's words, answer that item. When he writes 0 or asks for the menu, send the menu again. Answering an item, end with one short line telling him he can write 0 for the menu (in his language).

STAR NET's owner taught you answers ("Owner's lessons"): when one fits the customer's question, give its meaning in the customer's language - it is a fact you may use; follow its rules over your own wording.

Use only the facts given. Never invent an amount, a date, a price or a device. Never promise anything (a date, a discount, a refund, a free month). Never mention other customers. Never ask for or repeat passwords, codes or card numbers.

Set handoff to true, and reply in one short line asking him to wait a little while you check with the STAR NET team (like «لحظة من فضلك، سأتأكد وأرد عليك» / «Un instant s'il vous plaît, je vérifie et je reviens vers vous»), when: neither the facts nor the owner's lessons hold the answer; the customer says he paid or sends a payment; he wants a new device, a cancellation, a plan change, a discount or a move; he complains or is angry; the message is about anything outside the four topics; or the sender is not a known customer and asks about a device or a debt. A greeting alone gets a short greeting and an offer to help (no handoff).

reason is one short line in Arabic for the STAR NET owner saying why you handed off (empty when handoff is false).`;

export const AGENT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "The WhatsApp answer to send, in the customer's language." },
    handoff: { type: "boolean", description: "True when STAR NET's owner must answer this himself." },
    reason: { type: "string", description: "Why, in one short Arabic line, for the owner (empty when no handoff)." },
  },
  required: ["reply", "handoff", "reason"],
  additionalProperties: false,
} as const;

export const AGENT_KEYS = ["reply", "handoff", "reason"] as const;

export interface AgentAnswer {
  reply: string;
  handoff: boolean;
  reason: string;
}

function money(owed: Record<string, number>): string {
  const debts = Object.entries(owed).filter(([, v]) => v > 0.005);
  return debts.length ? debts.map(([c, v]) => `${formatAmount(v)} ${LEDGER_CURRENCY_LABELS[c as LedgerCurrency] ?? c}`).join(" + ") : "لا شيء";
}

/** The customer's facts: each device (state, renewal, usual price), what he owes. */
export function customerFacts(
  client: Pick<Client, "name">,
  devices: StarlinkAccountSummary[],
  owed: Record<string, number>,
  usualPrice: (device: StarlinkAccountSummary) => { amount: number; currency: string } | null,
): string {
  const lines = [`Known customer: ${client.name}`];
  if (!devices.length) lines.push("- No device registered under his name.");
  for (const d of devices) {
    const price = usualPrice(d);
    const parts = [statusWords(d), renewalWords(d.rechargeDate)];
    if (d.kitNumber) parts.push(`KIT: ${d.kitNumber}`);
    if (d.serialNumber) parts.push(`الرقم التسلسلي: ${d.serialNumber}`);
    if (d.outsideHome?.daysRemaining !== undefined) parts.push(`خارج بلد الحساب: ${d.outsideHome.daysRemaining} يوم باقٍ قبل التقييد`);
    if (price) parts.push(`سعر تجديده المعتاد: ${formatAmount(price.amount)} ${LEDGER_CURRENCY_LABELS[price.currency as LedgerCurrency] ?? price.currency}`);
    lines.push(`- Device «${d.name}»: ${parts.filter(Boolean).join(" · ")}`);
  }
  lines.push(`- He owes: ${money(owed)}`);
  return lines.join("\n");
}

/** Everything Claude reads for one message. */
export function agentUserText(input: {
  business: string;
  paymentLines: string;
  facts: string | null;
  senderName: string;
  chat: AgentTurn[];
  message: string;
  /** 🎓 His lessons (lib/agentTraining.ts lessonsText), "" when none. */
  lessons?: string;
  /** 📋 His fixed menu (lib/agentTraining.ts menuText), "" when off. */
  menu?: string;
}): string {
  const history = input.chat.length
    ? input.chat.map((t) => `${t.from === "customer" ? "Customer" : "STAR NET"}: ${t.text}`).join("\n")
    : "(no earlier messages)";
  return [
    `Business: ${input.business}`,
    `How to pay:\n${input.paymentLines}`,
    input.facts ?? `Unknown sender (not a registered customer). WhatsApp name: ${input.senderName || "-"}`,
    ...(input.lessons ? [`Owner's lessons:\n${input.lessons}`] : []),
    ...(input.menu ? [`Owner's menu:\n${input.menu}`] : []),
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    `Conversation so far:\n${history}`,
    `Customer's newest message:\n${input.message}`,
  ].join("\n\n");
}

/** The owner's notification when the agent hands a customer to him. */
export function handoffNotice(name: string, phone: string | undefined, message: string, reason: string): string {
  return `🤖 زبون يحتاجك على واتساب\n${name}${phone ? ` (${phone})` : ""}: «${message.slice(0, 160)}»${reason ? `\nالسبب: ${reason}` : ""}`;
}

// ---- 🔍 why a message was left (his Nov 21 2026 ask: the agent never answered and nothing showed) ----

/** Why the app left a waiting message unanswered - null = it answers it. Each one now leaves a line in the log. */
export function agentSkipReason(input: { on: boolean; hasKey: boolean; ageMs: number; freshMs: number }): string | null {
  if (!input.on) return "الوكيل متوقف";
  if (!input.hasKey) return "لا مفتاح Claude";
  if (input.ageMs > input.freshMs) return `قُرئت بعد ${Math.round(input.ageMs / 60_000)} دقيقة (أكثر من ${Math.round(input.freshMs / 60_000)}) - تُركت لك`;
  return null;
}

/** What the phone's reader saw last (LocalBrowser.whatsappAgentLastSeen). */
export interface AgentSeen {
  at: number;
  title: string;
  phone?: string;
  from?: string;
  hiddenId: boolean;
  test: boolean;
  reason: string;
  /** Who answers it (the app / the reader alone) and how it went. */
  path?: string;
}

/** «🔍 آخر رسالة رآها القارئ»: its lines, in his words (`phone` goes in a left-to-right <bdi>). */
export function agentSeenLines(seen: AgentSeen): { phone: string | null; note: string; match: string; reason: string } {
  const notes = [seen.phone ? (seen.from ? `من ${seen.from}` : "") : "لا رقم", seen.hiddenId ? "المحادثة بمعرّف مخفي (@lid)" : ""].filter(Boolean);
  const match = seen.phone ? (seen.test ? "✓ من أرقام التجربة" : "✗ ليس من أرقام التجربة") : "-";
  return { phone: seen.phone ? `+${seen.phone}` : null, note: notes.join(" · "), match, reason: seen.reason };
}
