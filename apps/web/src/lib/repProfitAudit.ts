/**
 * 🔍 «فحص حساب الربح» (his Nov 23 2026 report: the bot sent one operation's balance-before and share, the app
 * later showed different figures for the same operation). Read only - nothing here changes a record; he looks, then
 * decides. Three lists:
 *  1. Shares that landed AFTER a moment he picks while their day is older (a D paid with an older date, or an
 *     operation that came late from another phone): who recorded it (🔗 the team mark, else this phone) and when.
 *  2. A device with two shares in one month (repDoubleShares.ts).
 *  3. Operations the bot already sent whose share is different now - with what the share is made of today
 *     (sale, Starlink's cost and its currency / rate, his own rate, percent) so the cause shows.
 * Pure.
 */

import { shipmentProfitDate, starlinkCostUsd } from "./accountingStore";
import type { LedgerEntry } from "./ledgerStore";
import type { RepConvert } from "./repAccount";
import { doubleShareGroups, type DoubleShareGroup } from "./repDoubleShares";
import type { LoggedOp } from "./repOpLog";
import { repProfitUsd } from "./repRates";
import type { RepDeviceCommissionRow } from "./repStore";
import { entryOrigin, type Origin } from "./teamActivity";

export interface ShareMakeup {
  saleUsd?: number;
  costUsd?: number;
  costCurrency?: string;
  costAmount?: number;
  /** The locked rate of the cost: units of its currency per 1 USD. */
  costRate?: number;
  /** Our profit, and his profit (the cost at his own rate, repRates.ts). */
  profitUsd?: number;
  hisProfitUsd?: number;
  percent: number;
  repRates?: LedgerEntry["representativeRates"];
}

export interface LateShare {
  row: RepDeviceCommissionRow;
  /** The day the share counts on (the D's payment day). */
  day: string;
  /** When it reached this phone: the team mark's time, else when it was paid / recorded here. */
  landedAt: string;
  /** Who recorded it: a team member's name, or undefined = this phone. */
  by?: string;
}

export interface ShareDrift {
  op: LoggedOp;
  row: RepDeviceCommissionRow;
  /** The profit-account figure the bot sent, and what the share is now - per currency. */
  then: Record<string, number>;
  now: Record<string, number>;
  makeup: ShareMakeup;
  /** The last team change of that operation, if it came from another phone. */
  origin?: Origin;
}

export interface ProfitAudit {
  late: LateShare[];
  doubles: DoubleShareGroup[];
  drifts: ShareDrift[];
}

function landed(row: RepDeviceCommissionRow): boolean {
  return row.repShareUsd !== undefined && Math.abs(row.repShareUsd) > 0.000001;
}

export function shareMakeup(row: RepDeviceCommissionRow): ShareMakeup {
  const cost = row.entry.starlinkCost;
  const profitUsd = row.profit.profitUsd;
  return {
    saleUsd: row.profit.saleValueUsd,
    costUsd: starlinkCostUsd(row.entry),
    costCurrency: cost?.currencyCode,
    costAmount: cost?.amount,
    costRate: cost?.rate?.rateFromUsd,
    profitUsd,
    hisProfitUsd: profitUsd === undefined ? undefined : repProfitUsd(row.entry, profitUsd),
    percent: row.percent,
    repRates: row.entry.representativeRates,
  };
}

/** When the share reached this phone. */
export function shareLandedAt(row: RepDeviceCommissionRow, origins: Record<string, Origin>): { at: string; by?: string } {
  const here = row.entry.starlinkCost?.settledAt ?? row.entry.createdAt;
  const origin = entryOrigin(origins, row.accountId, row.entry.id);
  if (origin && origin.at > here) return { at: origin.at, by: origin.by };
  return { at: here, by: origin?.by };
}

/** The profit-account figure of a logged operation (the one whose account is the profit / «حصته»). */
function profitFigures(op: LoggedOp): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of op.figures) out[f.code] = f.amount;
  return out;
}

export function buildProfitAudit(input: {
  rows: RepDeviceCommissionRow[];
  origins: Record<string, Origin>;
  ops: LoggedOp[];
  /** ISO - shares that landed after it with an older day are listed. */
  since: string;
  convert: RepConvert;
  /** A difference below this (in each currency) is rounding, not a change. */
  tolerance?: number;
}): ProfitAudit {
  const tolerance = input.tolerance ?? 1;
  const late: LateShare[] = [];
  for (const row of input.rows) {
    if (!landed(row)) continue;
    const { at, by } = shareLandedAt(row, input.origins);
    const day = shipmentProfitDate(row.entry);
    if (at > input.since && day < at.slice(0, 10)) late.push({ row, day, landedAt: at, by });
  }
  late.sort((a, b) => (a.landedAt < b.landedAt ? -1 : a.landedAt > b.landedAt ? 1 : 0));

  const byEntry = new Map(input.rows.map((r) => [r.entry.id, r]));
  const drifts: ShareDrift[] = [];
  for (const op of input.ops) {
    // only what the bot sent on his profit account («💰 حساب الربح»)
    if (!op.account.includes("الربح")) continue;
    const row = op.recordId ? byEntry.get(op.recordId) : op.ids.map((id) => byEntry.get(id)).find(Boolean);
    if (!row || row.repShareUsd === undefined) continue;
    const then = profitFigures(op);
    const codes = Object.keys(then);
    if (codes.length === 0) continue;
    const now = input.convert(row.repShareUsd, "USD", row.entry.profitCurrencyRates);
    const changed = codes.some((c) => now[c] !== undefined && Math.abs(Math.abs(now[c]!) - Math.abs(then[c]!)) > tolerance);
    if (!changed) continue;
    drifts.push({ op, row, then, now, makeup: shareMakeup(row), origin: entryOrigin(input.origins, row.accountId, row.entry.id) });
  }
  drifts.sort((a, b) => b.op.serial - a.op.serial);

  return { late, doubles: doubleShareGroups(input.rows), drifts };
}
