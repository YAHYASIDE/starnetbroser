/**
 * "💵 دفعة من زبون" (the home page's floating + button): the devices a payment can be recorded
 * on, searchable by device, client, phone or kit number - the ones whose customer still owes
 * first, so the usual payment is one tap away.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { computeBalanceByCurrency, LedgerByAccount } from "./ledgerStore";

const EPSILON = 0.005;

export interface PaymentTarget {
  account: StarlinkAccountSummary;
  clientName?: string;
  /** Positive = the customer owes this much, per currency (only currencies still owed). */
  owed: Record<string, number>;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function listPaymentTargets(
  accounts: StarlinkAccountSummary[],
  clients: ClientStore,
  ledgerStore: LedgerByAccount,
  query = "",
): PaymentTarget[] {
  const q = normalize(query);
  const targets: PaymentTarget[] = [];
  for (const account of accounts) {
    if (account.deletedAt || account.archivedAt) continue;
    const client = account.clientId ? clients[account.clientId] : undefined;
    if (q) {
      const haystack = [account.name, client?.name, client?.phone, account.phone, account.kitNumber].filter(Boolean).join(" ");
      if (!normalize(haystack).includes(q)) continue;
    }
    const owed: Record<string, number> = {};
    for (const [currency, balance] of Object.entries(computeBalanceByCurrency(ledgerStore[account.id] ?? []))) {
      if (balance > EPSILON) owed[currency] = balance;
    }
    targets.push({ account, clientName: client?.name, owed });
  }
  // Debtors first (amounts in different currencies are never compared), then by device name.
  const due = (t: PaymentTarget) => Object.keys(t.owed).length > 0;
  return targets.sort((a, b) => (due(a) !== due(b) ? (due(a) ? -1 : 1) : a.account.name.localeCompare(b.account.name, "ar")));
}
