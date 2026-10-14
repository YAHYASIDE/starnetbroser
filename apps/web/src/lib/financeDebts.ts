/**
 * 🧾 «ديون العملاء» and 🏭 «ديون الموردين» (his Oct 9 2026 brief, part 3) - from the same balances the
 * clients / suppliers pages and «أعمار الديون» show (lib/debtAging.ts: payments settle the oldest
 * charges first), never a parallel book.
 *
 * Due dates: the app records none on a debt. The only promised day is a «وعد دفع» (paymentPromises):
 * a debt is «متأخر» only when a promise of it is past its day; otherwise only its AGE is shown, never
 * called late. Suppliers and Starlink have no due date either - their bills are listed by age, and
 * the Starlink renewals coming within 7 days are what will be owed next. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { starlinkCostUsd } from "./accountingStore";
import { daysBetween, type DebtorAging } from "./debtAging";
import { computeSupplierStoreBalance, invoiceTotal, type InvoiceList } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import type { PartyAdjustmentList } from "./partyBalanceStore";
import type { PaymentPromise } from "./paymentPromises";
import { listOpenPreviousDebts, type PreviousDebtList } from "./previousDebt";
import { sumToMru, toMru, type RatesFromUsd } from "./reportsView";

const EPS = 0.005;

export interface FineBuckets {
  d0_7: number;
  d8_30: number;
  d31_60: number;
  d60p: number;
}

export const FINE_BUCKET_LABELS: { key: keyof FineBuckets; label: string }[] = [
  { key: "d0_7", label: "0 - 7 أيام" },
  { key: "d8_30", label: "8 - 30 يومًا" },
  { key: "d31_60", label: "31 - 60 يومًا" },
  { key: "d60p", label: "أكثر من 60 يومًا" },
];

export function fineBuckets(open: { date: string; amount: number }[], today: string): FineBuckets {
  const b: FineBuckets = { d0_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
  for (const c of open) {
    const days = daysBetween(c.date, today);
    if (days <= 7) b.d0_7 += c.amount;
    else if (days <= 30) b.d8_30 += c.amount;
    else if (days <= 60) b.d31_60 += c.amount;
    else b.d60p += c.amount;
  }
  return b;
}

export interface DebtorRow {
  key: string;
  kind: "client" | "device";
  id: string;
  name: string;
  phone?: string;
  currency: string;
  total: number;
  /** أوقية at today's rate (undefined: the currency has no rate). */
  mru?: number;
  buckets: FineBuckets;
  oldestDays: number;
  lastPaymentDate?: string;
  /** Days since he last paid anything (undefined: never paid). */
  daysSincePayment?: number;
  /** Promised and past its day (capped at what he owes in that currency). */
  overdue: number;
  /** Promised for a day still to come. */
  upcoming: number;
  nextDue?: string;
}

export interface CustomerDebts {
  rows: DebtorRow[];
  totalMru: number;
  /** Debtors (a customer owing in two currencies counts once). */
  debtorCount: number;
  avgMru?: number;
  bucketsMru: FineBuckets;
  overdueMru: number;
  upcomingMru: number;
  /** No promise records any due day - «متأخر» can't be said, only age. */
  noDueDates: boolean;
  /** Customers who paid beyond what they owe (a credit kept for them). */
  credits: { key: string; name: string; currency: string; amount: number; mru?: number }[];
  creditsMru: number;
  missing: string[];
}

