/**
 * The representatives' Telegram bot: what a rep is told about HIS devices only, and the commands
 * he can send. A rep sees his share, his balance with us and what his customers owe - never the
 * Starlink cost, the full profit, the till, suppliers or other reps. Pure (the sending and the
 * command loop are in telegram.ts / telegramCommands.ts).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { Invoice } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import { monthLabel, monthRange } from "./monthClosing";
import { buildRepPeriodStatement, makeRepConverter, splitRepRecords } from "./repAccount";
import { repDevicesDebt } from "./repDebts";
import { buildRepDailyStatement, listRepDeviceCommissions, type Representative, type RepSettlementList } from "./repStore";
import { daysUntilRenewal, isStoppedAccount, money, renewalGroups } from "./telegramMessages";

const MAX_LINES = 60;

/** The rep's own live devices. */
export function repAccounts(accounts: StarlinkAccountSummary[], repId: string): StarlinkAccountSummary[] {
  return accounts.filter((a) => a.representativeId === repId && !a.archivedAt && !a.deletedAt);
}

/** Device - client (phone): what a rep needs to call the customer. */
function repLabel(account: StarlinkAccountSummary, clients: ClientStore): string {
  const client = account.clientId ? clients[account.clientId] : undefined;
  if (!client) return account.name;
  return client.phone ? `${account.name} - ${client.name} (${client.phone})` : `${account.name} - ${client.name}`;
}

function section(title: string, accounts: StarlinkAccountSummary[], clients: ClientStore): string[] {
  if (accounts.length === 0) return [];
  return ["", `${title} (${accounts.length}):`, ...accounts.slice(0, MAX_LINES).map((a) => `• ${repLabel(a, clients)}`)];
}

function renewalSections(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): string[] {
  const g = renewalGroups(accounts, today);
  return [
    ...section("⛔ انتهت خلال 3 أيام", g.expired, clients),
    ...section("🔴 تنتهي اليوم", g.today, clients),
    ...section("🟠 تنتهي غداً", g.tomorrow, clients),
    ...section("🟡 خلال 2 - 3 أيام", g.in3, clients),
    ...section("🟢 خلال 4 - 7 أيام", g.in7, clients),
  ];
}

/** ☀️ his renewals this week, or null when he has none (then nothing is sent). */
export function repMorningText(repName: string, accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): string | null {
  const lines = renewalSections(accounts, clients, today);
  if (lines.length === 0) return null;
  return [`☀️ صباح الخير ${repName} - تجديدات أجهزتك`, ...lines, "", "تواصل مع الزبائن قبل انتهاء الاشتراك 🙏"].join("\n");
}

export function repExpiringText(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): string {
  const lines = renewalSections(accounts, clients, today);
  return lines.length === 0 ? "✓ لا أجهزة لك تنتهي خلال 7 أيام" : ["📅 تجديدات أجهزتك القريبة", ...lines].join("\n");
}

export function repDevicesText(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): string {
  if (accounts.length === 0) return "لا توجد أجهزة مسجلة باسمك بعد";
  const stopped = accounts.filter(isStoppedAccount);
  const sorted = [...accounts].sort((a, b) => (daysUntilRenewal(a, today) ?? 9999) - (daysUntilRenewal(b, today) ?? 9999));
  const lines = [`📡 أجهزتك (${accounts.length})`, ...section("⛔ موقوفة", stopped, clients), "", "الكل حسب تاريخ التجديد:"];
  for (const account of sorted.slice(0, MAX_LINES)) {
    lines.push(`• ${repLabel(account, clients)} - ${account.rechargeDate || "بدون تاريخ"}${isStoppedAccount(account) ? " ⛔" : ""}`);
  }
  if (sorted.length > MAX_LINES) lines.push(`• و${sorted.length - MAX_LINES} آخر`);
  return lines.join("\n");
}

export function repDebtsText(repId: string, accounts: StarlinkAccountSummary[], ledgerStore: LedgerByAccount, clients: ClientStore): string {
  const debt = repDevicesDebt(repId, accounts, ledgerStore);
  if (debt.rows.length === 0) return "✓ لا ديون على زبائن أجهزتك";
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const lines = [`💰 ديون زبائن أجهزتك: ${money(debt.totalByCurrency)}`, ""];
  for (const row of debt.rows.slice(0, MAX_LINES)) {
    const account = byId.get(row.accountId);
    lines.push(`• ${account ? repLabel(account, clients) : "جهاز"}: ${money(row.owed)}`);
  }
  return lines.join("\n");
}

