/**
 * The answers the Telegram bots give while the app is closed. Each time the app is open it
 * prepares every answer from the phone's data and hands them to TelegramReplyService (native),
 * which only picks the prepared text for a command - so a rep can only ever receive the texts
 * prepared under HIS id. Pure; the loading/pushing is in telegram.ts.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntryList } from "./cashStore";
import type { ClientStore } from "./clientStore";
import { buildEveningSummary } from "./eveningSummary";
import type { Invoice } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import type { RepresentativeStore, RepSettlementList } from "./repStore";
import {
  REP_HELP,
  REP_WORDS,
  repAccounts,
  repDebtsText,
  repDevicesText,
  repExpiringText,
  repLinkRequestReply,
  repMoney,
  repStatementText,
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
  reps: Record<string, Record<string, string>>;
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
}): TelegramReplySnapshot {
  const summary = buildEveningSummary({ day: input.today, accounts: input.accounts, ledgerStore: input.ledgerStore, cash: input.cash });
  const reps: Record<string, Record<string, string>> = {};
  const month = input.today.slice(0, 7);
  for (const repId of input.linkedRepIds) {
    const rep = input.representatives[repId];
    if (!rep) continue;
    const mine = repAccounts(input.accounts, repId);
    const figures = repMoney({ rep, month, ledgerStore: input.ledgerStore, invoices: input.invoices, settlements: input.settlements, rates: input.rates });
    reps[repId] = {
      devices: repDevicesText(mine, input.clients, input.today),
      expiring: repExpiringText(mine, input.clients, input.today),
      debts: repDebtsText(repId, input.accounts, input.ledgerStore, input.clients),
      statement: repStatementText(rep.name, month, figures),
    };
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
    },
    ownerWords: { ...WORDS, "كشف": "statement", statement: "statement" },
    repWords: { ...REP_WORDS },
    reps,
  };
}