export function buildCustomerDebts(debtors: DebtorAging[], promises: PaymentPromise[], rates: RatesFromUsd, today: string): CustomerDebts {
  const open = promises.filter((p) => p.status === "open");
  const missing = new Set<string>();
  const rows: DebtorRow[] = [];
  const credits: CustomerDebts["credits"] = [];
  for (const d of debtors) {
    if (d.credit > EPS && d.total <= EPS) {
      const mru = toMru(d.credit, d.currencyCode, rates);
      credits.push({ key: `${d.kind}-${d.id}-${d.currencyCode}`, name: d.name, currency: d.currencyCode, amount: d.credit, mru });
      continue;
    }
    if (d.total <= EPS) continue;
    const mine = d.kind === "client" ? open.filter((p) => p.clientId === d.id && p.currency === d.currencyCode) : [];
    const overdue = Math.min(d.total, mine.filter((p) => p.dueDate < today).reduce((s, p) => s + p.amount, 0));
    const upcomingList = mine.filter((p) => p.dueDate >= today).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const upcoming = Math.min(d.total - overdue, upcomingList.reduce((s, p) => s + p.amount, 0));
    const mru = toMru(d.total, d.currencyCode, rates);
    if (mru === undefined) missing.add(d.currencyCode);
    rows.push({
      key: `${d.kind}-${d.id}-${d.currencyCode}`,
      kind: d.kind,
      id: d.id,
      name: d.name,
      phone: d.phone,
      currency: d.currencyCode,
      total: d.total,
      mru,
      buckets: fineBuckets(d.open, today),
      oldestDays: d.oldestDays,
      lastPaymentDate: d.lastPaymentDate,
      daysSincePayment: d.lastPaymentDate ? daysBetween(d.lastPaymentDate, today) : undefined,
      overdue,
      upcoming,
      nextDue: upcomingList[0]?.dueDate,
    });
  }
  rows.sort((a, b) => (b.mru ?? 0) - (a.mru ?? 0));
  const scale = (r: DebtorRow, v: number) => (r.mru !== undefined && r.total > 0 ? (v / r.total) * r.mru : 0);
  const bucketsMru: FineBuckets = { d0_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
  let total = 0;
  let overdueMru = 0;
  let upcomingMru = 0;
  for (const r of rows) {
    total += r.mru ?? 0;
    overdueMru += scale(r, r.overdue);
    upcomingMru += scale(r, r.upcoming);
    for (const k of Object.keys(bucketsMru) as (keyof FineBuckets)[]) bucketsMru[k] += scale(r, r.buckets[k]);
  }
  const debtorCount = new Set(rows.map((r) => `${r.kind}-${r.id}`)).size;
  return {
    rows,
    totalMru: total,
    debtorCount,
    avgMru: debtorCount ? total / debtorCount : undefined,
    bucketsMru,
    overdueMru,
    upcomingMru,
    noDueDates: open.length === 0,
    credits: credits.sort((a, b) => (b.mru ?? 0) - (a.mru ?? 0)),
    creditsMru: credits.reduce((s, c) => s + (c.mru ?? 0), 0),
    missing: [...missing],
  };
}

// ---- 🏭 Suppliers (store) + Starlink ----

export interface SupplierRow {
  id: string;
  name: string;
  /** What I owe now, per currency (> 0 only). */
  owed: Record<string, number>;
  owedMru: number;
  /** What I owed at the end of the compared period. */
  owedBeforeMru: number;
  /** Paid to him in the period (purchase invoices paid + his balance entries that moved money). */
  paidMru: number;
  /** New debt to him in the period (purchases left unpaid + «له» entries with no money moved). */
  newMru: number;
}

export interface StarlinkOwedRow {
  entryId: string;
  accountId: string;
  device: string;
  date: string;
  ageDays: number;
  usd: number;
  /** An earlier owner's debt (previousDebt.ts), not one of his renewals. */
  previous?: boolean;
}

export interface SupplierDebts {
  suppliers: SupplierRow[];
  storeOwedMru: number;
  storeOwedBeforeMru: number;
  storePaidMru: number;
  storeNewMru: number;
  starlink: StarlinkOwedRow[];
  starlinkUsd: number;
  starlinkMru?: number;
  /** Open at the end of the compared period (renewals recorded by then, not yet paid by then). */
  starlinkBeforeUsd: number;
  /** Starlink costs paid in the period (renewals settled with their payment day in it). */
  starlinkPaidUsd: number;
  starlinkPaidCount: number;
  /** Devices ending within 7 days whose monthly price says what Starlink will charge next. */
  upcoming: { accountId: string; device: string; days: number; usd?: number; amount: number; currency: string }[];
  upcomingUsd: number;
  missing: string[];
}

export function buildSupplierDebts(input: {
  suppliers: { id: string; name: string }[];
  invoices: InvoiceList;
  adjustments: PartyAdjustmentList;
  ledger: LedgerByAccount;
  previousDebts: PreviousDebtList;
  accounts: StarlinkAccountSummary[];
  rates: RatesFromUsd;
  range: { from: string; to: string };
  previous: { from: string; to: string };
  today: string;
}): SupplierDebts {
  const { rates, range } = input;
  const missing = new Set<string>();
  const mruOf = (byCurrency: Record<string, number>) => {
    const r = sumToMru(byCurrency, rates);
    r.missing.forEach((c) => missing.add(c));
    return r.mru;
  };
  const inRange = (d: string) => d >= range.from && d <= range.to;
  const suppliers: SupplierRow[] = [];
  for (const s of input.suppliers) {
    const owed: Record<string, number> = {};
    for (const [code, v] of Object.entries(computeSupplierStoreBalance(input.invoices, s.id, input.adjustments))) if (v > EPS) owed[code] = v;
    const before: Record<string, number> = {};
    const upTo = input.previous.to;
    for (const [code, v] of Object.entries(computeSupplierStoreBalance(input.invoices.filter((i) => i.date <= upTo), s.id, input.adjustments.filter((a) => a.date <= upTo)))) if (v > EPS) before[code] = v;
    const paid: Record<string, number> = {};
    const fresh: Record<string, number> = {};
    for (const inv of input.invoices) {
      if (inv.kind !== "purchase" || inv.returnOfInvoiceId || inv.supplierId !== s.id || !inRange(inv.date)) continue;
      if (inv.paidAmount > 0) paid[inv.currencyCode] = (paid[inv.currencyCode] ?? 0) + inv.paidAmount;
      const left = invoiceTotal(inv) - inv.paidAmount;
      if (left > EPS) fresh[inv.currencyCode] = (fresh[inv.currencyCode] ?? 0) + left;
    }
    for (const a of input.adjustments) {
      if (a.partyKind !== "supplier" || a.partyId !== s.id || !inRange(a.date)) continue;
      const moved = a.cashMoved || Boolean(a.accountId);
      if (a.direction === "owesUs" && moved) paid[a.currencyCode] = (paid[a.currencyCode] ?? 0) + a.amount;
      else if (a.direction === "weOwe" && !moved) fresh[a.currencyCode] = (fresh[a.currencyCode] ?? 0) + a.amount;
    }
    const row: SupplierRow = { id: s.id, name: s.name, owed, owedMru: mruOf(owed), owedBeforeMru: mruOf(before), paidMru: mruOf(paid), newMru: mruOf(fresh) };
    if (row.owedMru > EPS || row.owedBeforeMru > EPS || row.paidMru > EPS || row.newMru > EPS) suppliers.push(row);
  }
  suppliers.sort((a, b) => b.owedMru - a.owedMru);

  const deviceName = (id: string) => input.accounts.find((a) => a.id === id)?.name ?? "جهاز محذوف";
  const starlink: StarlinkOwedRow[] = [];
  let beforeUsd = 0;
  let paidUsd = 0;
  let paidCount = 0;
  for (const [accountId, entries] of Object.entries(input.ledger)) {
    for (const e of entries) {
      if (e.kind !== "debit" || !e.starlinkCost) continue;
      const usd = starlinkCostUsd(e);
      if (usd === undefined || usd <= EPS) continue;
      const cost = e.starlinkCost;
      if (cost.status === "pending") starlink.push({ entryId: e.id, accountId, device: deviceName(accountId), date: e.date, ageDays: daysBetween(e.date, input.today), usd });
      if (cost.status === "settled" && cost.paidAt && inRange(cost.paidAt)) {
        paidUsd += usd;
        paidCount += 1;
      }
      const openThen = e.date <= input.previous.to && (cost.status === "pending" || (cost.paidAt !== undefined && cost.paidAt > input.previous.to));
      if (openThen) beforeUsd += usd;
    }
  }
  // An earlier owner's debt was open at the end of the compared period when recorded by then and
  // paid (by the shipment carrying its id) only after it - or not yet.
  const paidOn = new Map<string, string>();
  for (const entries of Object.values(input.ledger)) for (const e of entries) if (e.previousDebtId) paidOn.set(e.previousDebtId, e.date);
  for (const d of input.previousDebts) {
    const paid = paidOn.get(d.id);
    if (d.date <= input.previous.to && (!paid || paid > input.previous.to)) beforeUsd += d.amountUsd;
  }
  for (const d of listOpenPreviousDebts(input.previousDebts, input.ledger)) {
    starlink.push({ entryId: d.id, accountId: d.accountId, device: deviceName(d.accountId), date: d.date, ageDays: daysBetween(d.date, input.today), usd: d.amountUsd, previous: true });
  }
  starlink.sort((a, b) => b.ageDays - a.ageDays);
  const starlinkUsd = starlink.reduce((s, r) => s + r.usd, 0);

  const upcoming: SupplierDebts["upcoming"] = [];
  for (const a of input.accounts) {
    if (a.archivedAt || a.deletedAt || !a.renewalPlan) continue;
    const day = (a.rechargeDate || a.standbyDate || "").replace(/\//g, "-").slice(0, 10);
    const t = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(t)) continue;
    const days = Math.round((t - Date.parse(`${input.today}T00:00:00Z`)) / 86_400_000);
    if (days < 0 || days > 7) continue;
    const plan = a.renewalPlan;
    const usd = plan.costCurrency === "USD" ? plan.costAmount : rates[plan.costCurrency] ? plan.costAmount / rates[plan.costCurrency]! : undefined;
    upcoming.push({ accountId: a.id, device: a.name, days, usd, amount: plan.costAmount, currency: plan.costCurrency });
  }
  upcoming.sort((a, b) => a.days - b.days);

  return {
    suppliers,
    storeOwedMru: suppliers.reduce((s, r) => s + r.owedMru, 0),
    storeOwedBeforeMru: suppliers.reduce((s, r) => s + r.owedBeforeMru, 0),
    storePaidMru: suppliers.reduce((s, r) => s + r.paidMru, 0),
    storeNewMru: suppliers.reduce((s, r) => s + r.newMru, 0),
    starlink,
    starlinkUsd,
    starlinkMru: rates.MRU ? starlinkUsd * rates.MRU : undefined,
    starlinkBeforeUsd: beforeUsd,
    starlinkPaidUsd: paidUsd,
    starlinkPaidCount: paidCount,
    upcoming,
    upcomingUsd: upcoming.reduce((s, u) => s + (u.usd ?? 0), 0),
    missing: [...missing],
  };
}
