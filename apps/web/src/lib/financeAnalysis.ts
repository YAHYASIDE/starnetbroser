/**
 * 📊 The financial dashboard, phase 2 (his Oct 9 2026 brief, sections 5, 6, 8, 10): where the money
 * came from, the Starlink renewals' analysis, customers' debts against collections, the ratios the
 * rings draw, and the goals + alerts. Same rules as lib/financeDashboard.ts: أوقية (≈ where today's
 * rate is used), never a number without its data, and these separations:
 * - money IN (a payment, a store sale paid at the till, a rep's handover, a manual «داخل») is not
 *   revenue; a sale on credit is not money in - it is shown apart («مبيعات بالدين»).
 * - a rep's handover is counted once: the part that paid his customers' devices is a device payment
 *   (`heldByRepId`), only the remainder is a settlement (lib/repClientsSave.ts).
 * - refunds / cancellations are not recorded in the app - nothing is shown for them, and the screen
 *   says so.
 * Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { shipmentProfitDate } from "./accountingStore";
import type { CashEntryList } from "./cashStore";
import { daysRemainingNumber } from "./date";
import { invoiceTotal, type InvoiceList } from "./invoiceStore";
import { isShipmentEntry, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type LedgerByAccount, type PaymentMethod } from "./ledgerStore";
import { partyAdjustmentCashKind, type PartyAdjustmentList } from "./partyBalanceStore";
import type { RepSettlementList } from "./repStore";
import { rankClientProfits, rankDeviceProfits, toMru, type RatesFromUsd } from "./reportsView";
import { listOpenShipmentDebts } from "./starlinkDebt";
import type { DateRange, PeriodMetrics } from "./financeDashboard";
import { changePct } from "./financeDashboard";

export interface MoneyInput {
  /** Every record (hidden profit days still happened). */
  ledger: LedgerByAccount;
  invoices: InvoiceList;
  adjustments: PartyAdjustmentList;
  settlements: RepSettlementList;
  cash: CashEntryList;
  rates: RatesFromUsd;
}

const inRange = (date: string, range: DateRange) => date >= range.from && date <= range.to;

class MruSum {
  mru = 0;
  approx = false;
  missing = new Set<string>();
  add(amount: number, currency: string, rates: RatesFromUsd): number | undefined {
    const value = toMru(amount, currency, rates);
    if (value === undefined) {
      this.missing.add(currency);
      return undefined;
    }
    if (currency !== "MRU") this.approx = true;
    this.mru += value;
    return value;
  }
}

// ---- 6. Money sources ----

export type SourceKey = `method:${PaymentMethod}` | "method:other" | "rep" | "store" | "manual";

export const SOURCE_ORDER: SourceKey[] = [...PAYMENT_METHODS.map((m) => `method:${m}` as SourceKey), "method:other", "rep", "store", "manual"];

export function sourceLabel(key: SourceKey): string {
  if (key === "rep") return "🤝 تسليم المندوبين";
  if (key === "store") return "🛍️ المتجر (عند البيع)";
  if (key === "manual") return "📥 قيود «داخل» يدوية";
  if (key === "method:other") return "بدون وسيلة";
  return PAYMENT_METHOD_LABELS[key.slice(7) as PaymentMethod];
}

export interface SourceRow {
  key: SourceKey;
  label: string;
  mru: number;
  count: number;
  previousMru: number;
  /** Share of all money in, %. */
  share: number;
  /** % change vs the previous period (null without a positive base). */
  changePct: number | null;
}

export interface MoneySources {
  rows: SourceRow[];
  totalMru: number;
  previousTotalMru: number;
  /** Sold on credit in the period (renewals, registrations, store invoices unpaid) - NOT money in. */
  creditSalesMru: number;
  approx: boolean;
  missing: string[];
}

