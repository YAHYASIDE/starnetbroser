/**
 * The reps bot's device card: a search shows a short header and a menu of small buttons (📶 the
 * network, 📅 renewal, 🛰️ plan, 💰 debt, 🔢 KIT/SN, 👤 info, ✏️ edit, 📊 statement, 📝 note). The
 * app prepares every section's text here; TelegramReplyService answers the taps from them (its
 * menu/edit buttons mirror menuMarkup/editMarkup below - TelegramReplies.java). 📶 is never
 * prepared: the service refreshes the device from Starlink first and shows only a fresh reading.
 * Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client } from "./clientStore";
import { countryFlag, countryFromIso2 } from "./countryCurrencies";
import { computeBalanceByCurrency, type LedgerEntry } from "./ledgerStore";
import { priorityDataState } from "./priorityData";
import { cleanPlanName, effectiveServiceStatus, isSisPlan, planBadgeLabel } from "./status";
import { daysUntilRenewal, money } from "./telegramMessages";
import { buildAccountStatementMessage } from "./whatsapp";
import { moneyDeepLink } from "./repBots";

/** One-letter codes, kept short so every callback fits Telegram's 64 bytes. */
export const REP_SECTION_CODES = ["r", "p", "d", "i", "f", "s"] as const;
export type RepSectionCode = (typeof REP_SECTION_CODES)[number];

/** What a rep may change on a device (each change waits for the operator's approval). */
export const REP_EDIT_FIELDS = {
  n: "🏷️ اسم الجهاز",
  c: "👤 اسم الزبون",
  t: "📞 هاتف الزبون",
  e: "📧 الإيميل",
  p: "🔑 كود الإيميل",
  w: "📶 كود الواي فاي",
  k: "🔢 رقم KIT",
} as const;
export type RepEditField = keyof typeof REP_EDIT_FIELDS;

export function isRepEditField(code: string): code is RepEditField {
  return Object.prototype.hasOwnProperty.call(REP_EDIT_FIELDS, code);
}

/** "🏷️ اسم الجهاز" -> "اسم الجهاز". */
export function editFieldName(field: RepEditField): string {
  return REP_EDIT_FIELDS[field].replace(/^\S+\s/, "");
}

const MAX_CALLBACK_BYTES = 64;

function fits(data: string): boolean {
  return new TextEncoder().encode(data).length <= MAX_CALLBACK_BYTES;
}

/** Every callback of the menu fits - otherwise the device keeps the old card (no menu). */
export function menuFits(accountId: string): boolean {
  return accountId !== "" && fits(`ef:w:${accountId}`);
}

type Button = { text: string; callback_data: string } | { text: string; url: string };

/** The device's menu - mirrors TelegramReplies.menuMarkup (Java). */
/** `moneyBot`: once the 💰 money bot is connected, 💰 الدين / 📊 كشف leave the devices bot's
 * menu for one "💰 المال" button that opens the money bot on this device. */
export function menuMarkup(accountId: string, whatsappUrl?: string, moneyBot?: string): string {
  const cb = (text: string, data: string): Button => ({ text, callback_data: data });
  const moneyLink = moneyDeepLink(moneyBot, accountId);
  const rows: Button[][] = moneyBot
    ? [
        [cb("📶 الشبكة", `v:n:${accountId}`), cb("📅 التجديد", `v:r:${accountId}`), cb("🛰️ الاشتراك", `v:p:${accountId}`)],
        [cb("🔢 KIT/SN", `v:i:${accountId}`), cb("👤 المعلومات", `v:f:${accountId}`), cb("📝 ملاحظة", `nt:${accountId}`)],
        [cb("✏️ تعديل", `e:${accountId}`), ...(moneyLink ? [{ text: "💰 المال", url: moneyLink }] : [])],
      ]
    : [
        [cb("📶 الشبكة", `v:n:${accountId}`), cb("📅 التجديد", `v:r:${accountId}`), cb("🛰️ الاشتراك", `v:p:${accountId}`)],
        [cb("💰 الدين", `v:d:${accountId}`), cb("🔢 KIT/SN", `v:i:${accountId}`), cb("👤 المعلومات", `v:f:${accountId}`)],
        [cb("✏️ تعديل", `e:${accountId}`), cb("📊 كشف", `v:s:${accountId}`), cb("📝 ملاحظة", `nt:${accountId}`)],
      ];
  const last: Button[] = [];
  if (whatsappUrl) last.push({ text: "💬 واتساب", url: whatsappUrl });
  if (fits(`a:${accountId}`)) last.push(cb("⚡ تفعيل", `a:${accountId}`));
  if (last.length > 0) rows.push(last);
  return JSON.stringify({ inline_keyboard: rows });
}

