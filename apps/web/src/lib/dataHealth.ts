/**
 * 🩺 فحص البيانات - finds what's missing or inconsistent in the operator's records before it
 * causes a lost renewal or a wrong statement: devices without a customer / renewal date / phone /
 * monthly price, the same email or KIT on two devices, a synced email that isn't the expected one,
 * devices Starlink sync never (or long ago) reached, customers without a phone. Pure: it only
 * reads the stores it's given and never changes anything.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { computeShipmentProfit } from "./accountingStore";
import { emailsMismatch } from "./emailMatch";
import type { LedgerByAccount } from "./ledgerStore";
import { currencyMismatches, mismatchLine, type PartyCurrencyContext } from "./partyCurrency";

export type HealthSeverity = "high" | "medium" | "low";

export type HealthIssueKind =
  | "duplicate-email"
  | "duplicate-kit"
  | "email-mismatch"
  | "no-renewal-date"
  | "no-client"
  | "no-phone"
  | "no-monthly-price"
  | "never-synced"
  | "stale-sync"
  | "limited-access"
  | "client-no-phone"
  | "loss-shipment"
  | "duplicate-client-phone"
  | "renewed-unrecorded"
  | "currency-mismatch";

export interface HealthItem {
  /** The device, when the issue is about one. */
  accountId?: string;
  clientId?: string;
  /** The operation the issue is about (💱 currency-mismatch); absent for a monthly price. */
  entryId?: string;
  label: string;
  detail?: string;
}

export interface HealthIssue {
  kind: HealthIssueKind;
  severity: HealthSeverity;
  title: string;
  hint: string;
  items: HealthItem[];
}

const META: Record<HealthIssueKind, { severity: HealthSeverity; title: string; hint: string }> = {
  "duplicate-email": { severity: "high", title: "إيميل مكرر على أكثر من جهاز", hint: "غالباً جهاز أُضيف مرتين - احذف المكرر أو صحّح الإيميل" },
  "duplicate-kit": { severity: "high", title: "رقم KIT مكرر", hint: "نفس الطبق مسجل على جهازين" },
  "email-mismatch": { severity: "high", title: "الإيميل في Starlink غير المتوقع", hint: "المزامنة وجدت حساباً غير الذي كتبته - تأكد أنك فتحت الحساب الصحيح" },
  "no-renewal-date": { severity: "high", title: "بدون موعد تجديد", hint: "لن يظهر في التذكيرات ولا في التوقعات" },
  "no-client": { severity: "medium", title: "جهاز بدون زبون", hint: "اربطه بزبونه ليظهر في كشفه وديونه" },
  "no-phone": { severity: "medium", title: "بدون رقم هاتف", hint: "لا يمكن تذكيره عبر واتساب" },
  "no-monthly-price": { severity: "low", title: "بدون سعر شهري", hint: "التجديد بضغطة والتوقعات تحتاج السعر الشهري" },
  "never-synced": { severity: "medium", title: "لم يُزامَن مع Starlink أبداً", hint: "افتحه مرة واحدة وسجّل الدخول" },
  "stale-sync": { severity: "low", title: "آخر مزامنة قديمة", hint: "بياناته قد لا تكون حديثة" },
  "limited-access": { severity: "low", title: "إيميل بصلاحيات محدودة", hint: "لا يعرض الفوترة - اطلب من الزبون صلاحيات كاملة" },
  "client-no-phone": { severity: "medium", title: "زبون بدون هاتف", hint: "أضف رقمه لتصله التذكيرات والكشوف" },
  "loss-shipment": { severity: "high", title: "شحنة بخسارة (آخر 90 يوماً)", hint: "بيعت بأقل من تكلفة Starlink - غالباً خطأ في المبلغ أو سعر الصرف" },
  "renewed-unrecorded": {
    severity: "high",
    title: "تجدد في Starlink بدون تجديد مسجل",
    hint: "موعده القادم بعيد لكن آخر شحنة مسجلة قديمة - ربما جددته ولم تسجل المبلغ على الزبون",
  },
  "currency-mismatch": {
    severity: "high",
    title: "💱 عملية بعملة مختلفة عن عملة صاحبها",
    hint: "المندوب أو الزبون يتعامل بعملة وهذه سُجّلت بأخرى - صحّحها، أو اضغط «✓ صحيحة» إن كانت مقصودة",
  },
  "duplicate-client-phone": { severity: "medium", title: "زبونان بنفس الهاتف", hint: "غالباً نفس الزبون مسجل مرتين - ادمج أجهزته في زبون واحد" },
};

const SEVERITY_ORDER: Record<HealthSeverity, number> = { high: 0, medium: 1, low: 2 };

