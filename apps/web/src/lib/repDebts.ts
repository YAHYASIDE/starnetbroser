/**
 * Representatives and the customers behind their devices:
 * - which rep(s) a client "belongs" to - the reps of that client's devices (a device carries its own
 *   representativeId; a client never does), shown as a tag on the client card;
 * - what the customers of a rep's devices still owe - every device's own balance (شحنات − دفعات),
 *   per currency, never converted - shown on the rep's card.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeBalanceByCurrency, LedgerByAccount } from "./ledgerStore";
import { RepresentativeStore } from "./repStore";
import type { Client } from "./clientStore";
import { currentRepOfClient } from "./repClients";

const EPSILON = 0.005;

/** Names of the reps of this client's (not deleted) devices, each once, in device order. */
export function clientRepNames(
  clientId: string,
  accounts: StarlinkAccountSummary[],
  reps: RepresentativeStore,
  client?: Pick<Client, "repSegments">,
): string[] {
  // A customer in the new model (repClients.ts) is one rep's - or ours again.
  if (client?.repSegments?.length) {
    const repId = currentRepOfClient(client);
    const name = repId ? reps[repId]?.name : undefined;
    return name ? [name] : [];
  }
  const names: string[] = [];
  for (const account of accounts) {
    if (account.clientId !== clientId || account.deletedAt || !account.representativeId) continue;
    const name = reps[account.representativeId]?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export interface RepDeviceDebtRow {
  accountId: string;
  /** Positive = the customer owes this much, per currency (only currencies still owed). */
  owed: Record<string, number>;
}

export interface RepDevicesDebt {
  rows: RepDeviceDebtRow[];
  totalByCurrency: Record<string, number>;
}

/** What the customers of this rep's devices still owe, device by device and in total. A device
 * whose customer is paid up or in credit adds nothing. */
export function repDevicesDebt(representativeId: string, accounts: StarlinkAccountSummary[], ledgerStore: LedgerByAccount): RepDevicesDebt {
  const rows: RepDeviceDebtRow[] = [];
  const totalByCurrency: Record<string, number> = {};
  for (const account of accounts) {
    if (account.representativeId !== representativeId || account.deletedAt) continue;
    const owed: Record<string, number> = {};
    for (const [currency, balance] of Object.entries(computeBalanceByCurrency(ledgerStore[account.id] ?? []))) {
      if (balance > EPSILON) {
        owed[currency] = balance;
        totalByCurrency[currency] = (totalByCurrency[currency] ?? 0) + balance;
      }
    }
    if (Object.keys(owed).length > 0) rows.push({ accountId: account.id, owed });
  }
  return { rows, totalByCurrency };
}
