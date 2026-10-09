/**
 * 📡 «تحليل اشتراكات Starlink» (his Oct 9 2026 brief, part 2): every renewal of the period on its own
 * line, its six separate figures never mixed:
 *   sale to the customer · Starlink's cost · what the customer paid of it · what STAR NET paid
 *   Starlink · what the customer still owes · what STAR NET still owes Starlink
 * and the margin = sale − cost. The profit POLICY stays the app's («الصافي», lib/netProfit.ts):
 * a renewal's profit is realized on the day Starlink was paid; while its cost is still owed (D) its
 * margin is «معلّق», never available to withdraw. A renewal missing its cost or its sale's value is
 * «بيانات غير مكتملة» - never called a loss or a profit.
 *
 * What the customer paid of each renewal: his device's payments settle its oldest charges first
 * (the same FIFO rule as «أعمار الديون»), per currency. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeExpectedShipmentProfit, starlinkCostUsd } from "./accountingStore";
import { isShipmentEntry, type LedgerByAccount, type LedgerEntry } from "./ledgerStore";
import { toMru, type RatesFromUsd } from "./reportsView";

const EPS = 0.005;

export type CostState = "settled" | "pending" | "unknown";

export interface RenewalRow {
  entryId: string;
  accountId: string;
  device: string;
  clientId?: string;
  client?: string;
  plan?: string;
  date: string;
  currency: string;
  /** The sale, in its own currency. */
  sale: number;
  saleMru?: number;
  /** Paid by the customer (FIFO on his device), in the sale's currency. */
  paid: number;
  /** What the customer still owes for this renewal, in the sale's currency. */
  unpaid: number;
  costState: CostState;
  costUsd?: number;
  costMru?: number;
  /** Day Starlink was paid. */
  costPaidAt?: string;
  /** sale − cost, أوقية: at the renewal's locked rate once settled, today's rate (≈) while D. */
  marginMru?: number;
  marginPct?: number;
  /** Both the sale's value and the cost are known. */
  complete: boolean;
  /** A figure used today's rate instead of a locked one. */
  approx: boolean;
}