/** ✏️: which field to change, two per row, then ↩️ back - mirrors TelegramReplies.editMarkup. */
export function editMarkup(accountId: string): string {
  const buttons = (Object.keys(REP_EDIT_FIELDS) as RepEditField[]).map((f) => ({ text: REP_EDIT_FIELDS[f], callback_data: `ef:${f}:${accountId}` }));
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: "↩️ رجوع", callback_data: `v:h:${accountId}` }]);
  return JSON.stringify({ inline_keyboard: rows });
}

/** Several results: one button per device, opening its menu. */
export function pickDeviceMarkup(devices: { id: string; name: string }[]): string | undefined {
  const rows = devices.filter((d) => menuFits(d.id)).map((d) => [{ text: `📡 ${d.name}`.slice(0, 40), callback_data: `m:${d.id}` }]);
  return rows.length > 0 ? JSON.stringify({ inline_keyboard: rows }) : undefined;
}

export const MENU_HINT = "اختر ما تريد معرفته 👇";

/** The D mark, never its amount (a rep never sees the Starlink cost). */
export const D_MARK_LINE = "🅳 علامة D: لم ندفع لـ Starlink بعد على هذا الجهاز";

/** `hasD`: the device still owes Starlink (an open D) - shown on every card and alert. */
export function deviceHeader(account: StarlinkAccountSummary, client: Client | undefined, tappable: (phone: string) => string, hasD = false): string {
  return [
    `📡 ${account.name}`,
    client ? `👤 ${client.name}${client.phone ? ` (${tappable(client.phone)})` : ""}` : "👤 —",
    ...(hasD ? [D_MARK_LINE] : []),
  ].join("\n");
}

/** The current value of each editable field (shown in the question and to the operator). */
export function repEditValues(account: StarlinkAccountSummary, client: Client | undefined): Record<RepEditField, string> {
  return {
    n: account.name ?? "",
    c: client?.name ?? "",
    t: client?.phone ?? "",
    e: account.expectedEmail ?? "",
    p: account.expectedEmailPassword ?? "",
    w: account.wifiPassword ?? "",
    k: account.kitNumber ?? "",
  };
}

function statusWord(account: StarlinkAccountSummary): string {
  const status = effectiveServiceStatus(account);
  if (status === "active") return isSisPlan(account.planName) ? "✅ نشط (SIS)" : "✅ نشط";
  if (status === "suspended") return "⛔ موقوف";
  if (status === "canceled") return "⛔ ملغى";
  if (status === "standby") return "⏸️ بانتظار التفعيل";
  return "—";
}

function balanceLines(balances: Record<string, number>): string[] {
  const owed = Object.fromEntries(Object.entries(balances).filter(([, v]) => v > 0.005));
  const credit = Object.fromEntries(Object.entries(balances).filter(([, v]) => v < -0.005).map(([c, v]) => [c, -v]));
  const lines: string[] = [];
  if (Object.keys(owed).length > 0) lines.push(`🔴 عليه: ${money(owed)}`);
  if (Object.keys(credit).length > 0) lines.push(`🟢 له: ${money(credit)}`);
  return lines.length > 0 ? lines : ["✓ لا دين عليه ولا له"];
}

const MAX_STATEMENT_CHARS = 3000;

export interface DeviceSectionsInput {
  account: StarlinkAccountSummary;
  client: Client | undefined;
  entries: LedgerEntry[];
  /** The rep's other devices of the same customer, with their entries (for the customer's total). */
  siblings: { account: StarlinkAccountSummary; entries: LedgerEntry[] }[];
  today: string;
  tappable: (phone: string) => string;
}

