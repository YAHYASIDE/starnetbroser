"use client";

/**
 * Answers a command sent to the Telegram bot (TelegramBridge polls while the app is open), from
 * the data as it is on this phone right now. Texts and parsing are in telegramMessages.ts.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { listAccounts } from "./apiClient";
import { loadCashEntries } from "./cashStore";
import { buildClientCombinedStatement, computeClientCombinedTotals } from "./clientAccount";
import { listClients, loadClientStore } from "./clientStore";
import { loadDemoAccounts } from "./demoAccountStore";
import { demoAccounts } from "./demoData";
import { buildEveningSummary, localDay } from "./eveningSummary";
import { buildPartyStatement, computePartyStoreTotals, loadInvoices } from "./invoiceStore";
import { loadLedgerStore } from "./ledgerStore";
import { loadPartyAdjustments } from "./partyBalanceStore";
import { buildPartyStatementPdf } from "./partyStatementPdf";
import { isDemoMode, isLoggedIn } from "./settingsStore";
import { listSuppliers, loadSupplierStore } from "./supplierStore";
import {
  loadRepChats,
  pushTelegramReplies,
  recordRepRequest,
  repIdForChat,
  replyToChat,
  sendRepText,
  sendTelegramPdf,
  sendTelegramText,
} from "./telegram";
import { buildReplySnapshot } from "./telegramReplies";
import type { TelegramPollMessage } from "@starnet/local-browser-plugin";
import { getCurrency, loadCurrencyStore } from "./currencyStore";
import { loadRepresentativeStore, loadRepSettlements, type Representative } from "./repStore";
import {
  parseRepCommand,
  REP_HELP,
  REP_KEYBOARD,
  repAccounts,
  repDaysReply,
  repDebtsReply,
  repDevicesText,
  repExpiringReply,
  repLinkRequestReply,
  repMoney,
  type RepCommand,
  type RepReply,
  repSearchIndex,
  repSearchReply,
  repStatementText,
  repStoppedReply,
} from "./telegramRepMessages";
import {
  answerCash,
  answerExpiring,
  answerStopped,
  buildEveningTelegram,
  matchParties,
  money,
  parseTelegramCommand,
  TELEGRAM_HELP,
} from "./telegramMessages";

async function loadAccounts(): Promise<StarlinkAccountSummary[]> {
  if (isDemoMode()) return loadDemoAccounts(demoAccounts);
  if (!isLoggedIn()) return [];
  try {
    return await listAccounts();
  } catch {
    return [];
  }
}

export async function answerTelegramCommand(text: string): Promise<void> {
  const command = parseTelegramCommand(text);
  const today = localDay(new Date());
  switch (command.kind) {
    case "help":
      await sendTelegramText(TELEGRAM_HELP);
      return;
    case "unknown":
      await sendTelegramText(`لم أفهم «${text.slice(0, 40)}».\n\n${TELEGRAM_HELP}`);
      return;
    case "stopped":
      await sendTelegramText(answerStopped(await loadAccounts(), loadClientStore()));
      return;
    case "expiring":
      await sendTelegramText(answerExpiring(await loadAccounts(), loadClientStore(), today));
      return;
    case "cash":
      await sendTelegramText(answerCash(loadCashEntries()));
      return;
    case "summary": {
      const summary = buildEveningSummary({ day: today, accounts: await loadAccounts(), ledgerStore: loadLedgerStore(), cash: loadCashEntries() });
      await sendTelegramText(summary ? buildEveningTelegram(summary) : "لا توجد بيانات بعد");
      return;
    }
    case "statement":
      await answerStatement(command.query);
      return;
  }
}

async function answerStatement(query: string): Promise<void> {
  const clientStore = loadClientStore();
  const supplierStore = loadSupplierStore();
  const matches = matchParties(query, listClients(clientStore), listSuppliers(supplierStore));
  if (matches.length === 0) {
    await sendTelegramText(`لم أجد زبوناً أو مورداً باسم «${query}»`);
    return;
  }
  if (matches.length > 1) {
    const names = matches.slice(0, 10).map((m) => `• ${m.name} (${m.kind === "client" ? "زبون" : "مورد"})`);
    await sendTelegramText([`وجدت ${matches.length} أسماء - اكتب «كشف» مع الاسم كاملاً:`, ...names].join("\n"));
    return;
  }
  const match = matches[0]!;
  const invoices = loadInvoices();
  const adjustments = loadPartyAdjustments();
  let doc;
  let remaining: Record<string, number>;
  if (match.kind === "client") {
    const party = clientStore[match.id]!;
    const ledgerStore = loadLedgerStore();
    const devices = (await loadAccounts()).filter((a) => a.clientId === match.id && !a.deletedAt);
    const totals = computeClientCombinedTotals(invoices, adjustments, match.id, devices, ledgerStore);
    doc = buildPartyStatementPdf(party, true, totals, buildClientCombinedStatement(invoices, adjustments, match.id, devices, ledgerStore));
    remaining = Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining]));
  } else {
    const party = supplierStore[match.id]!;
    const totals = computePartyStoreTotals(invoices, "purchase", match.id, adjustments);
    doc = buildPartyStatementPdf(party, false, totals, buildPartyStatement(invoices, "purchase", match.id, adjustments));
    remaining = Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining]));
  }
  const owed = money(remaining);
  const caption = `${doc.title} - ${match.name}\n${owed ? `${match.kind === "client" ? "المتبقي عليه" : "المتبقي له"}: ${owed}` : "✓ الحساب مسدَّد"}`;
  const sent = await sendTelegramPdf(doc, caption);
  if (!sent.ok) await sendTelegramText(`تعذر إرسال كشف ${match.name}: ${sent.message}`);
}

/**
 * A message to the reps bot. From a linked rep: answered with HIS data only. From anyone else:
 * recorded as a link request for الإعدادات and told to wait - never answered with any data.
 */
