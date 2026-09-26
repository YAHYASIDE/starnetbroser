/**
 * A representative's account as one running balance (per currency, never mixed): the reset
 * ("تصفير الحساب") cut-off, the professional period statement (today / a month / any range) with
 * opening and closing balances, per-shipment share edits, and deleting a representative. Pure
 * functions only - the page wires them to storage.
 *
 * Balance convention: positive = we owe the representative, negative = he owes us.
 *   device shipment  + his confirmed share (USD; a shared loss is negative)
 *   store invoice    + his commission, − the cash he collected on it
 *   commissionPayout − (we paid him)          cashHandover + (he handed us the cash)
 *   manualCredit     + (bonus)                manualDebit  − (advance/سلفة)
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Invoice } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import { shipmentProfitDate } from "./accountingStore";
import type {
  RepDeviceCommissionRow,
  Representative,
  RepResetPoint,
  RepSettlementKind,
  RepSettlementList,
  RepStatementDay,
  RepStatementRow,
} from "./repStore";

const EPSILON = 0.000001;

// ---- Reset (بداية جديدة من تاريخ) ----

/** A reset on today's date starts from this very moment (today's earlier records go to the
 * archive); a reset on an earlier date keeps that whole day. */
export function makeRepResetPoint(date: string, now: Date = new Date()): RepResetPoint {
  const today = localDate(now);
  return { date, at: date === today ? now.toISOString() : "" };
}

export function isAfterRepReset(reset: RepResetPoint | undefined, record: { date: string; createdAt: string }): boolean {
  if (!reset) return true;
  if (record.date !== reset.date) return record.date > reset.date;
  return record.createdAt > reset.at;
}

export interface RepRecords {
  deviceRows: RepDeviceCommissionRow[];
  invoices: Invoice[];
  settlements: RepSettlementList;
}

/** Keeps only this rep's records on one side of his reset point - "active" (after it, what the
 * balances and statement use) or "archive" (before it). Other reps' invoices/settlements pass
 * through untouched, so the result can be fed straight into repStore's balance functions. */
export function splitRepRecords(rep: Representative, records: RepRecords, side: "active" | "archive"): RepRecords {
  const keep = (r: { date: string; createdAt: string }) => isAfterRepReset(rep.resetFrom, r) === (side === "active");
  return {
    deviceRows: records.deviceRows.filter((row) => keep({ date: shipmentProfitDate(row.entry), createdAt: row.entry.createdAt })),
    invoices: records.invoices.filter((inv) => inv.representativeId !== rep.id || keep(inv)),
    settlements: records.settlements.filter((s) => s.representativeId !== rep.id || keep(s)),
  };
}

// ---- Display currency ----

/** Turns an amount in `fromCode` into the currencies the operator chose to see (أوقية, سيفا or
 * both), per currency code. `locked` = rates locked on the record itself (a shipment's profit
 * rates, a settlement's rates), preferred over today's. */
export type RepConvert = (amount: number, fromCode: string, locked?: Record<string, number>) => Record<string, number>;

/** No conversion: every amount stays in its own currency. */
export const keepCurrency: RepConvert = (amount, fromCode) => ({ [fromCode]: amount });

/** Rates are "units per 1 USD" (currencyStore.ts). A currency without any known rate is left in
 * its own currency rather than guessed. */
export function makeRepConverter(codes: string[], currentRates: Record<string, number | undefined>): RepConvert {
  const rateOf = (code: string, locked?: Record<string, number>) =>
    code === "USD" ? 1 : (locked?.[code] ?? currentRates[code]);
  return (amount, fromCode, locked) => {
    const result: Record<string, number> = {};
    for (const code of codes) {
      if (code === fromCode) {
        result[code] = amount;
        continue;
      }
      const from = rateOf(fromCode, locked);
      const to = rateOf(code, locked);
      if (!from || !to) return { [fromCode]: amount };
      result[code] = (amount / from) * to;
    }
    return result;
  };
}

// ---- Running balance and period statement ----

const SETTLEMENT_SIGN: Record<RepSettlementKind, 1 | -1> = {
  commissionPayout: -1,
  cashHandover: 1,
  manualCredit: 1,
  manualDebit: -1,
};

/** What one statement row does to his balance, per currency (positive = we owe him more) - in
 * each record's own currency, or in the chosen display currencies through `convert`. */
