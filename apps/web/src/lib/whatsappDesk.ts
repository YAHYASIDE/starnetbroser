/**
 * 💬 WhatsApp Business on his phone (his Nov 12 2026 ask: «أريد اقتران التطبيق مع الواتساب، لأن بعض الزبائن يرسلون لي
 * الإيميلات… أحتاج تثبيتها تلقائيًا… وأحتاج أن يسأل الزبون عن جهازه فيعطيه معلومات عنه هناك»). His choices: read from
 * the notifications on his phone (no server, no Meta account - the API later if needed), an email in a message
 * **creates a new device by itself**, and a customer asking about his device is **answered by itself**.
 * Guardrails: only customers whose number is registered get an answer, never a group, one answer per customer per
 * REPLY_GAP_MIN minutes (native side). Pure: the phone's native reader (WhatsAppReader.java) stores the messages, the
 * app turns them into devices and prepares each customer's answer.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client, ClientStore } from "./clientStore";
import { blankDevice } from "./saleDevices";
import { daysRemainingNumber } from "./date";
import { formatAmount } from "./formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import { foldArabic } from "./repPermissions";

/** One WhatsApp message kept by the phone's reader. */
export interface WhatsAppMessage {
  id: string;
  /** The sender's number as WhatsApp gives it (digits), when known. */
  phone?: string;
  /** The name the notification shows (his contact name, or the number). */
  name: string;
  text: string;
  /** ms */
  at: number;
}

