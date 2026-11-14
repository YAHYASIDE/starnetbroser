/**
 * 💬 The app's side of the WhatsApp Business reader (lib/whatsappDesk.ts holds the rules): the kept messages with an
 * email become devices, and each registered customer's ready answer goes to the phone's reader (only when the data
 * changed). Android only; on the owner's phones.
 */

import { LocalBrowser } from "@starnet/local-browser-plugin";
import { demoAccounts } from "./demoData";
import { loadDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { loadClientStore, saveClientStore } from "./clientStore";
import { loadLedgerStore } from "./ledgerStore";
import { loadInvoices } from "./invoiceStore";
import { loadPartyAdjustments } from "./partyBalanceStore";
import { loadClientMoves } from "./clientMoves";
import { computeClientCombinedTotals } from "./clientAccount";
import { businessDataSize } from "./chatOpsSend";
import { addLocalEvent } from "./eventLog";
import { requestDataReload } from "./dataReload";
import {
  addWhatsAppSuggestion,
  liveSuggestions,
  suggestionNotice,
  suggestionsFromWhatsApp,
  trashRepWhatsAppDevices,
  trashWhatsAppTwins,
  whatsappAnswers,
  type WhatsAppSuggestion,
} from "./whatsappDesk";
import { notifyPhone } from "./appEvents";
import { listRepresentatives, loadRepresentativeStore, saveRepresentativeStore } from "./repStore";

/** «يرد وحده تلقائيًا» on this phone (his choice: on). Phone-only setting. */
export const WHATSAPP_ANSWER_KEY = "starnet.whatsappAnswer";
export const WHATSAPP_EVENT = "starnet:whatsapp";

export function whatsappAnswerOn(): boolean {
  try {
    return window.localStorage.getItem(WHATSAPP_ANSWER_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setWhatsappAnswerOn(on: boolean): void {
  try {
    window.localStorage.setItem(WHATSAPP_ANSWER_KEY, on ? "1" : "0");
  } catch {
    // stays as it was
  }
  lastPushed = "";
  window.dispatchEvent(new Event(WHATSAPP_EVENT));
}

/** 📧 The emails waiting for «➕ أضف» (phone-only: each phone reads its own WhatsApp). */
const SUGGESTIONS_KEY = "starnet.whatsappSuggestions";
export const WHATSAPP_SUGGESTIONS_EVENT = "starnet:whatsapp-suggestions";

export function loadWhatsAppSuggestions(): WhatsAppSuggestion[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SUGGESTIONS_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is WhatsAppSuggestion => !!x && typeof x.id === "string" && typeof x.email === "string") : [];
  } catch {
    return [];
  }
}

function saveWhatsAppSuggestions(list: WhatsAppSuggestion[]): void {
  try {
    window.localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    // full storage: they come back with the next messages
  }
  window.dispatchEvent(new Event(WHATSAPP_SUGGESTIONS_EVENT));
}

/** ➕ «أضف»: the device (and the customer when new) is made now - never before he taps it. */
export function acceptWhatsAppSuggestion(id: string): boolean {
  const list = loadWhatsAppSuggestions();
  const s = list.find((x) => x.id === id);
  if (!s) return false;
  const now = new Date().toISOString();
  const result = addWhatsAppSuggestion(loadDemoAccounts(demoAccounts), loadClientStore(), s, now, () => crypto.randomUUID());
  if (result.newClients.length) saveClientStore(result.clients);
  if (result.created.length) {
    saveDemoAccounts(result.accounts);
    for (const d of result.created) addLocalEvent(`📧 أُضيف جهاز من واتساب: ${d.expectedEmail} - ${d.name} («غير مفعّل»)`, "/");
    requestDataReload();
  }
  saveWhatsAppSuggestions(list.filter((x) => x.id !== id));
  return result.created.length > 0;
}

/** ✕ «لا تضف»: forgotten, nothing made. */
export function dismissWhatsAppSuggestion(id: string): void {
  saveWhatsAppSuggestions(loadWhatsAppSuggestions().filter((x) => x.id !== id));
}

/** 📧 Kept messages with an email → suggestions + a phone notification each (nothing is added by itself - his
 * Nov 14 2026 choice); a WhatsApp device made earlier from a rep's message or added by hand since goes to the trash.
 * Returns how many emails are newly waiting. */
export async function drainWhatsApp(): Promise<number> {
  const now = new Date().toISOString();
  const { messages } = await LocalBrowser.whatsappPending();
  let accounts = loadDemoAccounts(demoAccounts);
  let changed = false;
  let made = 0;
  const repStore = loadRepresentativeStore();
  const reps = listRepresentatives(repStore);
  const waiting = liveSuggestions(loadWhatsAppSuggestions(), accounts);
  if (messages.length) {
    const result = suggestionsFromWhatsApp(accounts, waiting, messages, reps);
    // 🤝 a rep known by his name: his WhatsApp number saved on his card (his messages are then known by it)
    if (result.repNumbers.length) {
      const nextReps = { ...repStore };
      for (const { repId, phone } of result.repNumbers) {
        const rep = nextReps[repId];
        if (rep && !rep.phone) {
          nextReps[repId] = { ...rep, phone, updatedAt: now };
          addLocalEvent(`🤝 رقم واتساب المندوب ${rep.name} حُفظ في بطاقته: ${phone}`, "/representatives");
        }
      }
      saveRepresentativeStore(nextReps);
    }
    saveWhatsAppSuggestions(result.suggestions);
    await LocalBrowser.whatsappAck({ ids: messages.map((m) => m.id) });
    for (const s of result.added) void notifyPhone(suggestionNotice(s), "/");
    made = result.added.length;
  } else if (waiting.length !== loadWhatsAppSuggestions().length) {
    saveWhatsAppSuggestions(waiting);
  }
  const fromReps = trashRepWhatsAppDevices(accounts, loadClientStore(), listRepresentatives(loadRepresentativeStore()), now);
  if (fromReps.trashed.length) {
    accounts = fromReps.accounts;
    changed = true;
    if (fromReps.removedClients.length) saveClientStore(fromReps.clients);
    for (const d of fromReps.trashed) addLocalEvent(`🗑️ جهاز من رسالة مندوب على واتساب نُقل إلى المحذوفات: ${d.expectedEmail}`, "/trash");
  }
  const twins = trashWhatsAppTwins(accounts, now);
  if (twins.trashed.length) {
    accounts = twins.accounts;
    changed = true;
    for (const d of twins.trashed) addLocalEvent(`🗑️ جهاز واتساب مكرّر نُقل إلى المحذوفات: ${d.expectedEmail} (أُضيف الحساب نفسه يدويًا)`, "/trash");
  }
  if (changed) {
    saveDemoAccounts(accounts);
    requestDataReload();
  }
  return made;
}

let lastPushed = "";

/** 📲 Each registered customer's answer to the phone's reader - only when the data (or the switch) changed. */
export async function pushWhatsAppAnswers(): Promise<void> {
  const on = whatsappAnswerOn();
  const look = `${on}|${businessDataSize(window.localStorage)}`;
  if (look === lastPushed) return;
  if (!on) {
    await LocalBrowser.whatsappSetup({ enabled: false });
    lastPushed = look;
    return;
  }
  const clients = loadClientStore();
  const accounts = loadDemoAccounts(demoAccounts);
  const ledger = loadLedgerStore();
  const invoices = loadInvoices();
  const adjustments = loadPartyAdjustments();
  const moves = loadClientMoves();
  const answers = whatsappAnswers(clients, accounts, (clientId, devices) =>
    Object.fromEntries(Object.entries(computeClientCombinedTotals(invoices, adjustments, clientId, devices, ledger, moves)).map(([c, t]) => [c, t.remaining])),
  );
  await LocalBrowser.whatsappSetup({ enabled: true, answers: JSON.stringify(answers) });
  lastPushed = look;
}
