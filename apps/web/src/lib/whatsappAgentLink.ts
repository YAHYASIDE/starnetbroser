"use client";

/**
 * 🤖 The WhatsApp agent at work (lib/whatsappAgent.ts holds the rules and words): his settings go to the phone's reader,
 * each waiting message gets Claude's answer (his own key, lib/claudeClient.ts) sent through the message's notification,
 * and a customer it can't help is handed to him with a phone notification. Owner's Android only; while the app is open
 * or in memory (a message read later than 15 minutes is left to him).
 */

import { LocalBrowser } from "@starnet/local-browser-plugin";
import { AGENT_MODEL, askClaudeJson, hasClaudeKey } from "./claudeClient";
import { addSpend, allRead, asksAboutDevice, costOf, devicesToRefresh, newResults, NO_SPEND, REFRESH_WAIT_MS, type AgentSpend } from "./agentRefresh";
import { listPendingAccountSyncs, startBackgroundSync } from "./localBrowser";
import { applyPendingSyncs, type PendingSyncLike } from "./starlinkSync";
import { loadClientStore } from "./clientStore";
import { computeClientCombinedTotals } from "./clientAccount";
import { loadClientMoves } from "./clientMoves";
import { lastChargePrice } from "./chargeDefault";
import { demoAccounts } from "./demoData";
import { loadDemoAccounts } from "./demoAccountStore";
import { loadInvoices } from "./invoiceStore";
import { loadLedgerStore } from "./ledgerStore";
import { loadPartyAdjustments } from "./partyBalanceStore";
import { loadBusinessProfile, paymentInstructions } from "./pdfDocument";
import { listRepresentatives, loadRepresentativeStore } from "./repStore";
import { notifyPhone } from "./appEvents";
import { clientByPhone, phoneKey } from "./whatsappDesk";
import {
  AGENT_KEYS,
  AGENT_SCHEMA,
  AGENT_SETTINGS_KEY,
  AGENT_SYSTEM,
  agentNumberKeys,
  agentSkipReason,
  agentUserText,
  cleanAgentSettings,
  customerFacts,
  handoffNotice,
  NO_AGENT,
  withTurns,
  type AgentAnswer,
  type AgentSettings,
  type AgentTurn,
} from "./whatsappAgent";
import { addQuestion, answersToSend, isSilencedFor, lessonsText, loadLessons, loadQuestions, markSent, saveQuestions } from "./agentTraining";

export const AGENT_EVENT = "starnet:whatsapp-agent";
const CHATS_KEY = "starnet.whatsappAgentChats";
const LOG_KEY = "starnet.whatsappAgentLog";
const FRESH_MS = 15 * 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // full storage: the answer still went out
  }
}

export function loadAgentSettings(): AgentSettings {
  return typeof window === "undefined" ? NO_AGENT : cleanAgentSettings(readJson(AGENT_SETTINGS_KEY, null));
}

export function saveAgentSettings(s: AgentSettings): void {
  writeJson(AGENT_SETTINGS_KEY, s);
  lastSetup = "";
  window.dispatchEvent(new Event(AGENT_EVENT));
}

export interface AgentLogLine {
  at: number;
  name: string;
  question: string;
  reply: string;
  handoff: boolean;
  sent: boolean;
  error?: string;
}

export function loadAgentLog(): AgentLogLine[] {
  const v = readJson<unknown>(LOG_KEY, []);
  return Array.isArray(v) ? (v as AgentLogLine[]) : [];
}

function addLog(line: AgentLogLine): void {
  writeJson(LOG_KEY, [line, ...loadAgentLog()].slice(0, 40));
  window.dispatchEvent(new Event(AGENT_EVENT));
}

let lastSetup = "";