/** The last 8 digits of a number - how a customer's number is matched whatever its +222 / 00222 / spaces. */
export function phoneKey(phone: string | undefined | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 ? digits.slice(-8) : null;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** The emails in a message, lower case, once each. */
export function emailsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(EMAIL_RE) ?? []) {
    const e = m.toLowerCase().replace(/[.]+$/, "");
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** The customer whose number this is (a live one). */
export function clientByPhone(clients: ClientStore, phone: string | undefined): Client | undefined {
  const key = phoneKey(phone);
  if (!key) return undefined;
  return Object.values(clients).find((c) => !(c as { deletedAt?: string | null }).deletedAt && phoneKey(c.phone) === key);
}

export interface WhatsAppDevicesResult {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  created: StarlinkAccountSummary[];
  newClients: Client[];
  /** A rep known by his name whose card has no number yet: his WhatsApp number, to save on him. */
  repNumbers: { repId: string; phone: string }[];
}

export interface WhatsAppRep {
  id?: string;
  name?: string;
  phone?: string;
}

/** A name as compared: folded Arabic, no «ال» before a word, single spaces. */
function nameKey(name: string | undefined): string {
  return foldArabic(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
    .join(" ");
}

/**
 * 🤝 The rep who sent this: his number on his card, else his name as the WhatsApp contact shows it («الحسين» = «حسين»,
 * or with «مندوب» beside it). His Nov 14 2026 report: الحسين's card had no number, so his message made a device and a
 * customer «الحسين».
 */
export function repSender(reps: WhatsAppRep[], phone: string | undefined, name: string | undefined): WhatsAppRep | undefined {
  const key = phoneKey(phone);
  if (key) {
    const byPhone = reps.find((r) => phoneKey(r.phone) === key);
    if (byPhone) return byPhone;
  }
  const who = nameKey(name);
  if (!who) return undefined;
  const plain = who.split(" ").filter((w) => w !== "مندوب" && w !== "المندوب").join(" ");
  return reps.find((r) => {
    const rep = nameKey(r.name);
    return !!rep && (rep === who || (plain !== who && rep === plain));
  });
}

/**
 * 📧 Every email that came in a message and is on no device yet → a new «غير مفعّل» device with it, on the
 * customer of that number (a new customer with the WhatsApp name and number when there is none).
 */
export function devicesFromWhatsApp(
  accounts: StarlinkAccountSummary[],
  clients: ClientStore,
  messages: WhatsAppMessage[],
  now: string,
  newId: () => string,
  /** The reps: their messages are not customers' (his Nov 13 / 14 2026 reports - a rep's email made a device). */
  reps: WhatsAppRep[] = [],
): WhatsAppDevicesResult {
  const known = new Set(
    accounts.filter((a) => !a.deletedAt).flatMap((a) => [a.expectedEmail, a.starlinkAccountEmail].map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e)),
  );
  let nextAccounts = accounts;
  const nextClients: ClientStore = { ...clients };
  const created: StarlinkAccountSummary[] = [];
  const newClients: Client[] = [];
  const repNumbers: { repId: string; phone: string }[] = [];
  for (const m of messages) {
    const rep = repSender(reps, m.phone, m.name);
    if (rep) {
      const phone = phoneKey(m.phone) ? m.phone! : undefined;
      if (phone && !phoneKey(rep.phone) && rep.id && !repNumbers.some((r) => r.repId === rep.id)) repNumbers.push({ repId: rep.id, phone });
      continue;
    }
    for (const email of emailsIn(m.text)) {
      if (known.has(email)) continue;
      known.add(email);
      let client = clientByPhone(nextClients, m.phone);
      if (!client && phoneKey(m.phone)) {
        const name = m.name.trim() && !/^\+?[\d\s-]+$/.test(m.name.trim()) ? m.name.trim() : m.phone!;
        client = { id: newId(), name, phone: m.phone!, createdAt: now, updatedAt: now } as Client;
        nextClients[client.id] = client;
        newClients.push(client);
      }
      const device: StarlinkAccountSummary = {
        ...blankDevice(newId(), now),
        name: client?.name || email,
        phone: client?.phone ?? m.phone ?? "",
        expectedEmail: email,
        ...(client ? { clientId: client.id } : {}),
        pendingActivation: { soldAt: now.slice(0, 10) },
        fromWhatsApp: now,
      };
      created.push(device);
      nextAccounts = [device, ...nextAccounts];
    }
  }
  return { accounts: nextAccounts, clients: nextClients, created, newClients, repNumbers };
}

function statusWords(a: StarlinkAccountSummary): string {
  if (a.pendingActivation) return "⏳ لم يُفعَّل بعد";
  if (a.serviceStatus === "suspended") return "⛔ موقوف";
  if (a.serviceStatus === "canceled") return "⛔ ملغى";
  if (a.serviceStatus === "standby") return "⏸️ في وضع الانتظار";
  if (a.isRestricted) return "⚠️ مقيَّد";
  return "✅ يعمل";
}

function renewalWords(date: string | undefined): string {
  const days = date ? daysRemainingNumber(date) : null;
  if (days === null) return "";
  const day = date!.replace(/-/g, "/");
  if (days <= 0) return `انتهى اشتراكه يوم ${day}`;
  if (days === 1) return `ينتهي اشتراكه الليلة (${day})`;
  return `ينتهي اشتراكه يوم ${day} (بعد ${days - 1} يوم)`;
}

/** 💬 The answer a customer gets: each of his devices (status, renewal) and what he owes. */
export function customerAnswer(client: Pick<Client, "name">, devices: StarlinkAccountSummary[], owed: Record<string, number>): string {
  const lines = [`مرحبًا ${client.name} 👋`];
  if (devices.length === 0) lines.push("لا يوجد جهاز مسجّل باسمك عندنا بعد.");
  for (const d of devices) {
    const renewal = renewalWords(d.rechargeDate);
    lines.push(`🛰️ ${d.name}: ${statusWords(d)}${renewal ? ` · ${renewal}` : ""}`);
  }
  const debts = Object.entries(owed).filter(([, v]) => v > 0.005);
  lines.push(debts.length ? `💰 عليك: ${debts.map(([c, v]) => `${formatAmount(v)} ${LEDGER_CURRENCY_LABELS[c as LedgerCurrency] ?? c}`).join(" + ")}` : "💰 لا شيء عليك ✓");
  lines.push("", "— رد آلي من STAR NET");
  return lines.join("\n");
}

/** 📲 Each registered customer's answer, by the last 8 digits of his number (what the phone's reader looks up). */
export function whatsappAnswers(
  clients: ClientStore,
  accounts: StarlinkAccountSummary[],
  owedOf: (clientId: string, devices: StarlinkAccountSummary[]) => Record<string, number>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const client of Object.values(clients)) {
    if ((client as { deletedAt?: string | null }).deletedAt) continue;
    const key = phoneKey(client.phone);
    if (!key) continue;
    const devices = accounts.filter((a) => a.clientId === client.id && !a.deletedAt && !a.archivedAt);
    out[key] = customerAnswer(client, devices, owedOf(client.id, devices));
  }
  return out;
}

