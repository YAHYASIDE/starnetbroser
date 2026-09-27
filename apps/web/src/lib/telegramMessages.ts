/**
 * The texts the Telegram bot sends, and the commands it understands. Pure - the sending is in
 * telegram.ts (native, token never leaves the phone's private storage) and the command loop in
 * TelegramBridge.tsx (answered only while the app is open, since the data lives on this phone).
 * Every amount stays in its own currency.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntryList } from "./cashStore";
import { computeCashBalanceByCurrency } from "./cashStore";
import type { ClientStore } from "./clientStore";
import type { EveningSummary } from "./eveningSummary";
import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency } from "./ledgerStore";

const EPSILON = 0.005;
const MAX_NAMES = 25;

export interface TelegramPrefs {
  stopped: boolean;
  payments: boolean;
  morning: boolean;
  evening: boolean;
  /** Reps bot: each rep hears about his own devices. */
  repStopped: boolean;
  repMorning: boolean;
  repPayments: boolean;
  repMonthly: boolean;
}

export const DEFAULT_TELEGRAM_PREFS: TelegramPrefs = {
  stopped: true,
  payments: true,
  morning: true,
  evening: true,
  repStopped: true,
  repMorning: true,
  repPayments: true,
  repMonthly: true,
};

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

export function money(values: Record<string, number>): string {
  return Object.entries(values)
    .filter(([, v]) => Math.abs(v) > EPSILON)
    .map(([code, v]) => `${v < 0 ? "-" : ""}${formatAmount(Math.abs(v))} ${currencyLabel(code)}`)
    .join(" + ");
}

function epochDay(date: string): number | null {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(date.trim());
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(time) ? null : Math.round(time / 86_400_000);
}

/** Days from `today` (yyyy-mm-dd) to the device's renewal date; null when unknown. */
export function daysUntilRenewal(account: StarlinkAccountSummary, today: string): number | null {
  const date = epochDay(account.rechargeDate || "");
  const base = epochDay(today);
  return date === null || base === null ? null : date - base;
}

function isLive(account: StarlinkAccountSummary): boolean {
  return !account.archivedAt && !account.deletedAt && !account.deviceFault;
}

export function isStoppedAccount(account: StarlinkAccountSummary): boolean {
  return account.serviceStatus === "suspended" || account.serviceStatus === "canceled";
}

function label(account: StarlinkAccountSummary, clients: ClientStore): string {
  const client = account.clientId ? clients[account.clientId]?.name : undefined;
  return client ? `${account.name} (${client})` : account.name;
}

function list(title: string, accounts: StarlinkAccountSummary[], clients: ClientStore): string[] {
  if (accounts.length === 0) return [];
  const names = accounts.slice(0, MAX_NAMES).map((a) => `• ${label(a, clients)}`);
  if (accounts.length > MAX_NAMES) names.push(`• و${accounts.length - MAX_NAMES} آخر`);
  return ["", `${title} (${accounts.length}):`, ...names];
}

/** The 7/3/1-day groups the operator cares about, plus the just-expired ones. */
export function renewalGroups(accounts: StarlinkAccountSummary[], today: string) {
  const groups = { expired: [] as StarlinkAccountSummary[], today: [] as StarlinkAccountSummary[], tomorrow: [] as StarlinkAccountSummary[], in3: [] as StarlinkAccountSummary[], in7: [] as StarlinkAccountSummary[] };
  for (const account of accounts) {
    if (!isLive(account)) continue;
    const days = daysUntilRenewal(account, today);
    if (days === null) continue;
    if (days >= -3 && days < 0) groups.expired.push(account);
    else if (days === 0) groups.today.push(account);
    else if (days === 1) groups.tomorrow.push(account);
    else if (days >= 2 && days <= 3) groups.in3.push(account);
    else if (days >= 4 && days <= 7) groups.in7.push(account);
  }
  return groups;
}

function renewalLines(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): string[] {
  const g = renewalGroups(accounts, today);
  return [
    ...list("⛔ انتهت خلال 3 أيام", g.expired, clients),
    ...list("🔴 تنتهي اليوم", g.today, clients),
    ...list("🟠 تنتهي غداً", g.tomorrow, clients),
    ...list("🟡 خلال 2 - 3 أيام", g.in3, clients),
    ...list("🟢 خلال 4 - 7 أيام", g.in7, clients),
  ];
}

export function buildMorningTelegram(input: {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  owedByCurrency: Record<string, number>;
  today: string;
}): string {
  const lines = [`☀️ صباح الخير - ملخص STAR NET ليوم ${input.today}`, ...renewalLines(input.accounts, input.clients, input.today)];
  if (lines.length === 1) lines.push("", "✓ لا أجهزة تنتهي خلال 7 أيام");
  const owed = money(input.owedByCurrency);
  if (owed) lines.push("", `💰 ديون على الزبائن: ${owed}`);
  return lines.join("\n");
}