/** His settings + the reps' numbers (never answered) to the phone's reader - only when they changed. */
export async function pushAgentSetup(): Promise<void> {
  const s = loadAgentSettings();
  const repKeys = listRepresentatives(loadRepresentativeStore())
    .map((r) => phoneKey(r.phone))
    .filter((k): k is string => !!k);
  const options = { on: s.on && hasClaudeKey(), everyone: s.everyone, numbers: agentNumberKeys(s.numbers), repKeys };
  const look = JSON.stringify(options);
  if (look === lastSetup) return;
  await LocalBrowser.whatsappAgentSetup(options);
  lastSetup = look;
}

/** This customer's devices (none for an unknown number). */
function devicesOf(client: ReturnType<typeof clientByPhone>) {
  return client ? loadDemoAccounts(demoAccounts).filter((a) => a.clientId === client.id && !a.deletedAt && !a.archivedAt) : [];
}

/** The customer of this number and what the agent may tell him (null facts = not a registered customer). `fresh`: what
 * Starlink just returned for his devices (applied on top, the home screen keeps it as usual). */
function factsFor(phone: string, fresh: PendingSyncLike[] = []): { client: ReturnType<typeof clientByPhone>; facts: string | null } {
  const clients = loadClientStore();
  const client = clientByPhone(clients, phone);
  let facts: string | null = null;
  if (client) {
    const own = devicesOf(client);
    const accounts = fresh.length ? applyPendingSyncs(own, fresh, new Set()).accounts : own;
    const ledger = loadLedgerStore();
    const owed = Object.fromEntries(
      Object.entries(computeClientCombinedTotals(loadInvoices(), loadPartyAdjustments(), client.id, accounts, ledger, loadClientMoves())).map(([c, t]) => [c, t.remaining]),
    );
    facts = customerFacts(client, accounts, owed, (d) => lastChargePrice(ledger[d.id] ?? []));
  }
  return { client, facts };
}

/** 🎓 «جرّب»: the agent's answer to a message he types, as a customer (a number = that customer's facts) - nothing is
 * sent on WhatsApp. */
export async function agentPreview(message: string, phone: string, chat: AgentTurn[]): Promise<{ ok: true; value: AgentAnswer; customer: string | null } | { ok: false; message: string }> {
  const { client, facts } = phone.trim() ? factsFor(phone) : { client: null, facts: null };
  const answer = await askClaudeJson<AgentAnswer>({
    system: AGENT_SYSTEM,
    user: agentUserText({ business: loadBusinessProfile().name, paymentLines: paymentInstructions(), facts, senderName: "", chat, message, lessons: lessonsText(loadLessons()) }),
    schema: AGENT_SCHEMA as unknown as Record<string, unknown>,
    keys: AGENT_KEYS,
    effort: "low",
    model: AGENT_MODEL,
  });
  if (answer.ok) recordSpend(answer.usage);
  return answer.ok ? { ok: true, value: answer.value, customer: client?.name ?? null } : answer;
}

let busy = false;