export async function answerRepMessage(message: TelegramPollMessage, alreadyReplied = false): Promise<void> {
  const repId = repIdForChat(message.chatId);
  if (!repId) {
    // alreadyReplied: the background service told him and the operator already - just record it.
    if (recordRepRequest(message) && !alreadyReplied) {
      await replyToChat(message.chatId, repLinkRequestReply(message.name));
      await sendTelegramText(`🤝 طلب ربط جديد ببوت المندوبين من ${message.name || message.username || "مستخدم"} - اربطه بمندوبه من الإعدادات ← تيليغرام`);
    }
    return;
  }
  const rep = loadRepresentativeStore()[repId];
  if (!rep) return;
  const reply = await repReplyFor(repId, rep, parseRepCommand(message.text));
  await sendRepText(repId, reply.text, reply.markup ?? REP_KEYBOARD);
}

/** One rep command answered from the data right now (his own devices only). */
async function repReplyFor(repId: string, rep: Representative, command: RepCommand): Promise<RepReply> {
  const today = localDay(new Date());
  const clients = loadClientStore();
  const all = await loadAccounts();
  const mine = repAccounts(all, repId);
  switch (command.kind) {
    case "help":
      return { text: REP_HELP };
    case "devices":
      return { text: repDevicesText(mine, clients, today) };
    case "expiring":
      return repExpiringReply(mine, clients, today);
    case "stopped":
      return repStoppedReply(mine, clients);
    case "debts":
      return repDebtsReply(repId, all, loadLedgerStore(), clients);
    case "days":
      return repDaysReply(mine, clients, today);
    case "search":
      return repSearchReply(command.query, repSearchIndex(mine, clients, loadLedgerStore(), today), today);
    case "unknown": {
      const found = repSearchReply(command.text, repSearchIndex(mine, clients, loadLedgerStore(), today), today);
      return found.text.startsWith("🔎 لم أجد") ? { text: `${found.text}\n\n${REP_HELP}` } : found;
    }
    case "statement": {
      const currencies = loadCurrencyStore();
      const rates = { MRU: getCurrency(currencies, "MRU")?.rateFromUsd, SIFA: getCurrency(currencies, "SIFA")?.rateFromUsd };
      const figures = repMoney({ rep, month: today.slice(0, 7), ledgerStore: loadLedgerStore(), invoices: loadInvoices(), settlements: loadRepSettlements(), rates });
      return { text: repStatementText(rep.name, today.slice(0, 7), figures) };
    }
  }
}

/** Prepares every answer from the data right now for when the app is closed (TelegramReplyService). */
export async function refreshTelegramReplies(): Promise<void> {
  const now = new Date();
  const currencies = loadCurrencyStore();
  const snapshot = buildReplySnapshot({
    now,
    today: localDay(now),
    accounts: await loadAccounts(),
    clients: loadClientStore(),
    cash: loadCashEntries(),
    ledgerStore: loadLedgerStore(),
    representatives: loadRepresentativeStore(),
    linkedRepIds: Object.keys(loadRepChats()),
    invoices: loadInvoices(),
    settlements: loadRepSettlements(),
    rates: { MRU: getCurrency(currencies, "MRU")?.rateFromUsd, SIFA: getCurrency(currencies, "SIFA")?.rateFromUsd },
  });
  await pushTelegramReplies(snapshot);
}
