/**
 * أعمار الديون: how old each party's outstanding debt is. Payments settle the OLDEST charges
 * first (FIFO), so whatever remains is the newest part of the debt, and its age is counted from
 * each remaining charge's own date. Per currency, never mixed.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildClientCombinedStatement } from "./clientAccount";
import type { InvoiceList } from "./invoiceStore";
import { getAccountEntries, LedgerByAccount } from "./ledgerStore";
import type { PartyAdjustment } from "./partyBalanceStore";

export interface DebtMovement {
  /** yyyy-mm-dd */
  date: string;
  /** Positive = a new charge (the party owes more), negative = a payment/credit. */
  delta: number;
}

export interface AgingBuckets {
  /** 0-30 days */
  fresh: number;
  /** 31-60 days */
  late: number;
  /** more than 60 days */
  overdue: number;
}

export interface DebtAge {
  total: number;
  buckets: AgingBuckets;
  /** Age in days of the oldest still-unpaid charge (0 when nothing is owed). */
  oldestDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.0001;

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.replace(/\//g, "-")}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

export function ageDebt(movements: DebtMovement[], today: string): DebtAge {
  const sorted = [...movements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const open: { date: string; amount: number }[] = [];
  let credit = 0;
  for (const m of sorted) {
    if (m.delta > 0) {
      let amount = m.delta;
      // Credit carried from an earlier overpayment settles this charge straight away.
      const used = Math.min(credit, amount);
      credit -= used;
      amount -= used;
      if (amount > EPSILON) open.push({ date: m.date, amount });
    } else if (m.delta < 0) {
      let payment = -m.delta;
      while (payment > EPSILON && open.length > 0) {
        const oldest = open[0]!;
        const used = Math.min(oldest.amount, payment);
        oldest.amount -= used;
        payment -= used;
        if (oldest.amount <= EPSILON) open.shift();
      }
      credit += payment;
    }
  }
  const buckets: AgingBuckets = { fresh: 0, late: 0, overdue: 0 };
  let total = 0;
  let oldestDays = 0;
  for (const charge of open) {
    const days = daysBetween(charge.date, today);
    total += charge.amount;
    oldestDays = Math.max(oldestDays, days);
    if (days <= 30) buckets.fresh += charge.amount;
    else if (days <= 60) buckets.late += charge.amount;
    else buckets.overdue += charge.amount;
  }
  return { total, buckets, oldestDays };
}

export interface DebtorAging extends DebtAge {
  kind: "client" | "device";
  id: string;
  name: string;
  phone?: string;
  currencyCode: string;
}

/** Every client (store + linked devices together) and every device with no client, per currency,
 * that still owes something - oldest debt first, then biggest. */
export function computeDebtAging(input: {
  clients: { id: string; name: string; phone?: string }[];
  accounts: StarlinkAccountSummary[];
  invoices: InvoiceList;
  adjustments: PartyAdjustment[];
  ledgerStore: LedgerByAccount;
  today: string;
}): DebtorAging[] {
  const result: DebtorAging[] = [];
  const active = input.accounts.filter((a) => !a.deletedAt);
  const byCurrency = (rows: { currencyCode: string; date: string; delta: number }[]) => {
    const map = new Map<string, DebtMovement[]>();
    for (const row of rows) {
      const list = map.get(row.currencyCode) ?? [];
      list.push({ date: row.date, delta: row.delta });
      map.set(row.currencyCode, list);
    }
    return map;
  };

  for (const client of input.clients) {
    const devices = active.filter((a) => a.clientId === client.id);
    const rows = buildClientCombinedStatement(input.invoices, input.adjustments, client.id, devices, input.ledgerStore);
    for (const [currencyCode, movements] of byCurrency(rows)) {
      const age = ageDebt(movements, input.today);
      if (age.total > EPSILON) result.push({ kind: "client", id: client.id, name: client.name, phone: client.phone, currencyCode, ...age });
    }
  }

  const clientIds = new Set(input.clients.map((c) => c.id));
  for (const account of active) {
    if (account.clientId && clientIds.has(account.clientId)) continue;
    const rows = getAccountEntries(input.ledgerStore, account.id).map((e) => ({
      currencyCode: e.currency,
      date: e.date,
      delta: e.kind === "debit" ? e.amount : -e.amount,
    }));
    for (const [currencyCode, movements] of byCurrency(rows)) {
      const age = ageDebt(movements, input.today);
      if (age.total > EPSILON) result.push({ kind: "device", id: account.id, name: account.name, phone: account.phone, currencyCode, ...age });
    }
  }

  return result.sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total);
}

/** Per currency, the sum of every debtor's buckets. */
export function totalAgingByCurrency(debtors: DebtorAging[]): Record<string, AgingBuckets> {
  const totals: Record<string, AgingBuckets> = {};
  for (const d of debtors) {
    const t = (totals[d.currencyCode] ??= { fresh: 0, late: 0, overdue: 0 });
    t.fresh += d.buckets.fresh;
    t.late += d.buckets.late;
    t.overdue += d.buckets.overdue;
  }
  return totals;
}

/** "منذ …" wording with correct Arabic number agreement. */
export function daysAgoLabel(days: number): string {
  if (days <= 0) return "اليوم";
  if (days === 1) return "منذ يوم واحد";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يومًا`;
}