/** Answers every waiting message. Returns how many answers went out. */
export async function runWhatsAppAgent(): Promise<number> {
  if (busy) return 0;
  busy = true;
  let sentCount = 0;
  try {
    // 🎓 his answers from «تدريب الوكيل» (any phone of the team) go to the customer first, through the message's «رد»
    sentCount += await sendOwnerAnswers();
    const { messages } = await LocalBrowser.whatsappAgentPending();
    if (!messages.length) return sentCount;
    const settings = loadAgentSettings();
    const chats = readJson<Record<string, AgentTurn[]>>(CHATS_KEY, {});
    const lessons = lessonsText(loadLessons());
    /** A question for «🎓 تدريب الوكيل»; true when the agent now stays silent with this customer (the 2nd one). */
    const ask = (m: { id: string; key: string; phone?: string; name: string; text: string; at: number }, agentReply: string, reason: string): boolean => {
      const before = loadQuestions();
      const after = addQuestion(before, { messageId: m.id, key: m.key, phone: m.phone, name: m.name, text: m.text, at: m.at, agentReply, reason }, Date.now());
      if (after !== before) saveQuestions(after);
      return !isSilencedFor(before, m.key, Date.now()) && isSilencedFor(after, m.key, Date.now());
    };
    for (const m of messages) {
      const done = () => LocalBrowser.whatsappAgentAck({ ids: [m.id] });
      // 🔍 a message left unanswered says why in «آخر ما فعله الوكيل» (it vanished silently before)
      const skip = agentSkipReason({ on: settings.on, hasKey: hasClaudeKey(), ageMs: Date.now() - m.at, freshMs: FRESH_MS });
      if (skip) {
        addLog({ at: Date.now(), name: m.name, question: m.text, reply: "", handoff: false, sent: false, error: skip });
        await done();
        continue;
      }
      // 🤐 two questions without his answer: silent with this customer (no Claude cost) until he answers - 24 h at most
      if (isSilencedFor(loadQuestions(), m.key, Date.now())) {
        ask(m, "", "سكت الوكيل: سؤالان قبله بلا جوابك");
        addLog({ at: Date.now(), name: m.name, question: m.text, reply: "", handoff: true, sent: false, error: "🤐 سكت - ينتظر جوابك في «🎓 تدريب الوكيل»" });
        await done();
        continue;
      }
      // 🔄 a question about his device, his data older than 6 hours: read it again from Starlink first (agentRefresh.ts)
      const fresh = await refreshFor(m.phone ?? m.key, m.text);
      const { client, facts } = factsFor(m.phone ?? m.key, fresh);
      const chat = chats[m.key] ?? [];
      const answer = await askClaudeJson<AgentAnswer>({
        system: AGENT_SYSTEM,
        user: agentUserText({ business: loadBusinessProfile().name, paymentLines: paymentInstructions(), facts, senderName: m.name, chat, message: m.text, lessons }),
        schema: AGENT_SCHEMA as unknown as Record<string, unknown>,
        keys: AGENT_KEYS,
        effort: "low",
        model: AGENT_MODEL,
      });
      if (answer.ok) recordSpend(answer.usage);
      if (!answer.ok) {
        addLog({ at: Date.now(), name: m.name, question: m.text, reply: "", handoff: true, sent: false, error: answer.message });
        ask(m, "", `لم يرد الوكيل: ${answer.message}`);
        await notifyPhone(handoffNotice(m.name, m.phone, m.text, `لم يرد الوكيل: ${answer.message}`), "/agent");
        await done();
        continue;
      }
      const { sent } = await LocalBrowser.whatsappAgentReply({ id: m.id, key: m.key, text: answer.value.reply });
      if (sent) sentCount++;
      chats[m.key] = withTurns(chat, { from: "customer", text: m.text, at: m.at }, ...(sent ? [{ from: "agent" as const, text: answer.value.reply, at: Date.now() }] : []));
      writeJson(CHATS_KEY, chats);
      addLog({ at: Date.now(), name: client?.name ?? m.name, question: m.text, reply: answer.value.reply, handoff: answer.value.handoff, sent });
      if (answer.value.handoff || !sent) {
        const reason = sent ? answer.value.reason : "لم يُرسل الرد (الإشعار اختفى) - رد عليه بنفسك";
        const silent = answer.value.handoff ? ask({ ...m, name: client?.name ?? m.name }, sent ? answer.value.reply : "", reason) : false;
        await notifyPhone(
          handoffNotice(client?.name ?? m.name, m.phone, m.text, silent ? `${reason}\n🤐 سكت الوكيل معه حتى تجيبه في «🎓 تدريب الوكيل»` : reason),
          "/agent",
        );
      }
      await done();
    }
  } catch {
    // the next round tries again
  } finally {
    busy = false;
  }
  return sentCount;
}

/** 🎓 His answers waiting to go out: each through its message's «رد» (or any WhatsApp notification of that customer
 * still on the screen). Not found = «لم يُرسل» on the page, he sends it himself. */
