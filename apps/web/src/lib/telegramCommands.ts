"use client";

/**
 * Answers a command sent to the Telegram bot (TelegramBridge polls while the app is open), from
 * the data as it is on this phone right now. Texts and parsing are in telegramMessages.ts.
 */

import { currentCardBalanceUsd, listOpenShipmentDebts } from "./starlinkDebt";
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
  downloadRepFile,
  loadRepChats,
  pushTelegramReplies,
  recordRepRequest,
  repIdForChat,
  replyToChat,
  sendRepText,
  sendTelegramPdf,
  sendTelegramText,
  repBotNames,
} from "./telegram";
import { devicesHelp, devicesKeyboard, isMoneyKind, moneyRedirectText, REP_HANDOVER_HINT, repHandoverReceivedText, REP_LOAN_HINT, type RepBot } from "./repBots";
import { buildReplySnapshot } from "./telegramReplies";
import { deviceDisplayName, readRepDeviceFile, repDeviceCode } from "./repDeviceTransfer";
import { cardText, forecastText, goalsText, healthText, lapsedText, planText, promisesText } from "./ownerInsightsText";
import { addPromise, loadPromises, savePromises } from "./paymentPromises";
import { parseRepPromise, REP_PROMISE_HINT, repOpenPromises, repPromisesText } from "./repPromises";
import { loadGoals } from "./goals";
import type { TelegramPollMessage } from "@starnet/local-browser-plugin";
import { getCurrency, loadCurrencyStore } from "./currencyStore";
import { loadRepresentativeStore, loadRepSettlements, type Representative } from "./repStore";
import {
  parseRepCommand,
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
  formatMoneyShort,
  matchRepDevices,
  REP_ACTIVATION_HINT,
  REP_CLIENT_MOVED,
  REP_PAYMENT_HINT,
  repPaymentReceivedText,
} from "./telegramRepMessages";
import { addRepRequest, loadRepRequests, parseRepPayment, saveRepRequests } from "./repRequests";
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
    case "unknown": {
      // A name, phone, email or KIT: the matching devices, like the reps' search.
      const accounts = (await loadAccounts()).filter((a) => !a.deletedAt && !a.archivedAt);
      const found = repSearchReply(text, repSearchIndex(accounts, loadClientStore(), loadLedgerStore(), today), today, true);
      if (!found.text.startsWith("🔎 لم أجد")) {
        await sendTelegramText(found.text, found.markup);
        return;
      }
      await sendTelegramText(`لم أفهم «${text.slice(0, 40)}».\n\n${TELEGRAM_HELP}`);
      return;
    }
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
    case "forecast":
      await sendTelegramText(forecastText(await loadAccounts(), new Date(), currentCardBalanceUsd(loadLedgerStore())));
      return;
    case "promises":
      await sendTelegramText(promisesText(loadPromises(), today));
      return;
    case "lapsed":
      await sendTelegramText(lapsedText(await loadAccounts(), loadClientStore(), new Date()));
      return;
    case "health":
      await sendTelegramText(healthText(await loadAccounts(), loadClientStore(), new Date(), loadLedgerStore()));
      return;
    case "goals":
      await sendTelegramText(goalsText(loadGoals(), today, loadLedgerStore(), loadClientStore()));
      return;
    case "card": {
      const ledger = loadLedgerStore();
      await sendTelegramText(cardText(await loadAccounts(), currentCardBalanceUsd(ledger), listOpenShipmentDebts(ledger).map((d) => d.costUsd), new Date()));
      return;
    }
    case "plan":
      await sendTelegramText(
        planText({
          accounts: await loadAccounts(),
          clients: loadClientStore(),
          promises: loadPromises(),
          ledger: loadLedgerStore(),
          invoices: loadInvoices(),
          adjustments: loadPartyAdjustments(),
          today,
          now: new Date(),
        }),
      );
      return;
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
export async function answerRepMessage(message: TelegramPollMessage, alreadyReplied = false, bot: RepBot = "reps"): Promise<void> {
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
  if (message.fileId) {
    await handleRepDeviceFile(repId, rep, message.fileId, alreadyReplied);
    return;
  }
  const command = parseRepCommand(message.text);
  const names = repBotNames();
  // 💰 Once the money bot is connected, money commands live there only.
  if (bot === "reps" && names.money && isMoneyKind(command.kind)) {
    if (!alreadyReplied) await sendRepText(repId, moneyRedirectText(names.money));
    return;
  }
  if (command.kind === "handover") {
    await handleRepHandover(repId, rep, command.text, alreadyReplied);
    return;
  }
  if (command.kind === "payment" || command.kind === "client") {
    await handleRepRequest(repId, rep, command, alreadyReplied);
    return;
  }
  if (command.kind === "promise") {
    await handleRepPromise(repId, rep, command.text, alreadyReplied);
    return;
  }
  const reply = await repReplyFor(repId, rep, command);
  await sendRepText(repId, reply.text, reply.markup ?? devicesKeyboard(names));
}

