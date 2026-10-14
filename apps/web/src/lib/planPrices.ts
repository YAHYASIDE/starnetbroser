/**
 * 💲 الأسعار الشهرية - every distinct monthly price in use (sale + Starlink cost, per currency)
 * with how many devices carry it, and a bulk change: "Starlink raised the cost from 50$ to 55$"
 * or "Mini now sells at 4500" updates all those devices' renewalPlan at once. It only changes
 * the price used for future renewals - recorded shipments keep their own locked amounts. Pure.
 */

import type { RenewalPlan, StarlinkAccountSummary } from "@starnet/shared";

export interface PlanGroup {
  key: string;
  plan: RenewalPlan;
  accountIds: string[];
}

export function planKey(plan: RenewalPlan): string {
  return `${plan.saleAmount}|${plan.saleCurrency}|${plan.costAmount}|${plan.costCurrency}`;
}

export function groupPlans(accounts: StarlinkAccountSummary[]): PlanGroup[] {
  const groups = new Map<string, PlanGroup>();
  for (const account of accounts) {
    if (account.deletedAt || account.archivedAt || !account.renewalPlan) continue;
    const key = planKey(account.renewalPlan);
    const group = groups.get(key) ?? { key, plan: account.renewalPlan, accountIds: [] };
    group.accountIds.push(account.id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.accountIds.length - a.accountIds.length || a.key.localeCompare(b.key));
}

export interface PlanChange {
  saleAmount?: number;
  costAmount?: number;
}

export function validatePlanChange(change: PlanChange): string | null {
  if (change.saleAmount !== undefined && !(change.saleAmount > 0)) return "سعر البيع غير صحيح";
  if (change.costAmount !== undefined && !(change.costAmount >= 0)) return "التكلفة غير صحيحة";
  return null;
}

/** Devices whose current plan is exactly `from` get the new amounts (currencies unchanged). */
export function applyPlanChange(accounts: StarlinkAccountSummary[], fromKey: string, change: PlanChange): { accounts: StarlinkAccountSummary[]; changed: number } {
  let changed = 0;
  const next = accounts.map((a) => {
    if (!a.renewalPlan || a.deletedAt || a.archivedAt || planKey(a.renewalPlan) !== fromKey) return a;
    changed += 1;
    return {
      ...a,
      renewalPlan: {
        ...a.renewalPlan,
        ...(change.saleAmount !== undefined ? { saleAmount: change.saleAmount } : {}),
        ...(change.costAmount !== undefined ? { costAmount: change.costAmount } : {}),
      },
    };
  });
  return { accounts: next, changed };
}