async function sendOwnerAnswers(): Promise<number> {
  const waiting = answersToSend(loadQuestions());
  if (!waiting.length) return 0;
  let sentCount = 0;
  const chats = readJson<Record<string, AgentTurn[]>>(CHATS_KEY, {});
  for (const q of waiting) {
    const { sent } = await LocalBrowser.whatsappAgentReply({ id: q.messageId, key: q.key, text: q.answer! });
    saveQuestions(markSent(loadQuestions(), q.id, sent, Date.now()));
    if (sent) {
      sentCount++;
      chats[q.key] = withTurns(chats[q.key] ?? [], { from: "customer", text: q.text, at: q.at }, { from: "agent", text: q.answer!, at: Date.now() });
    }
    addLog({ at: Date.now(), name: q.name, question: q.text, reply: q.answer!, handoff: false, sent, ...(sent ? {} : { error: "جوابك لم يُرسل: إشعار المحادثة اختفى - أرسله بنفسك" }) });
  }
  writeJson(CHATS_KEY, chats);
  return sentCount;
}

// ---- 🔄 a fresh Starlink read before answering (lib/agentRefresh.ts) ----

const REFRESH_ASKED_KEY = "starnet.whatsappAgentRefresh";

/** Reads the customer's stale devices again (background sync) and waits for the results - [] when nothing was read
 * (not about his device, fresh enough, asked lately, the sync could not start, or no result in time). */
async function refreshFor(phone: string, text: string): Promise<PendingSyncLike[]> {
  if (!asksAboutDevice(text)) return [];
  const client = clientByPhone(loadClientStore(), phone);
  const now = Date.now();
  const asked = readJson<Record<string, number>>(REFRESH_ASKED_KEY, {});
  const list = devicesToRefresh(devicesOf(client), asked, now);
  if (!list.length) return [];
  const ids = list.map((d) => d.id);
  for (const id of ids) asked[id] = now;
  writeJson(REFRESH_ASKED_KEY, asked);
  const before = new Set((await listPendingAccountSyncs()).map((p) => p.syncId));
  if (!(await startBackgroundSync(list.map((d) => ({ id: d.id, name: d.name })), "🤖 الوكيل يقرأ جهاز زبون"))) {
    addLog({ at: Date.now(), name: client?.name ?? "", question: text, reply: "", handoff: false, sent: false, error: "🔄 لم يستطع قراءة الجهاز من Starlink (اسمح بـ«الظهور فوق التطبيقات»، أو مزامنة أخرى تعمل) - أجاب بآخر ما يعرفه" });
    return [];
  }
  let got: PendingSyncLike[] = [];
  while (Date.now() - now < REFRESH_WAIT_MS) {
    await new Promise((r) => window.setTimeout(r, 3000));
    got = newResults(await listPendingAccountSyncs(), ids, before);
    if (allRead(got, ids)) break;
    // the home screen may have merged (and cleared) the result already: then the store holds it
    const stored = devicesOf(client).filter((d) => ids.includes(d.id));
    if (stored.length && stored.every((d) => d.lastSuccessfulScanAt && Date.parse(d.lastSuccessfulScanAt) >= now)) break;
  }
  return got;
}

// ---- 💰 the estimated spend (phone-only, lib/agentRefresh.ts) ----

const SPEND_KEY = "starnet.whatsappAgentSpend";

export function loadAgentSpend(): AgentSpend {
  return { ...NO_SPEND, ...readJson<Partial<AgentSpend>>(SPEND_KEY, {}) };
}

function recordSpend(usage: { model: string; input: number; output: number } | undefined): void {
  if (!usage) return;
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  writeJson(SPEND_KEY, addSpend(loadAgentSpend(), date, costOf(usage.model, usage.input, usage.output)));
  window.dispatchEvent(new Event(AGENT_EVENT));
}