function collectSources(input: MoneyInput, range: DateRange): { by: Map<SourceKey, { mru: number; count: number }>; sum: MruSum; credit: MruSum } {
  const by = new Map<SourceKey, { mru: number; count: number }>();
  const sum = new MruSum();
  const credit = new MruSum();
  const put = (key: SourceKey, amount: number, currency: string) => {
    const value = sum.add(amount, currency, input.rates);
    if (value === undefined) return;
    const row = by.get(key) ?? { mru: 0, count: 0 };
    row.mru += value;
    row.count += 1;
    by.set(key, row);
  };
  for (const entries of Object.values(input.ledger)) {
    for (const e of entries) {
      if (!inRange(e.date, range)) continue;
      if (e.kind === "credit") put(e.heldByRepId ? "rep" : e.paymentMethod ? `method:${e.paymentMethod}` : "method:other", e.amount, e.currency);
      else credit.add(e.amount, e.currency, input.rates);
    }
  }
  for (const a of input.adjustments) {
    if (!inRange(a.date, range) || a.partyKind !== "client") continue;
    if (a.cashMoved && partyAdjustmentCashKind(a.partyKind, a.direction) === "in") put(a.paymentMethod ? `method:${a.paymentMethod}` : "method:other", a.amount, a.currencyCode);
  }
  for (const s of input.settlements) {
    if (s.kind === "cashHandover" && inRange(s.date, range)) put("rep", s.amount, s.currencyCode);
  }
  for (const inv of input.invoices) {
    if (inv.kind !== "sale" || inv.returnOfInvoiceId || !inRange(inv.date, range)) continue;
    if (inv.paidAmount > 0) put("store", inv.paidAmount, inv.currencyCode);
    const unpaid = invoiceTotal(inv) - inv.paidAmount;
    if (unpaid > 0.005) credit.add(unpaid, inv.currencyCode, input.rates);
  }
  for (const c of input.cash) {
    if (c.kind === "in" && !c.sourceKind && inRange(c.date, range)) put("manual", c.amount, c.currencyCode);
  }
  return { by, sum, credit };
}

export function buildMoneySources(input: MoneyInput, range: DateRange, previous: DateRange): MoneySources {
  const now = collectSources(input, range);
  const before = collectSources(input, previous);
  const total = now.sum.mru;
  const rows: SourceRow[] = SOURCE_ORDER.filter((key) => now.by.has(key) || before.by.has(key)).map((key) => {
    const cur = now.by.get(key) ?? { mru: 0, count: 0 };
    const prev = before.by.get(key)?.mru ?? 0;
    return { key, label: sourceLabel(key), mru: cur.mru, count: cur.count, previousMru: prev, share: total > 0 ? (cur.mru / total) * 100 : 0, changePct: changePct(cur.mru, prev) };
  });
  return {
    rows: rows.sort((a, b) => b.mru - a.mru),
    totalMru: total,
    previousTotalMru: before.sum.mru,
    creditSalesMru: now.credit.mru,
    approx: now.sum.approx || now.credit.approx,
    missing: [...new Set([...now.sum.missing, ...now.credit.missing])],
  };
}

// ---- 8. Starlink renewals ----

export interface RankRow {
  id: string;
  name: string;
  value: number;
  count: number;
}

export interface StarlinkAnalysis {
  /** Renewals whose Starlink cost was settled in the period (realized). */
  realizedCount: number;
  realizedProfitMru: number;
  costMru: number;
  salesMru: number;
  /** Renewals of the period still owing Starlink: expected margin, NOT profit. */
  pendingCount: number;
  pendingProfitMru: number;
  /** Renewals of the period whose Starlink cost is paid vs still owed. */
  periodSettled: number;
  periodPending: number;
  /** Right now: every renewal still owing Starlink. */
  openDCount: number;
  openDMru?: number;
  avgProfitMru?: number;
  topDevices: RankRow[];
  topClients: RankRow[];
  /** Devices ending within 7 days (0 = stopped this midnight), soonest first. */
  expiringSoon: { id: string; name: string; days: number }[];
}