/** The text of each menu button (📶 excepted). */
export function deviceSections(input: DeviceSectionsInput): Record<RepSectionCode, string> {
  const { account, client, entries, siblings, today, tappable } = input;
  const days = daysUntilRenewal(account, today);

  const renewal = [
    "📅 التجديد",
    `التاريخ: ${account.rechargeDate || "—"}`,
    ...(days === null ? [] : [days < 0 ? `انتهى منذ ${-days} يوم` : days === 0 ? "ينتهي اليوم" : `بعد ${days} يوم`]),
  ].join("\n");

  const plan = cleanPlanName(account.planName);
  const badge = planBadgeLabel(plan);
  const priority = priorityDataState(account);
  const country = countryFromIso2(account.serviceCountry);
  const subscription = [
    "🛰️ الاشتراك الحالي",
    `الباقة: ${plan ? (badge && badge !== plan ? `${badge} - ${plan}` : plan) : "—"}`,
    `الحالة: ${statusWord(account)}`,
    ...(account.dataUsageGb ? [`الاستهلاك: ${account.dataUsageGb} GB${priority?.limitGb !== undefined ? ` من ${priority.limitGb}` : ""}`] : []),
    ...(priority?.kind === "exhausted" ? ["⚠️ نفدت باقة الأولوية - يعمل بسرعة محدودة حتى الدورة القادمة"] : priority?.kind === "near" ? ["⚠️ قاربت باقة الأولوية على النفاد"] : []),
    ...(country ? [`الدولة: ${countryFlag(account.serviceCountry)} ${country.country}`] : []),
    ...(account.oceanMode ? ["🚨 وضع المحيط مفعّل!"] : []),
  ].join("\n");

  const deviceBalances = computeBalanceByCurrency(entries);
  const customerLines: string[] = [];
  if (siblings.length > 0 && client) {
    const total: Record<string, number> = { ...deviceBalances };
    for (const sibling of siblings) {
      for (const [code, value] of Object.entries(computeBalanceByCurrency(sibling.entries))) total[code] = (total[code] ?? 0) + value;
    }
    customerLines.push("", `👤 كل أجهزة ${client.name} (${siblings.length + 1}):`, ...balanceLines(total));
  }
  const debt = ["💰 الدين", ...balanceLines(deviceBalances), ...customerLines].join("\n");

  const ids = [
    "🔢 أرقام الجهاز",
    `KIT: ${account.kitNumber || "—"}`,
    `SN: ${account.serialNumber || "—"}`,
    `الاشتراك: ${account.subscriptionId || "—"}`,
    ...(account.accountNumber ? [`الحساب: ${account.accountNumber}`] : []),
  ].join("\n");

  const phones = [...new Set([client?.phone, account.phone].filter((p): p is string => Boolean(p?.trim())))];
  const info = [
    "👤 معلومات الجهاز",
    `🏷️ الاسم: ${account.name}`,
    `👤 الزبون: ${client?.name ?? "—"}`,
    `📞 الهاتف: ${phones.length > 0 ? phones.map(tappable).join(" · ") : "—"}`,
    `📧 الإيميل: ${account.expectedEmail || "—"}`,
    `🔑 كود الإيميل: ${account.expectedEmailPassword || "—"}`,
    ...(account.starlinkAccountEmail && account.starlinkAccountEmail.toLowerCase() !== (account.expectedEmail ?? "").toLowerCase()
      ? [`📧 إيميل Starlink: ${account.starlinkAccountEmail}`]
      : []),
    ...(account.extraEmails ?? []).filter((e) => e.address.trim()).map((e) => `📧 ${e.address}${e.password ? ` · 🔑 ${e.password}` : ""}`),
    `📶 كود الواي فاي: ${account.wifiPassword || "—"}`,
    ...(account.starlinkAccountHolderName ? [`🪪 الاسم في Starlink: ${account.starlinkAccountHolderName}`] : []),
    ...(account.alertReason?.trim() ? [`📝 ملاحظة: ${account.alertReason.trim()}`] : []),
  ].join("\n");

  let statement = buildAccountStatementMessage(account.name, entries).replace(/\n*- STAR NET\s*$/, "");
  if (statement.length > MAX_STATEMENT_CHARS) statement = `${statement.slice(0, MAX_STATEMENT_CHARS)}\n…`;

  return { r: renewal, p: subscription, d: debt, i: ids, f: info, s: [`📊 ${statement}`, ...customerLines].join("\n") };
}

// ---- Applying an approved edit / a note (the app side) ----

export interface RepEditPatch {
  account?: Partial<StarlinkAccountSummary>;
  client?: { name?: string; phone?: string };
}

/** What an approved change writes: device fields on the device, name/phone on its customer. */
export function repEditPatch(field: RepEditField, value: string): RepEditPatch {
  const v = value.trim();
  switch (field) {
    case "n":
      return { account: { name: v } };
    case "e":
      return { account: { expectedEmail: v } };
    case "p":
      return { account: { expectedEmailPassword: v } };
    case "w":
      return { account: { wifiPassword: v } };
    case "k":
      return { account: { kitNumber: v } };
    case "c":
      return { client: { name: v } };
    case "t":
      return { client: { phone: v } };
  }
}

/** The device note with the rep's note added on its own line: "📝 سالم 29/09: ...". */
export function appendRepNote(existing: string | undefined, repName: string, text: string, now: Date): string {
  const day = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const line = `📝 ${repName || "المندوب"} ${day}: ${text.trim()}`;
  return existing?.trim() ? `${existing.trim()}\n${line}` : line;
}