/** Per device and currency: how much of each charge his payments settled, oldest charge first. */
export function fifoPaidByCharge(ledger: LedgerByAccount): Map<string, number> {
  const paid = new Map<string, number>();
  for (const entries of Object.values(ledger)) {
    const byCurrency = new Map<string, LedgerEntry[]>();
    for (const e of entries) byCurrency.set(e.currency, [...(byCurrency.get(e.currency) ?? []), e]);
    for (const list of byCurrency.values()) {
      const sorted = [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
      const open: { id: string; left: number }[] = [];
      let credit = 0;
      for (const e of sorted) {
        if (e.kind === "debit") {
          const used = Math.min(credit, e.amount);
          credit -= used;
          paid.set(e.id, used);
          if (e.amount - used > EPS) open.push({ id: e.id, left: e.amount - used });
        } else {
          let money = e.amount;
          while (money > EPS && open.length) {
            const oldest = open[0]!;
            const take = Math.min(money, oldest.left);
            oldest.left -= take;
            money -= take;
            paid.set(oldest.id, (paid.get(oldest.id) ?? 0) + take);
            if (oldest.left <= EPS) open.shift();
          }
          credit += money;
        }
      }
    }
  }
  return paid;
}

export function buildRenewalRows(input: {
  ledger: LedgerByAccount;
  accounts: StarlinkAccountSummary[];
  clientName: (id: string) => string | undefined;
  rates: RatesFromUsd;
  range: { from: string; to: string };
}): RenewalRow[] {
  const paidBy = fifoPaidByCharge(input.ledger);
  const mruToday = input.rates.MRU;
  const rows: RenewalRow[] = [];
  for (const [accountId, entries] of Object.entries(input.ledger)) {
    const account = input.accounts.find((a) => a.id === accountId);
    for (const e of entries) {
      if (!isShipmentEntry(e) || e.previousDebtId || e.date < input.range.from || e.date > input.range.to) continue;
      const cost = e.starlinkCost;
      const costUsd = starlinkCostUsd(e);
      const costState: CostState = !cost || costUsd === undefined ? "unknown" : cost.status === "settled" ? "settled" : "pending";
      const lockedMru = e.profitCurrencyRates?.MRU;
      const settled = costState === "settled" && lockedMru !== undefined;
      const rate = settled ? lockedMru : mruToday;
      const saleUsd = e.currency === "USD" ? e.amount : e.saleRate?.usdValue;
      const saleMru = e.currency === "MRU" ? e.amount : saleUsd !== undefined && rate ? saleUsd * rate : toMru(e.amount, e.currency, input.rates);
      const costMru = costUsd !== undefined && rate ? costUsd * rate : undefined;
      const expected = computeExpectedShipmentProfit(e);
      const marginMru =
        expected.status === "confirmed" && expected.profitMru !== undefined
          ? expected.profitMru
          : expected.profitUsd !== undefined && mruToday
            ? expected.profitUsd * mruToday
            : undefined;
      const paid = Math.min(e.amount, paidBy.get(e.id) ?? 0);
      rows.push({
        entryId: e.id,
        accountId,
        device: account?.name ?? "جهاز محذوف",
        clientId: account?.clientId,
        client: account?.clientId ? input.clientName(account.clientId) : undefined,
        plan: account?.planName || undefined,
        date: e.date,
        currency: e.currency,
        sale: e.amount,
        saleMru,
        paid,
        unpaid: Math.max(0, e.amount - paid),
        costState,
        costUsd,
        costMru,
        costPaidAt: cost?.status === "settled" ? cost.paidAt : undefined,
        marginMru,
        marginPct: marginMru !== undefined && saleMru ? (marginMru / saleMru) * 100 : undefined,
        complete: marginMru !== undefined,
        approx: !settled || e.currency !== "MRU",
      });
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface GroupRow {
  key: string;
  label: string;
  renewals: number;
  salesMru: number;
  costMru: number;
  marginMru: number;
  unpaidMru: number;
  /** Renewals without a complete margin (not counted in marginMru). */
  incomplete: number;
}

export interface StarlinkBook {
  rows: RenewalRow[];
  count: number;
  salesMru: number;
  /** Paid by customers toward these renewals / still owed by them (أوقية, ≈ for other currencies). */
  paidByClientsMru: number;
  owedByClientsMru: number;
  costMru: number;
  costSettledMru: number;
  costSettledCount: number;
  costPendingMru: number;
  costPendingCount: number;
  /** Σ (sale − cost) of the renewals whose both sides are known: the expected margin. */
  expectedMarginMru: number;
  incompleteCount: number;
  avgMarginMru?: number;
  avgMarginPct?: number;
  devices: GroupRow[];
  clients: GroupRow[];
  byPlan: GroupRow[];
  byMonth: GroupRow[];
  byCurrency: GroupRow[];
  /** Customers with the most renewals in the period. */
  mostRenewing: GroupRow[];
  losses: RenewalRow[];
  lowMargin: RenewalRow[];
  unsettled: RenewalRow[];
  incomplete: RenewalRow[];
  /** Renewals fully paid by the customer AND paid to Starlink: their margin is money in hand. */
  cashedMarginMru: number;
  approx: boolean;
}

function group(rows: RenewalRow[], keyOf: (r: RenewalRow) => { key: string; label: string } | undefined): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const g = map.get(k.key) ?? { key: k.key, label: k.label, renewals: 0, salesMru: 0, costMru: 0, marginMru: 0, unpaidMru: 0, incomplete: 0 };
    g.renewals += 1;
    g.salesMru += r.saleMru ?? 0;
    g.costMru += r.costMru ?? 0;
    if (r.complete) g.marginMru += r.marginMru!;
    else g.incomplete += 1;
    if (r.saleMru !== undefined && r.sale > 0) g.unpaidMru += (r.unpaid / r.sale) * r.saleMru;
    map.set(k.key, g);
  }
  return [...map.values()];
}

/** `minMarginPct`: a complete renewal under it (but not a loss) is «هامش منخفض». */
export function summarizeStarlink(rows: RenewalRow[], minMarginPct = 10): StarlinkBook {
  let salesMru = 0;
  let paidMru = 0;
  let owedMru = 0;
  let costMru = 0;
  let settledMru = 0;
  let settledCount = 0;
  let pendingMru = 0;
  let pendingCount = 0;
  let margin = 0;
  let complete = 0;
  let pctSum = 0;
  let pctCount = 0;
  let cashed = 0;
  let approx = false;
  for (const r of rows) {
    if (r.approx) approx = true;
    if (r.saleMru !== undefined) {
      salesMru += r.saleMru;
      if (r.sale > 0) {
        paidMru += (r.paid / r.sale) * r.saleMru;
        owedMru += (r.unpaid / r.sale) * r.saleMru;
      }
    }
    if (r.costMru !== undefined) costMru += r.costMru;
    if (r.costState === "settled") {
      settledCount += 1;
      settledMru += r.costMru ?? 0;
    } else if (r.costState === "pending") {
      pendingCount += 1;
      pendingMru += r.costMru ?? 0;
    }
    if (r.complete) {
      margin += r.marginMru!;
      complete += 1;
      if (r.marginPct !== undefined) {
        pctSum += r.marginPct;
        pctCount += 1;
      }
      if (r.costState === "settled" && r.unpaid <= EPS) cashed += r.marginMru!;
    }
  }
  const byMargin = (a: GroupRow, b: GroupRow) => b.marginMru - a.marginMru;
  const devices = group(rows, (r) => ({ key: r.accountId, label: r.device })).sort(byMargin);
  const clients = group(rows, (r) => (r.clientId ? { key: r.clientId, label: r.client ?? "زبون" } : undefined)).sort(byMargin);
  return {
    rows,
    count: rows.length,
    salesMru,
    paidByClientsMru: paidMru,
    owedByClientsMru: owedMru,
    costMru,
    costSettledMru: settledMru,
    costSettledCount: settledCount,
    costPendingMru: pendingMru,
    costPendingCount: pendingCount,
    expectedMarginMru: margin,
    incompleteCount: rows.length - complete,
    avgMarginMru: complete ? margin / complete : undefined,
    avgMarginPct: pctCount ? pctSum / pctCount : undefined,
    devices,
    clients,
    byPlan: group(rows, (r) => ({ key: r.plan ?? "-", label: r.plan ?? "باقة غير معروفة" })).sort(byMargin),
    byMonth: group(rows, (r) => ({ key: r.date.slice(0, 7), label: r.date.slice(0, 7) })).sort((a, b) => (a.key < b.key ? -1 : 1)),
    byCurrency: group(rows, (r) => ({ key: r.currency, label: r.currency })).sort(byMargin),
    mostRenewing: [...clients].sort((a, b) => b.renewals - a.renewals || b.salesMru - a.salesMru).slice(0, 5),
    losses: rows.filter((r) => r.complete && r.marginMru! < -EPS),
    lowMargin: rows.filter((r) => r.complete && r.marginMru! >= -EPS && r.marginPct !== undefined && r.marginPct < minMarginPct),
    unsettled: rows.filter((r) => r.costState === "pending"),
    incomplete: rows.filter((r) => !r.complete),
    cashedMarginMru: cashed,
    approx,
  };
}
