"use client";

/**
 * 🤖 The WhatsApp agent at work (lib/whatsappAgent.ts holds the rules and words): his settings go to the phone's reader,
 * each waiting message gets Claude's answer (his own key, lib/claudeClient.ts) sent through the message's notification,
 * and a customer it can't help is handed to him with a phone notification. Owner's Android only; while the app is open
 * or in memory (a message read later than 15 minutes is left to him).
 */

import { LocalBrowser } from "@starnet/local-browser-plugin";
import { askClaudeJson, hasClaudeKey } from "./claudeClient";
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

let busy = false;

/** Answers every waiting message. Returns how many answers went out. */
export async function runWhatsAppAgent(): Promise<number> {
  if (busy) return 0;
  busy = true;
  let sentCount = 0;
  try {
    const { messages } = await LocalBrowser.whatsappAgentPending();
    if (!messages.length) return 0;
    const settings = loadAgentSettings();
    const chats = readJson<Record<string, AgentTurn[]>>(CHATS_KEY, {});
    for (const m of messages) {
      const done = () => LocalBrowser.whatsappAgentAck({ ids: [m.id] });
      // 🔍 a message left unanswered says why in «آخر ما فعله الوكيل» (it vanished silently before)
      const skip = agentSkipReason({ on: settings.on, hasKey: hasClaudeKey(), ageMs: Date.now() - m.at, freshMs: FRESH_MS });
      if (skip) {
        addLog({ at: Date.now(), name: m.name, question: m.text, reply: "", handoff: false, sent: false, error: skip });
        await done();
        continue;
      }
      const clients = loadClientStore();
      const client = clientByPhone(clients, m.phone ?? m.key);
      let facts: string | null = null;
      if (client) {
        const accounts = loadDemoAccounts(demoAccounts).filter((a) => a.clientId === client.id && !a.deletedAt && !a.archivedAt);
        const ledger = loadLedgerStore();
        const owed = Object.fromEntries(
          Object.entries(computeClientCombinedTotals(loadInvoices(), loadPartyAdjustments(), client.id, accounts, ledger, loadClientMoves())).map(([c, t]) => [c, t.remaining]),
        );
        facts = customerFacts(client, accounts, owed, (d) => lastChargePrice(ledger[d.id] ?? []));
      }
      const chat = chats[m.key] ?? [];
      const answer = await askClaudeJson<AgentAnswer>({
        system: AGENT_SYSTEM,
        user: agentUserText({ business: loadBusinessProfile().name, paymentLines: paymentInstructions(), facts, senderName: m.name, chat, message: m.text }),
        schema: AGENT_SCHEMA as unknown as Record<string, unknown>,
        keys: AGENT_KEYS,
        effort: "low",
      });
      if (!answer.ok) {
        addLog({ at: Date.now(), name: m.name, question: m.text, reply: "", handoff: true, sent: false, error: answer.message });
        await notifyPhone(handoffNotice(m.name, m.phone, m.text, `لم يرد الوكيل: ${answer.message}`), "/settings");
        await done();
        continue;
      }
      const { sent } = await LocalBrowser.whatsappAgentReply({ id: m.id, key: m.key, text: answer.value.reply });
      if (sent) sentCount++;
      chats[m.key] = withTurns(chat, { from: "customer", text: m.text, at: m.at }, ...(sent ? [{ from: "agent" as const, text: answer.value.reply, at: Date.now() }] : []));
      writeJson(CHATS_KEY, chats);
      addLog({ at: Date.now(), name: client?.name ?? m.name, question: m.text, reply: answer.value.reply, handoff: answer.value.handoff, sent });
      if (answer.value.handoff || !sent) {
        await notifyPhone(handoffNotice(client?.name ?? m.name, m.phone, m.text, sent ? answer.value.reason : "لم يُرسل الرد (الإشعار اختفى) - رد عليه بنفسك"), "/settings");
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
