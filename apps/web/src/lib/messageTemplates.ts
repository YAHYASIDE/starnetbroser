/**
 * 📨 رسائل جماعية - the operator's own WhatsApp templates ("عرض خاص", "صيانة في منطقتكم"...) with
 * placeholders, sent to a chosen group one customer after another (WhatsApp never lets an app send
 * by itself). Placeholders: {الاسم} {الجهاز} {التاريخ} {الأيام} {المبلغ}. Pure + a small
 * `starnet_` store.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { LedgerByAccount } from "./ledgerStore";
import { parseRenewalDate } from "./renewalForecast";

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
}

export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: "renewal",
    title: "تذكير بالتجديد",
    body: "مرحباً {الاسم} 👋\nاشتراك Starlink لجهازك ({الجهاز}) ينتهي يوم {التاريخ}.\nجدّد الآن لتفادي انقطاع الإنترنت 📡\n\n- STAR NET",
  },
  {
    id: "offer",
    title: "عرض خاص",
    body: "مرحباً {الاسم} 🌟\nعرض خاص لزبائن STAR NET هذا الأسبوع: جدّد اشتراكك واحصل على خدمة أسرع ودعم مجاني.\nراسلنا للتفاصيل 🙏\n\n- STAR NET",
  },
  {
    id: "maintenance",
    title: "تنبيه عام",
    body: "مرحباً {الاسم}،\nنعلمكم أن ... \nنعتذر عن أي إزعاج 🙏\n\n- STAR NET",
  },
];

const KEY = "starnet_message_templates_v1";

export function loadTemplates(): MessageTemplate[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as MessageTemplate[]) : null;
    return Array.isArray(list) && list.length ? list : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function saveTemplates(list: MessageTemplate[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full
  }
}

export interface TemplateVars {
  name: string;
  device?: string;
  date?: string;
  days?: number;
  amount?: string;
}

export function fillTemplate(body: string, vars: TemplateVars): string {
  return body
    .replace(/\{الاسم\}/g, vars.name)
    .replace(/\{الجهاز\}/g, vars.device ?? "")
    .replace(/\{التاريخ\}/g, vars.date ?? "")
    .replace(/\{الأيام\}/g, vars.days !== undefined ? String(vars.days) : "")
    .replace(/\{المبلغ\}/g, vars.amount ?? "");
}

export type Audience = "all" | "expiring" | "lapsed" | "rep" | "debtors";

export interface AudienceTarget {
  id: string;
  label: string;
  phone?: string;
  vars: TemplateVars;
}

export interface AudienceInput {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  ledger: LedgerByAccount;
  today: Date;
  /** For "expiring": within this many days. */
  days?: number;
  repId?: string;
  currencyLabel: (code: string) => string;
}

function dm(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** One target per device (its customer's name and phone), except "all" and "debtors": one per customer. */
export function buildAudience(audience: Audience, input: AudienceInput): AudienceTarget[] {
  const start = new Date(input.today);
  start.setHours(0, 0, 0, 0);
  const active = input.accounts.filter((a) => !a.deletedAt && !a.archivedAt);
  const perDevice = (filter: (a: StarlinkAccountSummary, days: number | null, date: Date | null) => boolean): AudienceTarget[] =>
    active.flatMap((a) => {
      const date = parseRenewalDate(a.rechargeDate || a.standbyDate);
      const days = date ? Math.round((date.getTime() - start.getTime()) / 86_400_000) : null;
      if (!filter(a, days, date)) return [];
      const client = a.clientId ? input.clients[a.clientId] : undefined;
      return [
        {
          id: a.id,
          label: client ? `${a.name} - ${client.name}` : a.name,
          phone: a.phone || client?.phone,
          vars: { name: client?.name ?? a.name, device: a.name, date: date ? dm(date) : "", days: days ?? undefined },
        },
      ];
    });

  if (audience === "expiring") return perDevice((_a, days) => days !== null && days >= 0 && days <= (input.days ?? 7));
  if (audience === "lapsed") return perDevice((_a, days) => days !== null && days < 0 && days >= -120);
  if (audience === "rep") return perDevice((a) => Boolean(input.repId) && a.representativeId === input.repId);

  if (audience === "debtors") {
    const owedByClient = new Map<string, Record<string, number>>();
    for (const a of active) {
      if (!a.clientId || !input.clients[a.clientId]) continue;
      const owed = owedByClient.get(a.clientId) ?? {};
      for (const e of input.ledger[a.id] ?? []) owed[e.currency] = (owed[e.currency] ?? 0) + (e.kind === "debit" ? e.amount : -e.amount);
      owedByClient.set(a.clientId, owed);
    }
    return [...owedByClient.entries()].flatMap(([clientId, owed]) => {
      const amount = Object.entries(owed)
        .filter(([, v]) => v > 0.005)
        .map(([code, v]) => `${Math.round(v).toLocaleString("en-US")} ${input.currencyLabel(code)}`)
        .join(" + ");
      const client = input.clients[clientId]!;
      return amount ? [{ id: client.id, label: client.name, phone: client.phone, vars: { name: client.name, amount } }] : [];
    });
  }

  // "all": every customer with at least one active device, once.
  const byClient = new Map<string, AudienceTarget>();
  for (const a of active) {
    const client = a.clientId ? input.clients[a.clientId] : undefined;
    if (!client || byClient.has(client.id)) continue;
    byClient.set(client.id, { id: client.id, label: client.name, phone: client.phone, vars: { name: client.name, device: a.name } });
  }
  return [...byClient.values()];
}
