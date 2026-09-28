/**
 * 🩺 فحص البيانات - finds what's missing or inconsistent in the operator's records before it
 * causes a lost renewal or a wrong statement: devices without a customer / renewal date / phone /
 * monthly price, the same email or KIT on two devices, a synced email that isn't the expected one,
 * devices Starlink sync never (or long ago) reached, customers without a phone. Pure: it only
 * reads the stores it's given and never changes anything.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { emailsMismatch } from "./emailMatch";

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
  | "client-no-phone";

export interface HealthItem {
  /** The device, when the issue is about one. */
  accountId?: string;
  clientId?: string;
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
};

const SEVERITY_ORDER: Record<HealthSeverity, number> = { high: 0, medium: 1, low: 2 };

function validDate(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  return !Number.isNaN(new Date(value.replace(/\//g, "-")).getTime());
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