/** 🤲 Money the rep says he handed to the operator: kept for approval (the operator confirms it
 * on the representatives page, which records it as a cash handover). */
async function handleRepHandover(repId: string, rep: Representative, text: string, alreadyReplied: boolean): Promise<void> {
  const parsed = parseRepPayment(text);
  if (!parsed) {
    if (!alreadyReplied) await sendRepText(repId, REP_HANDOVER_HINT, undefined, "money");
    return;
  }
  saveRepRequests(addRepRequest(loadRepRequests(), { repId, kind: "handover", text: `سلّمت ${text}`, amount: parsed.amount, currency: parsed.currency }));
  if (!alreadyReplied) {
    const label = formatMoneyShort(parsed.amount, parsed.currency);
    await sendRepText(repId, repHandoverReceivedText(label), undefined, "money");
    await sendTelegramText(`🤲 المندوب ${rep.name} يقول إنه سلّمك ${label}\nأكّده من صفحة المندوبين في التطبيق.`);
  }
}

export const REP_DEVICE_RECEIVED = "📥 وصل ملف الجهاز - بانتظار موافقة المسؤول.\nاضغط «✅ وصل» في تطبيقك لحذف الجلسة من هاتفك.";

/** 📱 A device (with its Starlink session) from the rep's app: downloaded and kept, still
 * encrypted, for the operator to approve on the representatives page. */
async function handleRepDeviceFile(repId: string, rep: Representative, fileId: string, alreadyReplied: boolean): Promise<void> {
  const text = await downloadRepFile(fileId);
  if (!text) {
    await sendTelegramText(`⚠️ لم أتمكن من تنزيل ملف الجهاز الذي أرسله المندوب ${rep.name} - اطلب منه إعادة الإرسال.`);
    return;
  }
  const code = repDeviceCode(repId);
  let details: { name?: string; phone?: string; email?: string; kit?: string; deviceName?: string } = {};
  let codeMismatch = false;
  try {
    if (!code) throw new Error("no code");
    const payload = await readRepDeviceFile(text, code);
    details = { name: payload.device.clientName, phone: payload.device.phone, email: payload.device.email, kit: payload.device.kit, deviceName: deviceDisplayName(payload.device) };
  } catch {
    codeMismatch = true;
  }
  saveRepRequests(
    addRepRequest(loadRepRequests(), { repId, kind: "device", text: details.deviceName ? `جهاز ${details.deviceName}` : "جهاز من تطبيق المندوب", file: text, codeMismatch, ...details }),
  );
  if (!alreadyReplied) {
    await sendRepText(repId, REP_DEVICE_RECEIVED);
    await sendTelegramText(`📥 المندوب ${rep.name} أرسل جهازاً جديداً مع دخوله إلى Starlink${details.name ? ` (${details.name})` : ""} - وافق عليه من صفحة المندوبين في التطبيق.`);
  }
}

/** 🤝 A customer's payment promise reported by the rep: a follow-up record (never money), so it's
 * saved straight away - tied to the customer when the words match one of his devices. */
async function handleRepPromise(repId: string, rep: Representative, text: string, alreadyReplied: boolean): Promise<void> {
  const parsed = parseRepPromise(text, new Date());
  if (!parsed) {
    if (!alreadyReplied) await sendRepText(repId, REP_PROMISE_HINT, undefined, "money");
    return;
  }
  const clients = loadClientStore();
  const matches = parsed.query ? matchRepDevices(parsed.query, repAccounts(await loadAccounts(), repId), clients) : [];
  const device = matches.length === 1 ? matches[0] : undefined;
  const client = device?.clientId ? clients[device.clientId] : undefined;
  const name = client?.name ?? (parsed.query || device?.name || "زبون");
  savePromises(
    addPromise(loadPromises(), {
      clientId: client?.id,
      name,
      phone: client?.phone ?? device?.phone,
      amount: parsed.amount,
      currency: parsed.currency,
      dueDate: parsed.dueDate,
      note: `عبر المندوب ${rep.name}${device ? ` · ${device.name}` : ""}`,
      repId,
    }),
  );
  if (!alreadyReplied) {
    const day = `${parsed.dueDate.slice(8, 10)}/${parsed.dueDate.slice(5, 7)}`;
    await sendRepText(repId, `✅ سُجّل وعد ${name} بدفع ${formatMoneyShort(parsed.amount, parsed.currency)} يوم ${day}${parsed.defaulted ? " (بعد أسبوع - لم تذكر يوماً)" : ""}.`, undefined, "money");
    await sendTelegramText(`🤝 وعد دفع عبر المندوب ${rep.name}: ${name} - ${formatMoneyShort(parsed.amount, parsed.currency)} يوم ${day}`);
  }
}