/** The day WhatsApp devices began (one made before the mark existed: «غير مفعّل», no sale invoice, added since). */
const WHATSAPP_SINCE = "2026-11-12";

function madeFromWhatsApp(a: StarlinkAccountSummary): boolean {
  if (a.fromWhatsApp) return true;
  return Boolean(a.pendingActivation) && !a.storeInvoiceId && (a.addedAt ?? "") >= WHATSAPP_SINCE;
}

/**
 * 🗑️ A device made from a WhatsApp email whose email is now on another device (added by hand, by him or a rep - his
 * Nov 13 2026 report: two such twins) goes to the trash (restorable); the hand-added one stays.
 */
export function trashWhatsAppTwins(accounts: StarlinkAccountSummary[], now: string): { accounts: StarlinkAccountSummary[]; trashed: StarlinkAccountSummary[] } {
  const emailOf = (a: StarlinkAccountSummary) => [a.expectedEmail, a.starlinkAccountEmail].map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e);
  const live = accounts.filter((a) => !a.deletedAt);
  const handEmails = new Set(live.filter((a) => !madeFromWhatsApp(a)).flatMap(emailOf));
  const trashed: StarlinkAccountSummary[] = [];
  const next = accounts.map((a) => {
    if (a.deletedAt || !a.pendingActivation || !madeFromWhatsApp(a)) return a;
    if (!emailOf(a).some((e) => handEmails.has(e))) return a;
    const out = { ...a, deletedAt: now };
    trashed.push(out);
    return out;
  });
  return { accounts: trashed.length ? next : accounts, trashed };
}

/**
 * 🗑️ A WhatsApp device made from a rep's message (before his number or name was known) goes to the trash, and the
 * customer made with it at the same moment is removed when no other device is his (his Nov 14 2026 report).
 */
export function trashRepWhatsAppDevices(
  accounts: StarlinkAccountSummary[],
  clients: ClientStore,
  reps: WhatsAppRep[],
  now: string,
): { accounts: StarlinkAccountSummary[]; clients: ClientStore; trashed: StarlinkAccountSummary[]; removedClients: Client[] } {
  const trashed: StarlinkAccountSummary[] = [];
  const next = accounts.map((a) => {
    if (a.deletedAt || !a.pendingActivation || !a.fromWhatsApp) return a;
    const client = a.clientId ? clients[a.clientId] : undefined;
    const fromRep = client ? repSender(reps, client.phone, client.name) : repSender(reps, a.phone, a.name);
    if (!fromRep) return a;
    const out = { ...a, deletedAt: now };
    trashed.push(out);
    return out;
  });
  if (!trashed.length) return { accounts, clients, trashed, removedClients: [] };
  const nextClients: ClientStore = { ...clients };
  const removedClients: Client[] = [];
  for (const d of trashed) {
    const client = d.clientId ? nextClients[d.clientId] : undefined;
    if (!client || client.createdAt !== d.fromWhatsApp) continue;
    if (next.some((a) => !a.deletedAt && a.clientId === client.id)) continue;
    delete nextClients[client.id];
    removedClients.push(client);
  }
  return { accounts: next, clients: removedClients.length ? nextClients : clients, trashed, removedClients };
}
