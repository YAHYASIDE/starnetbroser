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
import { devicesFromWhatsApp, whatsappAnswers } from "./whatsappDesk";

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

/** 📧 Kept messages with an email → new devices (and customers); returns how many devices were made. */
export async function drainWhatsApp(): Promise<number> {
  const { messages } = await LocalBrowser.whatsappPending();
  if (!messages.length) return 0;
  const now = new Date().toISOString();
  const result = devicesFromWhatsApp(loadDemoAccounts(demoAccounts), loadClientStore(), messages, now, () => crypto.randomUUID());
  if (result.newClients.length) saveClientStore(result.clients);
  if (result.created.length) saveDemoAccounts(result.accounts);
  await LocalBrowser.whatsappAck({ ids: messages.map((m) => m.id) });
  for (const d of result.created) addLocalEvent(`📧 جهاز جديد من واتساب: ${d.expectedEmail} - ${d.name} («غير مفعّل»)`, "/");
  if (result.created.length || result.newClients.length) requestDataReload();
  return result.created.length;
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
