/**
 * 🪄 Fills the monthly price (renewalPlan) of devices that don't have one from their own last
 * shipment: what the customer was charged and what Starlink cost, in the same currencies. Only a
 * proposal until the operator applies it; it sets the price for future renewals and never
 * touches any recorded entry. Pure.
 */

import type { RenewalPlan, StarlinkAccountSummary } from "@starnet/shared";
import { isShipmentEntry, type LedgerByAccount } from "./ledgerStore";

export interface PlanSuggestion {
  accountId: string;
  name: string;
  plan: RenewalPlan;
  /** yyyy-mm-dd of the shipment it came from. */
  from: string;
}

export function suggestRenewalPlans(accounts: StarlinkAccountSummary[], ledger: LedgerByAccount): PlanSuggestion[] {
  const out: PlanSuggestion[] = [];
  for (const account of accounts) {
    if (account.renewalPlan || account.deletedAt || account.archivedAt) continue;
    const shipments = (ledger[account.id] ?? [])
      .filter((e) => isShipmentEntry(e) && !e.previousDebtId && e.amount > 0)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const last = shipments[0];
    if (!last) continue;
    const cost = last.starlinkCost;
    const plan: RenewalPlan = {
      saleAmount: last.amount,
      saleCurrency: last.currency,
      costAmount: cost?.amount && cost.amount > 0 ? cost.amount : 0,
      costCurrency: cost?.currencyCode || "USD",
    };
    out.push({ accountId: account.id, name: account.name, plan, from: last.date });
  }
  return out;
}

export function applyPlanSuggestions(accounts: StarlinkAccountSummary[], suggestions: PlanSuggestion[]): StarlinkAccountSummary[] {
  const byId = new Map(suggestions.map((s) => [s.accountId, s.plan]));
  return accounts.map((a) => (!a.renewalPlan && byId.has(a.id) ? { ...a, renewalPlan: byId.get(a.id)! } : a));
}