export interface RepMoney {
  /** His share of the month's confirmed profit (أوقية). */
  monthShare: Record<string, number>;
  /** His running balance with us since his last reset: positive = we owe him. */
  balance: Record<string, number>;
}

/** Same figures as his card on the reps page, in أوقية (each shipment at its own locked rate). */
export function repMoney(input: {
  rep: Representative;
  month: string;
  ledgerStore: LedgerByAccount;
  invoices: Invoice[];
  settlements: RepSettlementList;
  rates: Record<string, number | undefined>;
}): RepMoney {
  const convert = makeRepConverter(["MRU"], input.rates);
  const active = splitRepRecords(
    input.rep,
    { deviceRows: listRepDeviceCommissions(input.rep.id, input.ledgerStore), invoices: input.invoices, settlements: input.settlements },
    "active",
  );
  const days = buildRepDailyStatement(input.rep.id, active.deviceRows, active.invoices, active.settlements);
  return {
    monthShare: buildRepPeriodStatement(days, monthRange(input.month), convert).totals.repShare,
    balance: buildRepPeriodStatement(days, {}, convert).closing,
  };
}

export function repStatementText(repName: string, month: string, figures: RepMoney): string {
  const share = money(figures.monthShare);
  const balanceValue = Object.values(figures.balance).find((v) => Math.abs(v) > 0.005) ?? 0;
  const balance = money(Object.fromEntries(Object.entries(figures.balance).map(([c, v]) => [c, Math.abs(v)])));
  return [
    `📊 كشف حسابك يا ${repName}`,
    `حصتك لشهر ${monthLabel(month)}: ${share || "0"}`,
    balanceValue > 0.005 ? `الرصيد الآن: مستحق لك ${balance}` : balanceValue < -0.005 ? `الرصيد الآن: عليك ${balance}` : "الرصيد الآن: متعادل ✓",
  ].join("\n");
}

// ---- Commands a rep can send ----

export type RepCommand = { kind: "help" } | { kind: "devices" } | { kind: "expiring" } | { kind: "statement" } | { kind: "debts" } | { kind: "unknown" };

const REP_WORDS: Record<string, Exclude<RepCommand["kind"], "unknown">> = {
  start: "help",
  help: "help",
  "مساعدة": "help",
  "ابدأ": "help",
  "أجهزتي": "devices",
  "اجهزتي": "devices",
  devices: "devices",
  "تنتهي": "expiring",
  "التجديدات": "expiring",
  expiring: "expiring",
  "كشفي": "statement",
  "حصتي": "statement",
  statement: "statement",
  "ديون": "debts",
  "ديوني": "debts",
  debts: "debts",
};

export function parseRepCommand(text: string): RepCommand {
  const cleaned = text.trim().replace(/^\//, "").replace(/@\w+/, "").trim();
  const words = cleaned.split(/\s+/);
  const first = (words[0] ?? "").toLowerCase();
  if (first === "ديون") return { kind: "debts" }; // "ديون زبائني"
  return REP_WORDS[first] ? { kind: REP_WORDS[first] } : { kind: "unknown" };
}

export const REP_HELP = [
  "🤝 أوامر المندوب:",
  "• أجهزتي - كل أجهزتك وتواريخ تجديدها",
  "• تنتهي - أجهزتك التي تنتهي خلال 7 أيام",
  "• كشفي - حصتك هذا الشهر ورصيدك",
  "• ديون زبائني - ما على زبائن أجهزتك",
  "(الرد يصل عندما يكون تطبيق المسؤول مفتوحاً)",
].join("\n");

export function repLinkRequestReply(name: string): string {
  return `👋 أهلاً ${name || ""}\nوصل طلبك إلى STAR NET. بعد أن يربطك المسؤول بحسابك كمندوب ستصلك هنا أجهزتك وتجديداتها ودفعات زبائنك.`;
}

export function repWelcomeText(repName: string): string {
  return `✅ تم ربطك كمندوب: ${repName}\n\n${REP_HELP}`;
}
