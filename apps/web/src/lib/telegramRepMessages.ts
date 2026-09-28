/**
 * The representatives' Telegram bot: what a rep is told about HIS devices only, and the commands
 * he can send. A rep sees his share, his balance with us and what his customers owe - never the
 * Starlink cost, the full profit, the till, suppliers or other reps. Pure (the sending and the
 * command loop are in telegram.ts / telegramCommands.ts).
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { Invoice } from "./invoiceStore";
import { computeBalanceByCurrency, type LedgerByAccount } from "./ledgerStore";
import { monthLabel, monthRange } from "./monthClosing";
import { buildRepPeriodStatement, makeRepConverter, splitRepRecords } from "./repAccount";
import { repDevicesDebt } from "./repDebts";
import { buildRepDailyStatement, listRepDeviceCommissions, type Representative, type RepSettlementList } from "./repStore";
import { daysUntilRenewal, isStoppedAccount, money, renewalGroups } from "./telegramMessages";
import { buildWhatsAppLink, normalizePhoneForWhatsApp } from "./whatsapp";

const MAX_LINES = 60;

/** The rep's own live devices. */
export function repAccounts(accounts: StarlinkAccountSummary[], repId: string): StarlinkAccountSummary[] {
  return accounts.filter((a) => a.representativeId === repId && !a.archivedAt && !a.deletedAt);
}

/** "+22212345678" - Telegram turns an international number into a tap-to-call link. */
export function tappablePhone(phone: string): string {
  const digits = normalizePhoneForWhatsApp(phone);
  return digits && digits.length > 8 ? `+${digits}` : phone;
}

