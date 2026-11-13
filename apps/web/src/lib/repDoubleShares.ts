/**
 * ⚠️ A device that gave its rep two shares in one month (his Nov 13 2026 report: «ربحه لا ينزل للجهاز في الشهر
 * مرتين، ينزل مرة واحدة - ولاحظت أن عدة أجهزة نزل لها ربح مرتين», sorowifi: 3,544 + 383 the same day). Every charge
 * on a rep's device gives his share (renewal, ROM, 100G, …); his choice: **nothing changes by itself - he is told**
 * (a «⚠️» on the second share and a list to review, the past included, each opening its operation). The month is
 * the one the share landed in (the day Starlink was paid). Pure.
 */

import { shipmentProfitDate } from "./accountingStore";
import type { RepDeviceCommissionRow } from "./repStore";

export interface DoubleShareGroup {
  accountId: string;
  /** yyyy-mm */
  month: string;
  /** Oldest first - the first is the month's share, the rest are «the second». */
  rows: RepDeviceCommissionRow[];
}

/** Shares that count (a still-D shipment's expected share is not landed yet). */
function landed(row: RepDeviceCommissionRow): boolean {
  return row.repShareUsd !== undefined && Math.abs(row.repShareUsd) > 0.000001;
}

/** Every device + month with two shares or more, newest month first. */
export function doubleShareGroups(rows: RepDeviceCommissionRow[]): DoubleShareGroup[] {
  const groups = new Map<string, DoubleShareGroup>();
  for (const row of rows) {
    if (!landed(row)) continue;
    const month = shipmentProfitDate(row.entry).slice(0, 7);
    const key = `${row.accountId}|${month}`;
    const g = groups.get(key) ?? { accountId: row.accountId, month, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }
  const out = [...groups.values()].filter((g) => g.rows.length > 1);
  for (const g of out) g.rows.sort((a, b) => (a.entry.createdAt < b.entry.createdAt ? -1 : a.entry.createdAt > b.entry.createdAt ? 1 : 0));
  return out.sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.accountId < b.accountId ? -1 : 1));
}

/** The shipments that are a device's second (or later) share of their month - marked «⚠️» in his statement. */
export function secondShareIds(rows: RepDeviceCommissionRow[]): Set<string> {
  return new Set(doubleShareGroups(rows).flatMap((g) => g.rows.slice(1).map((r) => r.entry.id)));
}
