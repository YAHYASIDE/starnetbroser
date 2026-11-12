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
): WhatsAppDevicesResult {
  const known = new Set(
    accounts.filter((a) => !a.deletedAt).flatMap((a) => [a.expectedEmail, a.starlinkAccountEmail].map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e)),
  );
  let nextAccounts = accounts;
  const nextClients: ClientStore = { ...clients };
  const created: StarlinkAccountSummary[] = [];
  const newClients: Client[] = [];
  for (const m of messages) {
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
      };
      created.push(device);
      nextAccounts = [device, ...nextAccounts];
    }
  }
  return { accounts: nextAccounts, clients: nextClients, created, newClients };
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