/** 💵 / ➕ from a rep: kept for the operator to approve (never recorded directly). With the app
 * closed the service already answered him and told the operator - then it's only recorded. */
async function handleRepRequest(
  repId: string,
  rep: Representative,
  command: { kind: "payment" | "client"; text: string },
  alreadyReplied: boolean,
): Promise<void> {
  if (command.kind === "payment") {
    const parsed = parseRepPayment(command.text);
    if (!parsed) {
      if (!alreadyReplied) await sendRepText(repId, REP_PAYMENT_HINT, undefined, "money");
      return;
    }
    const matches = parsed.query ? matchRepDevices(parsed.query, repAccounts(await loadAccounts(), repId), loadClientStore()) : [];
    const device = matches.length === 1 ? matches[0] : undefined;
    saveRepRequests(
      addRepRequest(loadRepRequests(), {
        repId,
        kind: "payment",
        text: `دفعة ${command.text}`,
        amount: parsed.amount,
        currency: parsed.currency,
        query: parsed.query || undefined,
        accountId: device?.id,
      }),
    );
    if (!alreadyReplied) {
      await sendRepText(repId, repPaymentReceivedText(parsed.amount, parsed.currency, device?.name), undefined, "money");
      await sendTelegramText(`💵 طلب دفعة من المندوب ${rep.name}: ${formatMoneyShort(parsed.amount, parsed.currency)}${device ? ` عن ${device.name}` : parsed.query ? ` («${parsed.query}»)` : ""}\nوافق عليه من صفحة المندوبين في التطبيق.`);
    }
    return;
  }
  // ➕ New customers are added from the app now, never from the bot: no request is created, the
  // operator isn't pinged, the rep is simply pointed to the app.
  if (!alreadyReplied) await sendRepText(repId, REP_CLIENT_MOVED);
}

/** One rep command answered from the data right now (his own devices only). */
async function repReplyFor(repId: string, rep: Representative, command: RepCommand): Promise<RepReply> {
  const today = localDay(new Date());
  const clients = loadClientStore();
  const all = await loadAccounts();
  const mine = repAccounts(all, repId);
  switch (command.kind) {
    case "help":
      return { text: devicesHelp(repBotNames()) };
    case "handover":
      return { text: REP_HANDOVER_HINT };
    case "loan":
      return { text: REP_LOAN_HINT };
    case "devices":
      return { text: repDevicesText(mine, clients, today) };
    case "expiring":
      return repExpiringReply(mine, clients, today);
    case "stopped":
      return repStoppedReply(mine, clients);
    case "debts":
      return repDebtsReply(repId, all, loadLedgerStore(), clients);
    case "activate":
      // Normally answered by the background service (its buttons need it); this is the fallback.
      return command.text ? repSearchReply(command.text, repSearchIndex(mine, clients, loadLedgerStore(), today, true), today, false, repBotNames().money) : { text: REP_ACTIVATION_HINT };
    case "payment":
      return { text: REP_PAYMENT_HINT };
    case "client":
      return { text: REP_CLIENT_MOVED };
    case "promise":
      return { text: REP_PROMISE_HINT };
    case "mypromises":
      return { text: repPromisesText(repOpenPromises(repId, loadPromises(), new Set(mine.map((a) => a.clientId).filter((c): c is string => Boolean(c)))), today) };
    case "days":
      return repDaysReply(mine, clients, today);
    case "search":
      return repSearchReply(command.query, repSearchIndex(mine, clients, loadLedgerStore(), today, true), today, false, repBotNames().money);
    case "unknown": {
      const found = repSearchReply(command.text, repSearchIndex(mine, clients, loadLedgerStore(), today, true), today, false, repBotNames().money);
      return found.text.startsWith("🔎 لم أجد") ? { text: `${found.text}\n\n${devicesHelp(repBotNames())}` } : found;
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
    promises: loadPromises(),
    goals: loadGoals(),
    adjustments: loadPartyAdjustments(),
    cardBalanceUsd: currentCardBalanceUsd(loadLedgerStore()),
    openDebtsUsd: listOpenShipmentDebts(loadLedgerStore()).map((d) => d.costUsd),
    botNames: repBotNames(),
  });
  await pushTelegramReplies(snapshot);
}