/** Device - client (phone): what a rep needs to call the customer. */
function repLabel(account: StarlinkAccountSummary, clients: ClientStore): string {
  const client = account.clientId ? clients[account.clientId] : undefined;
  if (!client) return account.name;
  return client.phone ? `${account.name} - ${client.name} (${tappablePhone(client.phone)})` : `${account.name} - ${client.name}`;
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

export type RepCommand =
  | { kind: "help" }
  | { kind: "devices" }
  | { kind: "expiring" }
  | { kind: "stopped" }
  | { kind: "days" }
  | { kind: "statement" }
  | { kind: "debts" }
  | { kind: "search"; query: string }
  | { kind: "unknown"; text: string };

type RepWordKind = Exclude<RepCommand["kind"], "unknown" | "search"> | "search";

/** Command words as a rep may type them (spelling variants fold together, see repWordKind). */
const REP_WORD_LIST: Record<string, RepWordKind> = {
  start: "help",
  "الأوامر": "help",
  "اوامر": "help",
  "أجهزة": "devices",
  "الأجهزة": "devices",
  "جهازي": "devices",
  "توقف": "stopped",
  "متوقف": "stopped",
  "موقوف": "stopped",
  "تنتهى": "expiring",
  "ينتهي": "expiring",
  "تجديد": "expiring",
  "حسابي": "statement",
  "رصيدي": "statement",
  "الديون": "debts",
  "زبائني": "debts",
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
  "الموقوفة": "stopped",
  "موقوفة": "stopped",
  "المتوقفة": "stopped",
  "متوقفة": "stopped",
  stopped: "stopped",
  "الأيام": "days",
  "أيام": "days",
  "الايام": "days",
  days: "days",
  "بحث": "search",
  "ابحث": "search",
  search: "search",
};

/** Keyed by the folded word, so "اجهزتي" = "أجهزتي", "الاجهزة" = "الأجهزة"... */
export const REP_WORDS: Record<string, RepWordKind> = Object.fromEntries(
  Object.entries(REP_WORD_LIST).map(([word, kind]) => [normalizeSearch(word), kind]),
);

/** The text without "/", a leading emoji (keyboard buttons send "📡 أجهزتي") or the bot's @name.
 * Mirrors TelegramReplies.commandWord (Java). */
export function cleanRepText(text: string): string {
  let cleaned = text.trim();
  // Only the bot's @name glued to a "/command" - never the "@gmail" of an email being searched.
  if (cleaned.startsWith("/")) cleaned = cleaned.slice(1).replace(/^(\S+?)@\w+/, "$1");
  return cleaned.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

export function parseRepCommand(text: string): RepCommand {
  const cleaned = cleanRepText(text);
  const [firstWord = "", ...rest] = cleaned.split(/\s+/);
  const kind = REP_WORDS[normalizeSearch(firstWord)];
  if (kind === "search") return { kind: "search", query: rest.join(" ").trim() };
  if (kind) return { kind } as RepCommand;
  // Anything else is a search among his devices ("محمد", "22212345").
  return { kind: "unknown", text: cleaned };
}

export const REP_HELP = [
  "🤝 استعمل الأزرار أسفل المحادثة:",
  "📡 أجهزتي - كل أجهزتك وتواريخ تجديدها",
  "📅 تنتهي - أجهزتك التي تنتهي خلال 7 أيام",
  "⛔ الموقوفة - أجهزتك المتوقفة الآن",
  "💰 ديون زبائني - ما على زبائن أجهزتك",
  "📊 كشفي - حصتك هذا الشهر ورصيدك",
  "📆 الأيام - تجديدات الأيام القادمة يوماً بيوم",
  "🔎 بحث - أو اكتب مباشرة جزءاً من اسم زبون أو جهاز أو إيميل، أو رقم هاتف أو KIT",
  "📆 أو اكتب يوماً: اليوم، غداً، بعد غد، يوم 30، 30/09",
  "💬 تحت القوائم أزرار واتساب ترسل للزبون رسالة جاهزة",
].join("\n");

/** The buttons that stay at the bottom of the rep's chat instead of the keyboard. */
export const REP_KEYBOARD = JSON.stringify({
  keyboard: [
    [{ text: "📡 أجهزتي" }, { text: "📅 تنتهي" }],
    [{ text: "⛔ الموقوفة" }, { text: "💰 ديون زبائني" }],
    [{ text: "📊 كشفي" }, { text: "📆 الأيام" }],
    [{ text: "🔎 بحث" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "اسم زبون أو جهاز أو رقم للبحث",
});

export function repLinkRequestReply(name: string): string {
  return `👋 أهلاً ${name || ""}\nوصل طلبك إلى STAR NET. بعد أن يربطك المسؤول بحسابك كمندوب ستصلك هنا أجهزتك وتجديداتها ودفعات زبائنك.`;
}

export function repWelcomeText(repName: string): string {
  return `✅ تم ربطك كمندوب: ${repName}\n\n${REP_HELP}`;
}

// ---- Shortcuts: WhatsApp buttons, stopped list, search ----

/** A reply and its buttons (Telegram reply_markup JSON; none = the rep keyboard). */
export interface RepReply {
  text: string;
  markup?: string;
}

const MAX_BUTTONS = 10;

interface WhatsAppTarget {
  label: string;
  url: string;
}

function whatsappTarget(account: StarlinkAccountSummary, clients: ClientStore, message: (clientName: string) => string): WhatsAppTarget | null {
  const client = account.clientId ? clients[account.clientId] : undefined;
  if (!client?.phone) return null;
  const url = buildWhatsAppLink(client.phone, message(client.name));
  return url ? { label: `💬 ${client.name} - ${account.name}`.slice(0, 60), url } : null;
}

/** Inline buttons opening WhatsApp with a ready message, one per customer (max 10). */
export function whatsappMarkup(targets: (WhatsAppTarget | null)[]): string | undefined {
  const seen = new Set<string>();
  const rows: { text: string; url: string }[][] = [];
  for (const target of targets) {
    if (!target || seen.has(target.url) || rows.length >= MAX_BUTTONS) continue;
    seen.add(target.url);
    rows.push([{ text: target.label, url: target.url }]);
  }
  return rows.length > 0 ? JSON.stringify({ inline_keyboard: rows }) : undefined;
}

export function renewalReminderText(clientName: string, deviceName: string, date: string): string {
  return `مرحبًا ${clientName}، نذكّرك بأن اشتراك Starlink لجهازك (${deviceName}) ينتهي يوم ${date}. يرجى التجديد لتفادي انقطاع الخدمة.\n\n- STAR NET`;
}

export function stoppedReminderText(clientName: string, deviceName: string): string {
  return `مرحبًا ${clientName}، اشتراك Starlink لجهازك (${deviceName}) متوقف حاليًا. تواصل معنا للتجديد وإعادة الخدمة.\n\n- STAR NET`;
}

export function debtReminderText(clientName: string, deviceName: string, owed: string): string {
  return `مرحبًا ${clientName}، نذكّرك بالمبلغ المتبقي عليك لجهاز (${deviceName}): ${owed}.\n\n- STAR NET`;
}

/** Renewals of the week, most urgent first - the order of the WhatsApp buttons. */
function renewalsByUrgency(accounts: StarlinkAccountSummary[], today: string): StarlinkAccountSummary[] {
  const g = renewalGroups(accounts, today);
  return [...g.expired, ...g.today, ...g.tomorrow, ...g.in3, ...g.in7];
}

export function repExpiringReply(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): RepReply {
  return {
    text: repExpiringText(accounts, clients, today),
    markup: whatsappMarkup(renewalsByUrgency(accounts, today).map((a) => whatsappTarget(a, clients, (name) => renewalReminderText(name, a.name, a.rechargeDate)))),
  };
}

/** The morning message's buttons (the text is repMorningText). */
export function repMorningMarkup(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): string | undefined {
  return repExpiringReply(accounts, clients, today).markup;
}

export function repStoppedReply(accounts: StarlinkAccountSummary[], clients: ClientStore): RepReply {
  const stopped = accounts.filter(isStoppedAccount);
  if (stopped.length === 0) return { text: "✓ لا أجهزة موقوفة لك حسب آخر مزامنة" };
  return {
    text: ["⛔ أجهزتك الموقوفة حسب آخر مزامنة", ...section("الموقوفة", stopped, clients).slice(1), "", "تواصل مع الزبائن لإعادة الخدمة 🙏"].join("\n"),
    markup: whatsappMarkup(stopped.map((a) => whatsappTarget(a, clients, (name) => stoppedReminderText(name, a.name)))),
  };
}

export function repDebtsReply(repId: string, accounts: StarlinkAccountSummary[], ledgerStore: LedgerByAccount, clients: ClientStore): RepReply {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows = repDevicesDebt(repId, accounts, ledgerStore).rows;
  return {
    text: repDebtsText(repId, accounts, ledgerStore, clients),
    markup: whatsappMarkup(
      rows.map((row) => {
        const account = byId.get(row.accountId);
        return account ? whatsappTarget(account, clients, (name) => debtReminderText(name, account.name, money(row.owed))) : null;
      }),
    ),
  };
}

/** Same folding as TelegramReplies.normalize (Java) - keys are stored folded, queries folded alike. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, " ")
    .trim();
}

/** One device as the search index holds it (also sent to the closed-app service). */
export interface RepSearchEntry {
  /** Folded device / client name, phone digits, kit and serial numbers. */
  k: string;
  /** The result card. */
  t: string;
  /** WhatsApp button (label, url), when the client has a phone. */
  l?: string;
  w?: string;
  /** Renewal date "yyyy-mm-dd", for search by day. */
  d?: string;
  /** One line "• device - client (phone)" for a day's list. */
  s?: string;
  /** WhatsApp renewal reminder url for a day's list. */
  r?: string;
}

function statusLabel(account: StarlinkAccountSummary): string {
  if (isStoppedAccount(account)) return "⛔ موقوف";
  if (account.serviceStatus === "active") return "✅ نشط";
  return "—";
}

export function repSearchIndex(accounts: StarlinkAccountSummary[], clients: ClientStore, ledgerStore: LedgerByAccount, today: string): RepSearchEntry[] {
  return accounts.map((account) => {
    const client = account.clientId ? clients[account.clientId] : undefined;
    const phoneDigits = client?.phone ? client.phone.replace(/[^\d]/g, "") : "";
    const days = daysUntilRenewal(account, today);
    const owed = money(Object.fromEntries(Object.entries(computeBalanceByCurrency(ledgerStore[account.id] ?? [])).filter(([, v]) => v > 0.005)));
    const lines = [
      `📡 ${account.name}`,
      client ? `👤 ${client.name}${client.phone ? ` (${tappablePhone(client.phone)})` : ""}` : "👤 —",
      `📅 التجديد: ${account.rechargeDate || "—"}${days === null ? "" : days < 0 ? ` (انتهى منذ ${-days} يوم)` : ` (بعد ${days} يوم)`}`,
      `الحالة: ${statusLabel(account)}`,
      owed ? `💰 عليه: ${owed}` : "💰 لا دين عليه",
      ...(account.kitNumber || account.serialNumber
        ? [`🔢 ${[account.kitNumber && `KIT: ${account.kitNumber}`, account.serialNumber && `SN: ${account.serialNumber}`].filter(Boolean).join(" · ")}`]
        : []),
      ...(account.accountNumber || account.subscriptionId
        ? [`🧾 ${[account.accountNumber, account.subscriptionId].filter(Boolean).join(" · ")}`]
        : []),
    ];
    const identifiers = [
      phoneDigits,
      account.kitNumber,
      account.serialNumber,
      account.accountNumber ?? "",
      account.subscriptionId ?? "",
      account.starlinkId ?? "",
    ];
    const target = whatsappTarget(account, clients, (name) => `مرحبًا ${name}،\n\n- STAR NET`);
    const renewal = isoDate(account.rechargeDate);
    const reminder = renewal ? whatsappTarget(account, clients, (name) => renewalReminderText(name, account.name, account.rechargeDate)) : null;
    return {
      ...(renewal ? { d: renewal } : {}),
      s: `• ${repLabel(account, clients)}${isStoppedAccount(account) ? " ⛔" : ""}`,
      ...(reminder ? { r: reminder.url } : {}),
      // Readable text for names/emails, plus every number compacted (no dashes or spaces) so
      // "KIT-000 111", "kit000111" and "000111" all find the same kit.
      k: normalizeSearch(
        [
          account.name,
          client?.name ?? "",
          account.expectedEmail ?? "",
          account.starlinkAccountEmail ?? "",
          ...identifiers,
          ...identifiers.map(compactSearch),
        ].join(" "),
      ),
      t: lines.join("\n"),
      ...(target ? { l: target.label, w: target.url } : {}),
    };
  });
}

export const REP_SEARCH_HINT = "🔎 اكتب جزءاً من اسم الزبون أو الجهاز أو الإيميل، أو رقم الهاتف أو KIT أو رقم الحساب - مثلاً: محمد أو 4521";

/** Folded, with everything but letters and digits removed ("KIT-000 111" -> "kit000111"). */
export function compactSearch(text: string): string {
  return normalizeSearch(text).replace(/[^\p{L}\p{N}]/gu, "");
}
const MAX_RESULTS = 5;

/** Every word of the query must appear in the device's keys; a day ("غداً", "يوم 30", "30/09")
 * lists that day's renewals instead. Mirrors TelegramReplies.search. */
export function repSearchReply(query: string, index: RepSearchEntry[], today?: string): RepReply {
  const day = today ? parseDayQuery(query, today) : null;
  if (day) return repDayReply(day, index);
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return { text: REP_SEARCH_HINT };
  // A word matches as typed, or compacted ("000-111" finds "000111").
  const found = index.filter((entry) =>
    words.every((word) => entry.k.includes(word) || (compactSearch(word) !== "" && entry.k.includes(compactSearch(word)))),
  );
  if (found.length === 0) return { text: `🔎 لم أجد «${query.slice(0, 40)}» بين أجهزتك` };
  const shown = found.slice(0, MAX_RESULTS);
  const text = [
    `🔎 نتائج «${query.slice(0, 40)}» (${found.length}):`,
    ...shown.map((entry) => `\n${entry.t}`),
    ...(found.length > MAX_RESULTS ? [`\n… و${found.length - MAX_RESULTS} أخرى - اكتب اسمًا أدق`] : []),
  ].join("\n");
  return { text, markup: whatsappMarkup(shown.map((entry) => (entry.w && entry.l ? { label: entry.l, url: entry.w } : null))) };
}

// ---- By day ----

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026/9/28" or "2026-09-28" -> "2026-09-28"; undefined when it isn't a full date. */
export function isoDate(date: string | undefined): string | undefined {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec((date ?? "").trim());
  return match ? `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}` : undefined;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** What a typed day asks for - mirrors TelegramReplies.parseDay. */
export type DayQuery = { kind: "date"; date: string; label: string } | { kind: "monthDay"; month: number; day: number; label: string } | { kind: "dayOfMonth"; day: number; label: string };

export function parseDayQuery(query: string, today: string): DayQuery | null {
  const text = normalizeSearch(query).replace(/[ًٌٍ]/g, "");
  const base = isoDate(today);
  if (!base) return null;
  const relative: Record<string, [number, string]> = {
    "اليوم": [0, "اليوم"],
    "غدا": [1, "غداً"],
    "بكره": [1, "غداً"],
    "بعد غد": [2, "بعد غد"],
    "بعد غدا": [2, "بعد غد"],
    "امس": [-1, "أمس"],
  };
  if (relative[text]) {
    const [offset, name] = relative[text]!;
    const date = addDays(base, offset);
    return { kind: "date", date, label: `${name} ${Number(date.slice(8))}/${pad2(Number(date.slice(5, 7)))}` };
  }
  let match = /^يوم (\d{1,2})$/.exec(text);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 31) return { kind: "dayOfMonth", day: Number(match[1]), label: `يوم ${Number(match[1])}` };
  match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (match) {
    const date = isoDate(text)!;
    return { kind: "date", date, label: `${Number(match[3])}/${pad2(Number(match[2]))}/${match[1]}` };
  }
  match = /^(\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 31 && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return { kind: "monthDay", day: Number(match[1]), month: Number(match[2]), label: `${Number(match[1])}/${pad2(Number(match[2]))}` };
  }
  return null;
}

function matchesDay(date: string | undefined, query: DayQuery): boolean {
  if (!date) return false;
  if (query.kind === "date") return date === query.date;
  const day = Number(date.slice(8));
  if (query.kind === "dayOfMonth") return day === query.day;
  return day === query.day && Number(date.slice(5, 7)) === query.month;
}

/** That day's renewals among his devices, soonest first, with WhatsApp reminder buttons. */
export function repDayReply(query: DayQuery, index: RepSearchEntry[]): RepReply {
  const found = index.filter((entry) => matchesDay(entry.d, query)).sort((a, b) => (a.d ?? "").localeCompare(b.d ?? ""));
  if (found.length === 0) return { text: `📆 لا تجديدات لأجهزتك ${query.label}` };
  return {
    text: [`📆 تجديدات ${query.label} (${found.length}):`, ...found.slice(0, 60).map((entry) => (query.kind === "date" ? entry.s : `${entry.s} - ${entry.d}`))].join("\n"),
    markup: whatsappMarkup(found.map((entry) => (entry.r && entry.l ? { label: entry.l, url: entry.r } : null))),
  };
}

/** 📆 الأيام: the next days (and the last 3 missed) one by one, with their renewals. */
export function repDaysReply(accounts: StarlinkAccountSummary[], clients: ClientStore, today: string): RepReply {
  const base = isoDate(today);
  if (!base) return { text: "📆 لا توجد تواريخ" };
  const lines: string[] = [];
  const reminders: (WhatsAppTarget | null)[] = [];
  for (let offset = -3; offset <= 10; offset++) {
    const date = addDays(base, offset);
    const due = accounts.filter((a) => !a.deviceFault && isoDate(a.rechargeDate) === date);
    if (due.length === 0) continue;
    const [y, m, d] = date.split("-").map(Number);
    const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
    const when = offset === 0 ? "اليوم" : offset === 1 ? "غداً" : offset < 0 ? `انتهى منذ ${-offset} يوم` : `بعد ${offset} يوم`;
    lines.push("", `📆 ${weekday} ${d}/${pad2(m!)} - ${when} (${due.length}):`, ...due.map((a) => `• ${repLabel(a, clients)}${isStoppedAccount(a) ? " ⛔" : ""}`));
    reminders.push(...due.map((a) => whatsappTarget(a, clients, (name) => renewalReminderText(name, a.name, a.rechargeDate))));
  }
  if (lines.length === 0) return { text: "✓ لا تجديدات لأجهزتك في الأيام العشرة القادمة" };
  return {
    text: ["📆 تجديدات أجهزتك يوماً بيوم", ...lines, "", "اكتب يوماً لتفاصيله: غداً، يوم 30، 30/09"].join("\n"),
    markup: whatsappMarkup(reminders),
  };
}
