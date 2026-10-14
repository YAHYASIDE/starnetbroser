/**
 * 📅 Long-press on a day of «التجديد حسب اليوم»: what that day's devices need - each rep gets the
 * names and emails of his devices renewing that day (reps bot), the day's devices are synced one by
 * one, customers get a WhatsApp reminder, and a short summary of the day.
 */

import { expiryDay, type StarlinkAccountSummary } from "@starnet/shared";
import type { RepresentativeStore } from "./repStore";

/** The devices of a calendar day - the same matching as the day circles' counts. */
export function accountsForDay(accounts: StarlinkAccountSummary[], day: number): StarlinkAccountSummary[] {
  return accounts.filter((account) => expiryDay(account.rechargeDate || account.standbyDate) === day);
}

export function accountEmail(account: StarlinkAccountSummary): string {
  return account.expectedEmail?.trim() || account.starlinkAccountEmail?.trim() || "";
}

export interface RepDayMessage {
  repId: string;
  repName: string;
  phone?: string;
  count: number;
  text: string;
}

/** One message per rep: "📅 أجهزتك يوم 4" then one line per device - its name and email. */
export function repDayMessages(dayAccounts: StarlinkAccountSummary[], day: number, reps: RepresentativeStore): { messages: RepDayMessage[]; withoutRep: number } {
  const byRep = new Map<string, StarlinkAccountSummary[]>();
  let withoutRep = 0;
  for (const account of dayAccounts) {
    const rep = account.representativeId ? reps[account.representativeId] : undefined;
    if (!rep) {
      withoutRep++;
      continue;
    }
    byRep.set(rep.id, [...(byRep.get(rep.id) ?? []), account]);
  }
  const messages = [...byRep.entries()].map(([repId, list]) => {
    const rep = reps[repId]!;
    const lines = list.map((account) => `• ${account.name} — ${accountEmail(account) || "بلا إيميل"}`);
    return {
      repId,
      repName: rep.name,
      phone: rep.phone,
      count: list.length,
      text: [`📅 أجهزتك يوم ${day} (${list.length}):`, ...lines].join("\n"),
    };
  });
  return { messages: messages.sort((a, b) => b.count - a.count || a.repName.localeCompare(b.repName)), withoutRep };
}

export interface DaySummary {
  count: number;
  stopped: number;
  faulty: number;
  /** What the customers pay for one month, per currency (devices with a monthly price). */
  salesByCurrency: Record<string, number>;
  /** What Starlink charges for that month, per currency. */
  costByCurrency: Record<string, number>;
  withoutPrice: number;
}

export function daySummary(dayAccounts: StarlinkAccountSummary[]): DaySummary {
  const summary: DaySummary = { count: dayAccounts.length, stopped: 0, faulty: 0, salesByCurrency: {}, costByCurrency: {}, withoutPrice: 0 };
  for (const account of dayAccounts) {
    if (account.serviceStatus === "suspended") summary.stopped++;
    if (account.deviceFault) summary.faulty++;
    const plan = account.renewalPlan;
    if (!plan) {
      summary.withoutPrice++;
      continue;
    }
    summary.salesByCurrency[plan.saleCurrency] = (summary.salesByCurrency[plan.saleCurrency] ?? 0) + plan.saleAmount;
    summary.costByCurrency[plan.costCurrency] = (summary.costByCurrency[plan.costCurrency] ?? 0) + plan.costAmount;
  }
  return summary;
}

/** Whose devices a day's run covers: all, mine (no representative), or one representative's. */
export type DayOwner = "all" | "mine" | string;

export interface DayOwnerGroup {
  key: DayOwner;
  label: string;
  count: number;
}

export function accountsOfOwner(accounts: StarlinkAccountSummary[], owner: DayOwner): StarlinkAccountSummary[] {
  if (owner === "all") return accounts;
  if (owner === "mine") return accounts.filter((a) => !a.representativeId);
  return accounts.filter((a) => a.representativeId === owner);
}

/** 👥 «تحديث» / «كشف توثيق» for my customers alone or one rep's alone (his Oct 2026 request):
 * the choices for a day's devices - «الكل», «🏠 أجهزتي», then each rep, most devices first. Only
 * one group (e.g. all mine, or the rep's own app) → that group alone, nothing to choose. */
export function dayOwnerGroups(dayAccounts: StarlinkAccountSummary[], reps: RepresentativeStore): DayOwnerGroup[] {
  const mine = accountsOfOwner(dayAccounts, "mine").length;
  const byRep = new Map<string, number>();
  for (const account of dayAccounts) {
    if (account.representativeId) byRep.set(account.representativeId, (byRep.get(account.representativeId) ?? 0) + 1);
  }
  const repGroups = [...byRep]
    .map(([repId, count]) => ({ key: repId, label: `📱 ${reps[repId]?.name ?? "مندوب محذوف"}`, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ar"));
  const groups: DayOwnerGroup[] = [...(mine ? [{ key: "mine", label: "🏠 أجهزتي", count: mine }] : []), ...repGroups];
  return groups.length > 1 ? [{ key: "all", label: "الكل", count: dayAccounts.length }, ...groups] : groups;
}