function validDate(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  return !Number.isNaN(new Date(value.replace(/\//g, "-")).getTime());
}

function parseRenewalDay(value: string | undefined): Date | null {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(value?.trim() ?? "");
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function digits(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function deviceEmail(account: StarlinkAccountSummary): string {
  return (account.expectedEmail || account.starlinkAccountEmail || "").trim().toLowerCase();
}

export interface HealthOptions {
  now?: Date;
  /** A sync older than this many days counts as stale. */
  staleDays?: number;
  /** With the ledger, settled shipments sold below cost in the last 90 days are flagged. */
  ledger?: LedgerByAccount;
  /** 💱 With it, operations in another currency than their rep's / customer's are listed (from
   * every device - the reps' too, it's the operator's money). */
  currency?: PartyCurrencyContext;
}

export function checkDataHealth(accounts: StarlinkAccountSummary[], clients: ClientStore, options: HealthOptions = {}): HealthIssue[] {
  const now = options.now ?? new Date();
  const staleMs = (options.staleDays ?? 14) * 86_400_000;
  const active = accounts.filter((a) => !a.deletedAt && !a.archivedAt);
  const found = new Map<HealthIssueKind, HealthItem[]>();
  const push = (kind: HealthIssueKind, item: HealthItem) => {
    const list = found.get(kind) ?? [];
    list.push(item);
    found.set(kind, list);
  };
  const clientName = (a: StarlinkAccountSummary) => (a.clientId ? clients[a.clientId]?.name : undefined);
  const item = (a: StarlinkAccountSummary, detail?: string): HealthItem => ({
    accountId: a.id,
    clientId: a.clientId,
    label: a.name,
    detail: detail ?? clientName(a),
  });

  const byEmail = new Map<string, StarlinkAccountSummary[]>();
  const byKit = new Map<string, StarlinkAccountSummary[]>();
  for (const account of active) {
    const email = deviceEmail(account);
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), account]);
    const kit = account.kitNumber?.trim().toUpperCase();
    if (kit) byKit.set(kit, [...(byKit.get(kit) ?? []), account]);

    if (emailsMismatch(account.expectedEmail, account.starlinkAccountEmail)) push("email-mismatch", item(account, `${account.expectedEmail} ≠ ${account.starlinkAccountEmail}`));
    if (!validDate(account.rechargeDate) && !validDate(account.standbyDate)) push("no-renewal-date", item(account));
    const client = account.clientId ? clients[account.clientId] : undefined;
    if (!client) push("no-client", item(account));
    if (digits(account.phone).length < 8 && digits(client?.phone).length < 8) push("no-phone", item(account));
    if (!account.renewalPlan) push("no-monthly-price", item(account));
    if (!account.lastSuccessfulScanAt) push("never-synced", item(account));
    else {
      const at = new Date(account.lastSuccessfulScanAt).getTime();
      if (!Number.isNaN(at) && now.getTime() - at > staleMs) push("stale-sync", item(account, `${Math.floor((now.getTime() - at) / 86_400_000)} يوماً`));
    }
    if (account.limitedAccess) push("limited-access", item(account));
  }
  for (const [email, list] of byEmail) {
    if (list.length > 1) for (const account of list) push("duplicate-email", item(account, email));
  }
  for (const [kit, list] of byKit) {
    if (list.length > 1) for (const account of list) push("duplicate-kit", item(account, kit));
  }
  if (options.ledger) {
    // Renewed at Starlink (next date well ahead) while the last recorded shipment is old: the
    // renewal was probably never charged to the customer.
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    const oldShipment = new Date(today0.getTime() - 35 * 86_400_000).toISOString().slice(0, 10);
    for (const account of active) {
      const next = parseRenewalDay(account.rechargeDate);
      if (!next || (next.getTime() - today0.getTime()) / 86_400_000 < 15) continue;
      const shipments = (options.ledger[account.id] ?? []).filter((e) => e.kind === "debit" && !e.previousDebtId);
      if (shipments.length === 0) continue;
      const last = shipments.reduce((a, b) => (b.date > a ? b.date : a), "");
      if (last < oldShipment) push("renewed-unrecorded", item(account, `آخر شحنة ${last} · القادم ${account.rechargeDate}`));
    }
    const since = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
    for (const account of active) {
      for (const entry of options.ledger[account.id] ?? []) {
        if (entry.kind !== "debit" || entry.date < since) continue;
        const profit = computeShipmentProfit(entry);
        if (profit.status === "computed" && profit.profitUsd !== undefined && profit.profitUsd < -0.5) {
          push("loss-shipment", item(account, `${entry.date} · خسارة ${Math.round(-profit.profitUsd)}$`));
        }
      }
    }
  }
  if (options.currency) {
    for (const m of currencyMismatches(options.currency)) {
      const line = mismatchLine(m);
      push("currency-mismatch", { accountId: m.accountId, entryId: m.entry?.id, label: line.label, detail: line.detail });
    }
  }
  const byPhone = new Map<string, string[]>();
  for (const client of Object.values(clients)) {
    const phone = digits(client.phone).slice(-8);
    if (phone.length === 8) byPhone.set(phone, [...(byPhone.get(phone) ?? []), client.id]);
  }
  for (const ids of byPhone.values()) {
    if (ids.length > 1) for (const id of ids) push("duplicate-client-phone", { clientId: id, label: clients[id]!.name, detail: clients[id]!.phone });
  }
  const clientsWithDevices = new Set(active.map((a) => a.clientId).filter(Boolean));
  for (const client of Object.values(clients)) {
    if (clientsWithDevices.has(client.id) && digits(client.phone).length < 8) push("client-no-phone", { clientId: client.id, label: client.name });
  }

  return [...found.entries()]
    .map(([kind, items]) => ({ kind, ...META[kind], items }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.items.length - a.items.length);
}

/** 0-100: the share of active devices with no high/medium issue. */
export function healthScore(accounts: StarlinkAccountSummary[], issues: HealthIssue[]): number {
  const active = accounts.filter((a) => !a.deletedAt && !a.archivedAt);
  if (active.length === 0) return 100;
  const troubled = new Set<string>();
  for (const issue of issues) {
    if (issue.severity === "low") continue;
    for (const entry of issue.items) if (entry.accountId) troubled.add(entry.accountId);
  }
  return Math.round(((active.length - troubled.size) / active.length) * 100);
}