export function buildStarlinkAnalysis(
  metrics: PeriodMetrics,
  profitLedger: LedgerByAccount,
  activityLedger: LedgerByAccount,
  accounts: StarlinkAccountSummary[],
  clientName: (clientId: string) => string | undefined,
  rates: RatesFromUsd,
): StarlinkAnalysis {
  const range = metrics.range;
  const mruRate = rates.MRU;
  const inPeriod: LedgerByAccount = {};
  for (const [id, entries] of Object.entries(profitLedger)) {
    const list = entries.filter((e) => e.kind === "debit" && e.starlinkCost?.status === "settled" && inRange(shipmentProfitDate(e), range));
    if (list.length) inPeriod[id] = list;
  }
  const devices = mruRate ? rankDeviceProfits(inPeriod, mruRate) : [];
  const deviceName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "جهاز محذوف";
  const clientOf = (id: string) => accounts.find((a) => a.id === id)?.clientId;
  const clients = rankClientProfits(devices, clientOf);
  let periodSettled = 0;
  let periodPending = 0;
  for (const entries of Object.values(activityLedger)) {
    for (const e of entries) {
      if (!isShipmentEntry(e) || e.previousDebtId || !inRange(e.date, range) || !e.starlinkCost) continue;
      if (e.starlinkCost.status === "settled") periodSettled += 1;
      else if (e.starlinkCost.status === "pending") periodPending += 1;
    }
  }
  const open = listOpenShipmentDebts(activityLedger);
  const openUsd = open.reduce((sum, d) => sum + d.costUsd, 0);
  const expiringSoon = accounts
    .filter((a) => !a.archivedAt && !a.deletedAt)
    .map((a) => ({ id: a.id, name: a.name, days: daysRemainingNumber(a.rechargeDate || a.standbyDate) }))
    .filter((r): r is { id: string; name: string; days: number } => r.days !== null && r.days >= 0 && r.days <= 7)
    .sort((a, b) => a.days - b.days);
  return {
    realizedCount: metrics.net.starlinkShipments,
    realizedProfitMru: metrics.net.starlinkProfitMru,
    costMru: metrics.net.starlinkCostMru,
    salesMru: metrics.net.starlinkSalesMru,
    pendingCount: metrics.pendingCount,
    pendingProfitMru: metrics.pendingProfitMru,
    periodSettled,
    periodPending,
    openDCount: open.length,
    openDMru: mruRate ? openUsd * mruRate : undefined,
    avgProfitMru: metrics.avgProfitPerRenewalMru,
    topDevices: devices.slice(0, 5).map((d) => ({ id: d.accountId, name: deviceName(d.accountId), value: d.profitMru, count: d.shipments })),
    // Count = his devices that made the profit (devices without a customer are grouped apart).
    topClients: clients
      .filter((c) => c.clientId)
      .slice(0, 5)
      .map((c) => ({ id: c.clientId!, name: clientName(c.clientId!) ?? "زبون", value: c.profitMru, count: c.devices })),
    expiringSoon,
  };
}

// ---- Customers' debts and collections ----

export interface DebtFlow {
  /** New debt in the period: renewals / registrations recorded on the devices, store sales left
   * unpaid, manual «عليه» on customers (no money moved). */
  newDebtMru: number;
  /** Paid against debt in the period: device payments + customers' recorded payments. */
  collectedMru: number;
  /** collected ÷ new debt × 100 - only with new debt. */
  ratioPct?: number;
  /** Paid to suppliers in the period (recorded supplier payments that moved money). */
  paidSuppliersMru: number;
  approx: boolean;
}

export function buildDebtFlow(input: MoneyInput, range: DateRange): DebtFlow {
  const debt = new MruSum();
  const paid = new MruSum();
  const suppliers = new MruSum();
  for (const entries of Object.values(input.ledger)) {
    for (const e of entries) {
      if (!inRange(e.date, range)) continue;
      if (e.kind === "debit") debt.add(e.amount, e.currency, input.rates);
      else paid.add(e.amount, e.currency, input.rates);
    }
  }
  for (const inv of input.invoices) {
    if (inv.kind !== "sale" || inv.returnOfInvoiceId || !inRange(inv.date, range)) continue;
    const unpaid = invoiceTotal(inv) - inv.paidAmount;
    if (unpaid > 0.005) debt.add(unpaid, inv.currencyCode, input.rates);
  }
  for (const a of input.adjustments) {
    if (!inRange(a.date, range)) continue;
    const kind = partyAdjustmentCashKind(a.partyKind, a.direction);
    if (a.partyKind === "client") {
      if (a.cashMoved && kind === "in") paid.add(a.amount, a.currencyCode, input.rates);
      else if (!a.cashMoved && a.direction === "owesUs") debt.add(a.amount, a.currencyCode, input.rates);
    } else if (a.cashMoved && kind === "out") {
      suppliers.add(a.amount, a.currencyCode, input.rates);
    }
  }
  return {
    newDebtMru: debt.mru,
    collectedMru: paid.mru,
    ratioPct: debt.mru > 0 ? (paid.mru / debt.mru) * 100 : undefined,
    paidSuppliersMru: suppliers.mru,
    approx: debt.approx || paid.approx || suppliers.approx,
  };
}

// ---- 10. Goals and alerts ----

/** The money goals (أوقية) kept with «🎯 أهداف الشهر» (lib/goals.ts). */
export interface MoneyGoals {
  profitDayMru?: number;
  profitWeekMru?: number;
  profitMonthMru?: number;
  profitYearMru?: number;
  collectionDayMru?: number;
  collectionMonthMru?: number;
  expensesMaxMru?: number;
  newDebtsMaxMru?: number;
  /** A ceiling on what customers owe right now. */
  openDebtsMaxMru?: number;
}

