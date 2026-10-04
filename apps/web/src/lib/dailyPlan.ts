/**
 * ✅ خطة اليوم - one checklist of what's worth doing today, pulled from everything else: renewals
 * due today/tomorrow and the ones that just lapsed, payment promises due, the oldest debts, the
 * freshest customers to win back, and serious data problems. Each task carries its WhatsApp
 * message when there's someone to write to. Pure: ticking tasks off is the caller's business.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import type { HealthIssue } from "./dataHealth";
import type { DebtorAging } from "./debtAging";
import type { PaymentPromise } from "./paymentPromises";
import { parseRenewalDate } from "./renewalForecast";
import { buildExpiryReminderMessage, buildStoreDebtReminderMessage } from "./whatsapp";
import { buildWinBackMessage, listLapsedDevices } from "./winBack";
import { buildPromiseReminder } from "./paymentPromises";

export type PlanTaskKind = "renewal" | "promise" | "debt" | "winback" | "data";

export interface PlanTask {
  /** Stable for the day, so a ticked task stays ticked. */
  id: string;
  kind: PlanTaskKind;
  title: string;
  detail: string;
  phone?: string;
  message?: string;
  /** A device/client name to find on the home screen. */
  search?: string;
  /** Lower first. */
  priority: number;
}

export interface DailyPlanInput {
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  promises: PaymentPromise[];
  debtors: DebtorAging[];
  issues: HealthIssue[];
  /** yyyy-mm-dd */
  today: string;
  currencyLabel: (code: string) => string;
  maxDebts?: number;
  maxWinBack?: number;
}

function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function buildDailyPlan(input: DailyPlanInput): PlanTask[] {
  const tasks: PlanTask[] = [];
  const today = localDate(input.today);
  const active = input.accounts.filter((a) => !a.deletedAt && !a.archivedAt && !a.deviceFault);
  const clientOf = (a: StarlinkAccountSummary) => (a.clientId ? input.clients[a.clientId] : undefined);

  for (const account of active) {
    const date = parseRenewalDate(account.rechargeDate || account.standbyDate);
    if (!date) continue;
    const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
    // The renewal date is the stop instant (midnight): date tomorrow (days=1) = ends tonight,
    // date today (days=0) = already stopped. Show the recently-stopped and the next two nights.
    if (days < -2 || days > 2) continue;
    const client = clientOf(account);
    tasks.push({
      id: `renewal:${account.id}`,
      kind: "renewal",
      title: `${days <= 0 ? "⛔" : "📅"} ${account.name}`,
      detail: `${client ? `${client.name} · ` : ""}${days <= 0 ? (days === 0 ? "انتهى اليوم" : `انتهى منذ ${-days} يوم`) : days === 1 ? "ينتهي اليوم" : "ينتهي غداً"}`,
      phone: account.phone || client?.phone,
      message: buildExpiryReminderMessage(client?.name ?? account.name),
      search: account.name,
      priority: days <= 0 ? 1 : days === 1 ? 2 : 4,
    });
  }

  for (const p of input.promises) {
    if (p.status !== "open" || p.dueDate > input.today) continue;
    tasks.push({
      id: `promise:${p.id}`,
      kind: "promise",
      title: `🤝 ${p.name}`,
      detail: `وعد بدفع ${p.amount.toLocaleString("en-US")} ${input.currencyLabel(p.currency)}${p.dueDate < input.today ? " (متأخر)" : " اليوم"}`,
      phone: p.phone,
      message: buildPromiseReminder(p, input.currencyLabel(p.currency), input.today),
      search: p.name,
      priority: p.dueDate < input.today ? 1 : 3,
    });
  }

  const debts = [...input.debtors].filter((d) => d.oldestDays >= 30).slice(0, input.maxDebts ?? 5);
  for (const d of debts) {
    tasks.push({
      id: `debt:${d.id}:${d.currencyCode}`,
      kind: "debt",
      title: `💰 ${d.name}`,
      detail: `عليه ${Math.round(d.total).toLocaleString("en-US")} ${input.currencyLabel(d.currencyCode)} · أقدمه ${d.oldestDays} يوماً`,
      phone: d.phone,
      message: buildStoreDebtReminderMessage(d.name, { [d.currencyCode]: d.total }),
      search: d.name,
      priority: 5,
    });
  }

  for (const d of listLapsedDevices(active, input.clients, today, { minDays: 3, maxDays: 14 }).slice(0, input.maxWinBack ?? 3)) {
    tasks.push({
      id: `winback:${d.id}`,
      kind: "winback",
      title: `🔁 ${d.name}`,
      detail: `${d.clientName ? `${d.clientName} · ` : ""}متوقف منذ ${d.daysLapsed} يوماً`,
      phone: d.phone,
      message: buildWinBackMessage(d),
      search: d.name,
      priority: 6,
    });
  }

  for (const issue of input.issues) {
    if (issue.severity !== "high") continue;
    tasks.push({ id: `data:${issue.kind}`, kind: "data", title: `🩺 ${issue.title}`, detail: `${issue.items.length} - ${issue.hint}`, priority: 7 });
  }

  return tasks.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
}
