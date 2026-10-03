/**
 * "دين سابق": a Starlink debt a device already carried when its owner brought it (someone else's
 * unpaid bills). Each one is its own record with its date and amount (USD) - never merged with
 * the operator's own D's or with each other - and stays open until it's paid. Paying it records a
 * shipment on the device: the amount the operator charges the customer (typed, any currency), with
 * Starlink's cost settled at what was actually paid - the difference, if any, is profit. The debt
 * is paid exactly as long as that shipment exists (LedgerEntry.previousDebtId).
 */

import { createLedgerEntry, type LedgerByAccount, type LedgerCurrency, type LedgerEntry } from "./ledgerStore";

export interface PreviousDebt {
  id: string;
  accountId: string;
  /** yyyy-mm-dd - when the debt was found/recorded. */
  date: string;
  amountUsd: number;
  note?: string;
  createdAt: string;
}

export type PreviousDebtList = PreviousDebt[];

const KEY = "starnet_previous_debts_v1";

export function loadPreviousDebts(): PreviousDebtList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PreviousDebtList) : [];
  } catch {
    return [];
  }
}

export function savePreviousDebts(list: PreviousDebtList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export type PreviousDebtResult = { ok: true; list: PreviousDebtList; debt: PreviousDebt } | { ok: false; message: string };

export function recordPreviousDebt(
  list: PreviousDebtList,
  input: { accountId: string; date: string; amountUsd: number; note?: string },
  now: Date = new Date(),
): PreviousDebtResult {
  if (!input.accountId) return { ok: false, message: "اختر الجهاز" };
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) return { ok: false, message: "أدخل مبلغ الدين بالدولار" };
  if (!input.date) return { ok: false, message: "أدخل التاريخ" };
  const debt: PreviousDebt = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `prev-${now.getTime()}-${Math.random()}`,
    accountId: input.accountId,
    date: input.date,
    amountUsd: input.amountUsd,
    note: input.note?.trim() || undefined,
    createdAt: now.toISOString(),
  };
  return { ok: true, list: [...list, debt], debt };
}

/** Only an unpaid debt can be removed (one recorded by mistake); a paid one goes with its shipment. */
export function deletePreviousDebt(list: PreviousDebtList, id: string): PreviousDebtList {
  return list.filter((d) => d.id !== id);
}

export function paidPreviousDebtIds(ledgerStore: LedgerByAccount): Set<string> {
  const ids = new Set<string>();
  for (const entries of Object.values(ledgerStore)) for (const e of entries) if (e.previousDebtId) ids.add(e.previousDebtId);
  return ids;
}

/** Every previous debt not paid yet, oldest first. */
export function listOpenPreviousDebts(list: PreviousDebtList, ledgerStore: LedgerByAccount): PreviousDebt[] {
  const paid = paidPreviousDebtIds(ledgerStore);
  return list
    .filter((d) => !paid.has(d.id))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
}

export function totalPreviousDebtUsd(debts: PreviousDebt[]): number {
  return debts.reduce((sum, d) => sum + d.amountUsd, 0);
}

/** What Starlink shows as due beyond everything recorded as unpaid on the device - a hint to
 * record the rest as a previous debt. 0 when nothing (or less than a dollar) is unaccounted for. */
export function unrecordedStarlinkBalanceUsd(starlinkDueUsd: number | undefined, recordedUnpaidUsd: number): number {
  if (starlinkDueUsd === undefined || !Number.isFinite(starlinkDueUsd)) return 0;
  const gap = starlinkDueUsd - recordedUnpaidUsd;
  return gap >= 1 ? Math.round(gap * 100) / 100 : 0;
}

/** Starlink costs paid (USD) after Starlink's balance was last read - Starlink still shows them
 * as due until the next sync, so they must not look "unrecorded". With no sync time known, the
 * last 30 days' payments count. */
export function paidSinceLastSyncUsd(entries: LedgerEntry[], lastSyncIso: string | null | undefined, now: Date = new Date()): number {
  const since = lastSyncIso ? Date.parse(lastSyncIso) : now.getTime() - 30 * 24 * 60 * 60 * 1000;
  let total = 0;
  for (const e of entries) {
    const cost = e.starlinkCost;
    if (e.kind !== "debit" || cost?.status !== "settled" || !cost.settledAt || cost.waived) continue;
    if (Date.parse(cost.settledAt) <= since) continue;
    total += cost.currencyCode === "USD" ? cost.amount ?? 0 : cost.rate?.usdValue ?? 0;
  }
  return total;
}

export interface PayPreviousDebtInput {
  /** yyyy-mm-dd */
  date: string;
  /** What was actually paid to Starlink, USD. */
  paidUsd: number;
  /** What goes onto the customer, in their currency. */
  chargeAmount: number;
  chargeCurrency: LedgerCurrency;
  /** Today's registered rate of `chargeCurrency` (units per USD); not needed for USD. */
  chargeRateFromUsd?: number;
  fromCard: boolean;
  profitRates: { MRU?: number; SIFA?: number };
  email?: string;
  representative?: { id: string; commissionPercent: number; sharesLosses?: boolean };
}

export type PayPreviousDebtResult = { ok: true; entry: LedgerEntry } | { ok: false; message: string };

/** The shipment that pays a previous debt: charged to the customer, Starlink settled at `paidUsd`. */
export function buildPreviousDebtPayment(debt: PreviousDebt, input: PayPreviousDebtInput, now: Date = new Date()): PayPreviousDebtResult {
  if (!Number.isFinite(input.paidUsd) || input.paidUsd <= 0) return { ok: false, message: "أدخل ما دفعته لستارلينك بالدولار" };
  if (!Number.isFinite(input.chargeAmount) || input.chargeAmount <= 0) return { ok: false, message: "أدخل المبلغ الذي يُسجَّل على الزبون" };
  const isUsd = input.chargeCurrency === "USD";
  if (!isUsd && !(input.chargeRateFromUsd && input.chargeRateFromUsd > 0)) {
    return { ok: false, message: "سعر صرف عملة الزبون غير مسجّل - أضفه من صفحة العملات" };
  }
  const entry = createLedgerEntry({
    kind: "debit",
    amount: input.chargeAmount,
    currency: input.chargeCurrency,
    note: debt.note ? `دين سابق لستارلينك - ${debt.note}` : "دين سابق لستارلينك",
    email: input.email ?? "",
    date: input.date,
    saleRate: isUsd ? undefined : { rateFromUsd: input.chargeRateFromUsd!, usdValue: input.chargeAmount / input.chargeRateFromUsd! },
    starlinkCost: {
      status: "settled",
      currencyCode: "USD",
      amount: input.paidUsd,
      paidAt: input.date,
      paidVia: input.fromCard ? "card" : undefined,
      settledAt: now.toISOString(),
    },
    profitCurrencyRates: input.profitRates,
    representative: input.representative,
  });
  return { ok: true, entry: { ...entry, previousDebtId: debt.id } };
}
