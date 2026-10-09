/**
 * 🏆 المندوبون and 👑 أفضل الزبائن - who brings the business in. Per representative for a month:
 * shipments on his devices, money collected on them (per currency), active / stopped / lapsed
 * devices. Per customer over all time: shipments (loyalty), paid per currency, devices, how long
 * he's been a customer and what he owes now. Sums are per currency, never converted. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { isShipmentEntry, type LedgerByAccount } from "./ledgerStore";
import type { RepresentativeStore } from "./repStore";
import { parseRenewalDate } from "./renewalForecast";

export interface RepRow {
  repId: string;
  name: string;
  devices: number;
  active: number;
  lapsed: number;
  shipments: number;
  collected: Record<string, number>;
}

function add(target: Record<string, number>, code: string, amount: number) {
  target[code] = (target[code] ?? 0) + amount;
}

export function repLeaderboard(accounts: StarlinkAccountSummary[], ledger: LedgerByAccount, reps: RepresentativeStore, month: string, today: Date): RepRow[] {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const rows = new Map<string, RepRow>();
  for (const rep of Object.values(reps)) rows.set(rep.id, { repId: rep.id, name: rep.name, devices: 0, active: 0, lapsed: 0, shipments: 0, collected: {} });
  for (const account of accounts) {
    if (account.deletedAt || !account.representativeId) continue;
    const row = rows.get(account.representativeId);
    if (!row) continue;
    if (!account.archivedAt) {
      row.devices += 1;
      const date = parseRenewalDate(account.rechargeDate || account.standbyDate);
      if (date && date.getTime() >= start.getTime()) row.active += 1;
      else if (date) row.lapsed += 1;
    }
    for (const entry of ledger[account.id] ?? []) {
      if (!entry.date.startsWith(month)) continue;
      if (isShipmentEntry(entry) && !entry.previousDebtId) row.shipments += 1;
      if (entry.kind === "credit") add(row.collected, entry.currency, entry.amount);
    }
  }
  return [...rows.values()].sort((a, b) => b.shipments - a.shipments || b.active - a.active || a.name.localeCompare(b.name));
}

export interface ClientRow {
  clientId: string;
  name: string;
  phone?: string;
  devices: number;
  shipments: number;
  paid: Record<string, number>;
  owes: Record<string, number>;
  /** yyyy-mm-dd of his first recorded operation. */
  since?: string;
}

export function clientLeaderboard(accounts: StarlinkAccountSummary[], ledger: LedgerByAccount, clients: ClientStore): ClientRow[] {
  const rows = new Map<string, ClientRow>();
  for (const account of accounts) {
    if (account.deletedAt || !account.clientId) continue;
    const client = clients[account.clientId];
    if (!client) continue;
    const row = rows.get(client.id) ?? { clientId: client.id, name: client.name, phone: client.phone, devices: 0, shipments: 0, paid: {}, owes: {} };
    rows.set(client.id, row);
    if (!account.archivedAt) row.devices += 1;
    for (const entry of ledger[account.id] ?? []) {
      if (!row.since || entry.date < row.since) row.since = entry.date;
      if (entry.kind === "debit") {
        if (isShipmentEntry(entry) && !entry.previousDebtId) row.shipments += 1;
        add(row.owes, entry.currency, entry.amount);
      } else {
        add(row.paid, entry.currency, entry.amount);
        add(row.owes, entry.currency, -entry.amount);
      }
    }
  }
  for (const row of rows.values()) {
    for (const [code, v] of Object.entries(row.owes)) if (Math.abs(v) < 0.005) delete row.owes[code];
  }
  return [...rows.values()].sort((a, b) => b.shipments - a.shipments || b.devices - a.devices || a.name.localeCompare(b.name));
}

/** "منذ 14 شهراً" style age from a yyyy-mm-dd, in whole months. */
export function monthsSince(date: string, today: Date): number {
  const [y, m] = date.split("-").map(Number);
  return Math.max(0, (today.getFullYear() - y!) * 12 + (today.getMonth() + 1 - m!));
}