export function repRowDelta(row: RepStatementRow, convert: RepConvert = keepCurrency): Record<string, number> {
  if (row.type === "device") {
    const share = row.row.repShareUsd;
    return share !== undefined && Math.abs(share) > EPSILON ? convert(share, "USD", row.row.entry.profitCurrencyRates) : {};
  }
  if (row.type === "invoice") {
    const net = row.row.commissionAmount - Math.max(0, row.row.invoice.paidAmount);
    return Math.abs(net) > EPSILON ? convert(net, row.row.invoice.currencyCode) : {};
  }
  const s = row.settlement;
  return convert(SETTLEMENT_SIGN[s.kind] * s.amount, s.currencyCode, s.rates);
}

export type RepPeriodKind = "all" | "day" | "month" | "custom";

export interface RepPeriod {
  /** yyyy-mm-dd, inclusive; unset = from the beginning. */
  from?: string;
  /** yyyy-mm-dd, inclusive; unset = up to now. */
  to?: string;
}

export function repPeriod(kind: RepPeriodKind, today: string, custom: RepPeriod = {}): RepPeriod {
  if (kind === "day") return { from: today, to: today };
  if (kind === "month") return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-31` };
  if (kind === "custom") return { from: custom.from || undefined, to: custom.to || undefined };
  return {};
}

export interface RepPeriodTotals {
  /** Device profit and its split, USD, confirmed shipments only. */
  deviceProfitUsd: number;
  repShareUsd: number;
  ourShareUsd: number;
  /** The same three, in the display currencies (each shipment at its own locked rates). */
  deviceProfit: Record<string, number>;
  repShare: Record<string, number>;
  ourShare: Record<string, number>;
  deviceCount: number;
  pendingCount: number;
  /** Store commissions and the cash he collected on those sales. */
  commissions: Record<string, number>;
  cashCollected: Record<string, number>;
  /** Settlements by kind, per currency. */
  settled: Record<RepSettlementKind, Record<string, number>>;
}

export interface RepPeriodStatement {
  days: RepStatementDay[];
  /** Balance before the period's first day (zero with no `from`). */
  opening: Record<string, number>;
  /** Balance at the end of the period. */
  closing: Record<string, number>;
  totals: RepPeriodTotals;
  /** Balance right after each row (newest-first lists read it top-down), keyed by row type+id. */
  balanceAfter: Record<string, Record<string, number>>;
}

function add(target: Record<string, number>, delta: Record<string, number>) {
  for (const [code, value] of Object.entries(delta)) target[code] = (target[code] ?? 0) + value;
}

export function repRowKey(row: RepStatementRow): string {
  return `${row.type}-${row.id}`;
}

/** Cuts the daily statement (repStore.ts's buildRepDailyStatement, newest first) to one period,
 * with the balance carried in from before it, the balance at its end, the balance after every
 * row, and the period's totals. */
export function buildRepPeriodStatement(
  allDays: RepStatementDay[],
  period: RepPeriod,
  convert: RepConvert = keepCurrency,
): RepPeriodStatement {
  const opening: Record<string, number> = {};
  const running: Record<string, number> = {};
  const balanceAfter: Record<string, Record<string, number>> = {};
  const totals: RepPeriodTotals = {
    deviceProfitUsd: 0,
    repShareUsd: 0,
    ourShareUsd: 0,
    deviceProfit: {},
    repShare: {},
    ourShare: {},
    deviceCount: 0,
    pendingCount: 0,
    commissions: {},
    cashCollected: {},
    settled: { commissionPayout: {}, cashHandover: {}, manualCredit: {}, manualDebit: {} },
  };
  const days: RepStatementDay[] = [];

  // Oldest first to carry the balance forward; rows within a day oldest first too.
  for (const day of [...allDays].reverse()) {
    if (period.to && day.date > period.to) continue;
    const rows = [...day.rows].reverse();
    if (period.from && day.date < period.from) {
      for (const row of rows) add(opening, repRowDelta(row, convert));
      continue;
    }
    if (days.length === 0) Object.assign(running, opening);
    for (const row of rows) {
      add(running, repRowDelta(row, convert));
      balanceAfter[repRowKey(row)] = { ...running };
      if (row.type === "device") {
        totals.deviceCount += 1;
        if (row.row.repShareUsd !== undefined && row.row.ourShareUsd !== undefined) {
          const locked = row.row.entry.profitCurrencyRates;
          totals.deviceProfitUsd += row.row.profit.profitUsd ?? 0;
          totals.repShareUsd += row.row.repShareUsd;
          totals.ourShareUsd += row.row.ourShareUsd;
          add(totals.deviceProfit, convert(row.row.profit.profitUsd ?? 0, "USD", locked));
          add(totals.repShare, convert(row.row.repShareUsd, "USD", locked));
          add(totals.ourShare, convert(row.row.ourShareUsd, "USD", locked));
        } else if (row.row.profit.status === "pending") {
          totals.pendingCount += 1;
        }
      } else if (row.type === "invoice") {
        const code = row.row.invoice.currencyCode;
        add(totals.commissions, convert(row.row.commissionAmount, code));
        if (row.row.invoice.paidAmount > 0) add(totals.cashCollected, convert(row.row.invoice.paidAmount, code));
      } else {
        const st = row.settlement;
        add(totals.settled[st.kind], convert(st.amount, st.currencyCode, st.rates));
      }
    }
    days.push(day);
  }
  if (days.length === 0) Object.assign(running, opening);
  return { days: days.reverse(), opening: clean(opening), closing: clean(running), totals, balanceAfter };
}

function clean(values: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [code, value] of Object.entries(values)) if (Math.abs(value) > EPSILON) result[code] = value;
  return result;
}

// ---- Editing a past shipment's share ----

export interface ShipmentRepPatch {
  /** Another representative, or null to take the shipment off any representative. */
  representativeId: string | null;
  percent: number;
  sharesLosses: boolean;
}

/** Re-attributes one shipment: its percent / loss-sharing, or another representative (or none).
 * Only that one entry changes - every other shipment keeps its own locked snapshot. */
export function setShipmentRepShare(
  ledgerStore: LedgerByAccount,
  accountId: string,
  entryId: string,
  patch: ShipmentRepPatch,
): { ok: true; ledgerStore: LedgerByAccount } | { ok: false; message: string } {
  const entries = ledgerStore[accountId];
  const entry = entries?.find((e) => e.id === entryId);
  if (!entries || !entry || entry.kind !== "debit") return { ok: false, message: "الشحنة غير موجودة" };
  if (patch.representativeId && (!Number.isFinite(patch.percent) || patch.percent < 0 || patch.percent > 100)) {
    return { ok: false, message: "النسبة يجب أن تكون بين 0 و 100" };
  }
  const updated = patch.representativeId
    ? {
        ...entry,
        representativeId: patch.representativeId,
        representativeCommissionPercent: patch.percent,
        representativeSharesLosses: patch.sharesLosses || undefined,
      }
    : { ...entry, representativeId: undefined, representativeCommissionPercent: undefined, representativeSharesLosses: undefined };
  return { ok: true, ledgerStore: { ...ledgerStore, [accountId]: entries.map((e) => (e.id === entryId ? updated : e)) } };
}

// ---- Deleting a representative ----

export interface RepDeletionPlan {
  settlements: RepSettlementList;
  /** Their linked cash entries (cashStore sourceId) go with them. */
  removedSettlementIds: string[];
  ledgerStore: LedgerByAccount;
  invoices: Invoice[];
  accounts: StarlinkAccountSummary[];
  counts: { settlements: number; shipments: number; invoices: number; devices: number };
}

/** Everything deleting a representative removes: his settlements, his share of every shipment
 * and store sale (their whole profit becomes ours), and his link on devices - the devices
 * themselves stay, just without a representative. */
export function planRepDeletion(
  repId: string,
  data: { settlements: RepSettlementList; ledgerStore: LedgerByAccount; invoices: Invoice[]; accounts: StarlinkAccountSummary[] },
): RepDeletionPlan {
  const removedSettlementIds = data.settlements.filter((s) => s.representativeId === repId).map((s) => s.id);
  let shipments = 0;
  const ledgerStore: LedgerByAccount = {};
  for (const [accountId, entries] of Object.entries(data.ledgerStore)) {
    ledgerStore[accountId] = entries.map((entry) => {
      if (entry.representativeId !== repId) return entry;
      shipments += 1;
      return { ...entry, representativeId: undefined, representativeCommissionPercent: undefined, representativeSharesLosses: undefined };
    });
  }
  let invoiceCount = 0;
  const invoices = data.invoices.map((inv) => {
    if (inv.representativeId !== repId) return inv;
    invoiceCount += 1;
    return { ...inv, representativeId: undefined, representativeCommissionPercent: undefined };
  });
  let devices = 0;
  const accounts = data.accounts.map((account) => {
    if (account.representativeId !== repId) return account;
    devices += 1;
    return { ...account, representativeId: undefined };
  });
  return {
    settlements: data.settlements.filter((s) => s.representativeId !== repId),
    removedSettlementIds,
    ledgerStore,
    invoices,
    accounts,
    counts: { settlements: removedSettlementIds.length, shipments, invoices: invoiceCount, devices },
  };
}

function localDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