export interface GoalItem {
  key: keyof MoneyGoals;
  label: string;
  target: number;
  done: number;
  /** A ceiling (expenses, new debts): staying under is good. */
  ceiling: boolean;
  ratio: number;
  status: "progress" | "near" | "done" | "over";
}

export function buildGoalItems(goals: MoneyGoals, day: PeriodMetrics, month: PeriodMetrics, monthDebt: DebtFlow): GoalItem[] {
  const items: GoalItem[] = [];
  const push = (key: keyof MoneyGoals, label: string, done: number, ceiling = false) => {
    const target = goals[key];
    if (!target || !(target > 0)) return;
    const ratio = done / target;
    const status: GoalItem["status"] = ceiling ? (ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "progress") : ratio >= 1 ? "done" : ratio >= 0.8 ? "near" : "progress";
    items.push({ key, label, target, done, ceiling, ratio, status });
  };
  push("profitDayMru", "ربح اليوم", day.netMru);
  push("profitMonthMru", "ربح الشهر", month.netMru);
  push("collectionMonthMru", "تحصيل الشهر", month.collectedMru);
  push("expensesMaxMru", "حد مصروفات الشهر", month.expensesMru, true);
  push("newDebtsMaxMru", "حد الديون الجديدة هذا الشهر", monthDebt.newDebtMru, true);
  return items;
}

export interface DashAlert {
  key: string;
  tone: "good" | "warn" | "bad";
  text: string;
}

function fmt(value: number): string {
  return `${value < 0 ? "-" : ""}${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

/** Every alert comes from the records - none is a fixed message. */
export function buildAlerts(input: {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  previousLabel: string;
  debt: DebtFlow;
  openDCount: number;
  openDMru?: number;
  goals: GoalItem[];
}): DashAlert[] {
  const { current, previous } = input;
  const alerts: DashAlert[] = [];
  const drop = changePct(current.netMru, previous.netMru);
  if (drop !== null && drop <= -20) alerts.push({ key: "profit-drop", tone: "bad", text: `📉 صافي الربح أقل بـ ${Math.round(-drop)}% من ${input.previousLabel} (${fmt(current.netMru)} مقابل ${fmt(previous.netMru)} أوقية).` });
  const rise = changePct(current.expensesMru, previous.expensesMru);
  if (rise !== null && rise >= 30 && current.expensesMru - previous.expensesMru >= 1000) alerts.push({ key: "expenses-up", tone: "warn", text: `🧾 المصروفات أعلى بـ ${Math.round(rise)}% من ${input.previousLabel} (${fmt(current.expensesMru)} مقابل ${fmt(previous.expensesMru)} أوقية).` });
  if (input.debt.newDebtMru > 0 && input.debt.newDebtMru - input.debt.collectedMru >= 1000) alerts.push({ key: "debts-up", tone: "warn", text: `🧾 الديون الجديدة أكثر من التحصيل بـ ${fmt(input.debt.newDebtMru - input.debt.collectedMru)} أوقية في هذه الفترة.` });
  if (input.openDCount >= 3) alerts.push({ key: "starlink-owed", tone: "warn", text: `📡 عليك لستارلينك ${input.openDCount} تجديدًا غير مسدد${input.openDMru !== undefined ? ` (≈ ${fmt(input.openDMru)} أوقية)` : ""} - أرباحها معلّقة حتى تسدّدها.` });
  for (const g of input.goals) {
    if (g.status === "done") alerts.push({ key: `goal-${g.key}`, tone: "good", text: `🎉 تحقق هدف «${g.label}»: ${fmt(g.done)} من ${fmt(g.target)} أوقية.` });
    else if (g.status === "near" && !g.ceiling) alerts.push({ key: `goal-${g.key}`, tone: "good", text: `🎯 اقتربت من هدف «${g.label}»: ${Math.round(g.ratio * 100)}% (${fmt(g.done)} من ${fmt(g.target)}).` });
    else if (g.status === "near" && g.ceiling) alerts.push({ key: `goal-${g.key}`, tone: "warn", text: `⚠️ «${g.label}» عند ${Math.round(g.ratio * 100)}% من الحد (${fmt(g.done)} من ${fmt(g.target)}).` });
    else if (g.status === "over") alerts.push({ key: `goal-${g.key}`, tone: "bad", text: `⛔ تجاوزت «${g.label}»: ${fmt(g.done)} والحد ${fmt(g.target)} أوقية.` });
  }
  return alerts;
}