export function buildEveningTelegram(summary: EveningSummary): string {
  return [summary.title, "", ...summary.lines].join("\n");
}

export function buildPaymentTelegram(input: {
  deviceName: string;
  clientName?: string;
  amount: number;
  currency: string;
  method?: string;
  /** In the payment's currency, after it; positive = still owed. */
  balanceAfter?: number;
  date: string;
}): string {
  const lines = [
    "💵 دفعة جديدة",
    `الزبون: ${input.clientName || "—"}`,
    `الجهاز: ${input.deviceName}`,
    `المبلغ: ${formatAmount(input.amount)} ${currencyLabel(input.currency)}${input.method ? ` (${input.method})` : ""}`,
    `التاريخ: ${input.date}`,
  ];
  if (input.balanceAfter !== undefined) {
    lines.push(
      input.balanceAfter > EPSILON
        ? `المتبقي عليه: ${formatAmount(input.balanceAfter)} ${currencyLabel(input.currency)}`
        : input.balanceAfter < -EPSILON
          ? `رصيد له: ${formatAmount(-input.balanceAfter)} ${currencyLabel(input.currency)}`
          : "✓ لم يبقَ عليه شيء",
    );
  }
  return lines.join("\n");
}

// ---- Commands (answered while the app is open) ----

export type TelegramCommand =
  | { kind: "help" }
  | { kind: "stopped" }
  | { kind: "expiring" }
  | { kind: "cash" }
  | { kind: "summary" }
  | { kind: "statement"; query: string }
  | { kind: "unknown" };

const WORDS: Record<string, Exclude<TelegramCommand["kind"], "statement" | "unknown">> = {
  start: "help",
  help: "help",
  "مساعدة": "help",
  "ابدأ": "help",
  "الأوامر": "help",
  stopped: "stopped",
  "المتوقفة": "stopped",
  "متوقفة": "stopped",
  "الموقوفة": "stopped",
  expiring: "expiring",
  "تنتهي": "expiring",
  "التجديدات": "expiring",
  cash: "cash",
  "الصندوق": "cash",
  "صندوق": "cash",
  summary: "summary",
  "ملخص": "summary",
  "اليوم": "summary",
};

export function parseTelegramCommand(text: string): TelegramCommand {
  const cleaned = text.trim().replace(/^\//, "").replace(/@\w+/, "").trim();
  const [first = "", ...rest] = cleaned.split(/\s+/);
  const word = first.toLowerCase();
  if (word === "كشف" || word === "statement") {
    const query = rest.join(" ").trim();
    return query ? { kind: "statement", query } : { kind: "help" };
  }
  return WORDS[word] ? { kind: WORDS[word] } : { kind: "unknown" };
}

export const TELEGRAM_HELP = [
  "🤖 أوامر STAR NET (تُجاب والتطبيق مفتوح على الهاتف):",
  "• المتوقفة - الأجهزة الموقوفة عند Starlink",
  "• تنتهي - الأجهزة التي تنتهي خلال 7 أيام",
  "• الصندوق - رصيد الصندوق",
  "• ملخص - ملخص اليوم",
  "• كشف <اسم> - كشف حساب زبون أو مورد (PDF)",
].join("\n");

export function answerStopped(accounts: StarlinkAccountSummary[], clients: ClientStore): string {
  const stopped = accounts.filter((a) => !a.archivedAt && !a.deletedAt && isStoppedAccount(a));
  if (stopped.length === 0) return "✓ لا أجهزة موقوفة حسب آخر مزامنة";
  return ["⛔ الأجهزة الموقوفة حسب آخر مزامنة", ...list("الموقوفة", stopped, clients).slice(1)].join("\n");
}

export function answerExpiring(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): string {
  const lines = renewalLines(accounts, clients, today);
  return lines.length === 0 ? "✓ لا أجهزة تنتهي خلال 7 أيام" : ["📅 التجديدات القريبة", ...lines].join("\n");
}

export function answerCash(cash: CashEntryList): string {
  const balance = money(computeCashBalanceByCurrency(cash));
  return balance ? `🏦 في الصندوق الآن: ${balance}` : "🏦 الصندوق فارغ";
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
}

export interface PartyMatch {
  kind: "client" | "supplier";
  id: string;
  name: string;
}

/** Clients and suppliers whose name contains the query (an exact name wins outright). */
export function matchParties(query: string, clients: { id: string; name: string }[], suppliers: { id: string; name: string }[]): PartyMatch[] {
  const q = normalize(query);
  if (!q) return [];
  const all: PartyMatch[] = [
    ...clients.map((c) => ({ kind: "client" as const, id: c.id, name: c.name })),
    ...suppliers.map((s) => ({ kind: "supplier" as const, id: s.id, name: s.name })),
  ];
  const exact = all.filter((p) => normalize(p.name) === q);
  if (exact.length > 0) return exact;
  return all.filter((p) => normalize(p.name).includes(q));
}
