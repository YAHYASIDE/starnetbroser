/**
 * The answers the Telegram bots give while the app is closed. Each time the app is open it
 * prepares every answer from the phone's data and hands them to TelegramReplyService (native),
 * which only picks the prepared text for a command - so a rep can only ever receive the texts
 * prepared under HIS id. Pure; the loading/pushing is in telegram.ts.
 */

import { forecastText, goalsText, healthText, lapsedText, planText, promisesText } from "./ownerInsightsText";
import type { PartyAdjustmentList } from "./partyBalanceStore";
import type { PaymentPromise } from "./paymentPromises";
import type { MonthlyGoals } from "./goals";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntryList } from "./cashStore";
import type { ClientStore } from "./clientStore";
import { buildEveningSummary } from "./eveningSummary";
import type { Invoice } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import type { RepresentativeStore, RepSettlementList } from "./repStore";
import {
  REP_HELP,
  REP_ACTIVATION_HINT,
  REP_ACTIVATION_PLANS,
  REP_CLIENT_HINT,
  REP_KEYBOARD,
  REP_PAYMENT_HINT,
  REP_REQUEST_RECEIVED,
  REP_SEARCH_HINT,
  REP_WORDS,
  repAccounts,
  repDaysReply,
  repDebtsReply,
  repDevicesText,
  repExpiringReply,
  repLinkRequestReply,
  repMoney,
  type RepReply,
  type RepSearchEntry,
  repSearchIndex,
  repStatementText,
  repStoppedReply,
} from "./telegramRepMessages";
import { answerCash, answerExpiring, answerStopped, buildEveningTelegram, TELEGRAM_HELP, WORDS } from "./telegramMessages";

/** Mirrors TelegramReplies.Snapshot (Java). */
export interface TelegramReplySnapshot {
  at: string;
  ownerHelp: string;
  repHelp: string;
  unknown: string;
  statementLater: string;
  linkReply: string;
  linkNotice: string;
  owner: Record<string, string>;
  ownerWords: Record<string, string>;
  repWords: Record<string, string>;
  /** Per rep: kind -> text, and kind + "#kb" -> its buttons (reply_markup JSON). */
  reps: Record<string, Record<string, string>>;
  /** Per rep: his devices, for search with the app closed. */
  repSearch: Record<string, RepSearchEntry[]>;
  repKeyboard: string;
  searchHint: string;
  paymentHint: string;
  clientHint: string;
  requestReceived: string;
  /** To the operator when a rep sends a request with the app closed: "{rep}", "{text}". */
  requestNotice: string;
  /** ⚡ تفعيل choices. */
  plans: string[];
  activationHint: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "27/09 16:40" - shown under every answer given with the app closed. */
export function snapshotTime(now: Date): string {
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function buildReplySnapshot(input: {
  now: Date;
  today: string;
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  cash: CashEntryList;
  ledgerStore: LedgerByAccount;
  representatives: RepresentativeStore;
  /** Only the linked reps get answers prepared. */
  linkedRepIds: string[];
  invoices: Invoice[];
  settlements: RepSettlementList;
  rates: Record<string, number | undefined>;
  promises?: PaymentPromise[];
  goals?: MonthlyGoals;
  adjustments?: PartyAdjustmentList;
  cardBalanceUsd?: number;
}): TelegramReplySnapshot {
  const summary = buildEveningSummary({ day: input.today, accounts: input.accounts, ledgerStore: input.ledgerStore, cash: input.cash });
  const reps: Record<string, Record<string, string>> = {};
  const repSearch: Record<string, RepSearchEntry[]> = {};
  const month = input.today.slice(0, 7);
  for (const repId of input.linkedRepIds) {
    const rep = input.representatives[repId];
    if (!rep) continue;
    const mine = repAccounts(input.accounts, repId);
    const figures = repMoney({ rep, month, ledgerStore: input.ledgerStore, invoices: input.invoices, settlements: input.settlements, rates: input.rates });
    const replies: Record<string, RepReply> = {
      devices: { text: repDevicesText(mine, input.clients, input.today) },
      expiring: repExpiringReply(mine, input.clients, input.today),
      stopped: repStoppedReply(mine, input.clients),
      days: repDaysReply(mine, input.clients, input.today),
      debts: repDebtsReply(repId, input.accounts, input.ledgerStore, input.clients),
      statement: { text: repStatementText(rep.name, month, figures) },
    };
    reps[repId] = { name: rep.name };
    for (const [kind, reply] of Object.entries(replies)) {
      reps[repId]![kind] = reply.text;
      if (reply.markup) reps[repId]![`${kind}#kb`] = reply.markup;
    }
    repSearch[repId] = repSearchIndex(mine, input.clients, input.ledgerStore, input.today);
  }
  return {
    at: snapshotTime(input.now),
    ownerHelp: TELEGRAM_HELP,
    repHelp: REP_HELP,
    unknown: "لم أفهم «{text}».",
    statementLater: "📄 وصل طلب الكشف - يُرسل لك الملف عند فتح تطبيق STAR NET على الهاتف",
    linkReply: repLinkRequestReply("{name}"),
    linkNotice: "🤝 طلب ربط جديد ببوت المندوبين من {name} - اربطه بمندوبه من الإعدادات ← تيليغرام",
    owner: {
      stopped: answerStopped(input.accounts, input.clients),
      expiring: answerExpiring(input.accounts, input.clients, input.today),
      cash: answerCash(input.cash),
      summary: summary ? buildEveningTelegram(summary) : "لا توجد بيانات بعد",
      forecast: forecastText(input.accounts, input.now, input.cardBalanceUsd),
      promises: promisesText(input.promises ?? [], input.today),
      lapsed: lapsedText(input.accounts, input.clients, input.now),
      health: healthText(input.accounts, input.clients, input.now),
      goals: goalsText(input.goals ?? {}, input.today, input.ledgerStore, input.clients),
      plan: planText({
        accounts: input.accounts,
        clients: input.clients,
        promises: input.promises ?? [],
        ledger: input.ledgerStore,
        invoices: input.invoices,
        adjustments: input.adjustments ?? [],
        today: input.today,
        now: input.now,
      }),
    },
    ownerWords: { ...WORDS, "كشف": "statement", statement: "statement" },
    repWords: { ...REP_WORDS },
    reps,
    repSearch,
    repKeyboard: REP_KEYBOARD,
    searchHint: REP_SEARCH_HINT,
    paymentHint: REP_PAYMENT_HINT,
    clientHint: REP_CLIENT_HINT,
    requestReceived: REP_REQUEST_RECEIVED,
    requestNotice: "📥 طلب من المندوب {rep}: «{text}»\nوافق عليه من صفحة المندوبين في التطبيق.",
    plans: REP_ACTIVATION_PLANS,
    activationHint: REP_ACTIVATION_HINT,
  };
}
