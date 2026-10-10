/**
 * 💸 «تحويل الأموال» - the remittance branch (his Oct 10 2026 request and choices): a person gives
 * him money in one place (الكاش، بنكيلي، سداد…) and he sends it from another (أورانج مالي، نيتا،
 * دولار، بنكيلي…) - for that person or someone else - taking a commission.
 *
 *  - The commission is chosen on each one: a fixed amount or a %, paid ON TOP by the customer or
 *    DEDUCTED from what is sent. It's in the received currency.
 *  - Different currencies: the rate (sent units per 1 received unit) is typed on each one - the
 *    registry's rate is offered - and locked on the record with the day's registry rates.
 *  - What the customer hasn't paid yet stays a debt on him (paid later in one or more payments).
 *  - Profit = what he owes − what was sent, both in أوقية at the day's locked rates: the commission
 *    plus any exchange difference. It counts on the day of the transfer.
 *  - Balances are derived: received money adds to its account (or الكاش), sent money leaves its
 *    account. A الكاش leg is a cash entry carrying the remittance's id (removed with it).
 *
 * Amounts are in the account's own currency (Orange / Nita in سيفا - the form types فرانك). Pure.
 */

import type { CreateCashEntryInput } from "./cashStore";
import type { AccountFlow } from "./moneyAccounts";
import { toMru, type RatesFromUsd } from "./reportsView";

export const CASH_ID = "cash";

export type CommissionMode = "fixed" | "percent";
/** onTop = the customer pays amount + commission; deducted = the beneficiary gets amount − commission. */
export type CommissionWho = "onTop" | "deducted";

export interface RemittancePayment {
  id: string;
  date: string;
  amount: number;
  /** Where it was paid (an account id, or «cash»). */
  accountId: string;
  createdAt: string;
}

export interface Remittance {
  id: string;
  date: string;
  createdAt: string;
  /** Who gave the money (and owes what's unpaid). */
  client: string;
  clientPhone?: string;
  /** Who receives it (empty = the customer himself). */
  beneficiary?: string;
  beneficiaryNumber?: string;
  /** Where the customer's money came in. */
  inAccountId: string;
  inCurrency: string;
  /** The amount to transfer, in the received currency. */
  amount: number;
  commissionMode: CommissionMode;
  /** The typed figure: an amount (received currency) or a %. */
  commissionValue: number;
  commissionWho: CommissionWho;
  /** Locked: the commission in the received currency. */
  commission: number;
  /** Locked: what the customer owes in total, received currency. */
  owed: number;
  /** Where the money was sent from. */
  outAccountId: string;
  outCurrency: string;
  /** Sent units per 1 received unit (1 when the same currency). */
  rate: number;
  /** Locked: what left the sending account. */
  sent: number;
  /** Paid by the customer when it was recorded (the rest is a debt). */
  paidNow: number;
  payments: RemittancePayment[];
  /** Registry rates (per 1 USD) of the day - for the profit in أوقية, never re-read. */
  rates: Record<string, number>;
  note?: string;
}

export type RemittanceList = Remittance[];

export interface RemittanceInput {
  date: string;
  client: string;
  clientPhone?: string;
  beneficiary?: string;
  beneficiaryNumber?: string;
  inAccountId: string;
  inCurrency: string;
  amount: number;
  commissionMode: CommissionMode;
  commissionValue: number;
  commissionWho: CommissionWho;
  outAccountId: string;
  outCurrency: string;
  rate: number;
  /** Paid now; undefined = all of it. */
  paidNow?: number;
  rates: RatesFromUsd;
  note?: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The figures of a transfer, before saving (the form shows them as he types). */
export function remittanceFigures(input: Pick<RemittanceInput, "amount" | "commissionMode" | "commissionValue" | "commissionWho" | "rate">): {
  commission: number;
  owed: number;
  sent: number;
} {
  const amount = Number.isFinite(input.amount) && input.amount > 0 ? input.amount : 0;
  const value = Number.isFinite(input.commissionValue) && input.commissionValue > 0 ? input.commissionValue : 0;
  const commission = round(input.commissionMode === "percent" ? (amount * value) / 100 : value);
  const owed = round(input.commissionWho === "onTop" ? amount + commission : amount);
  const base = input.commissionWho === "onTop" ? amount : amount - commission;
  const rate = Number.isFinite(input.rate) && input.rate > 0 ? input.rate : 0;
  return { commission, owed, sent: round(base * rate) };
}

/** The rate offered: sent units per 1 received unit, from the registry (undefined if one is missing). */
export function registryRate(inCurrency: string, outCurrency: string, rates: RatesFromUsd): number | undefined {
  if (inCurrency === outCurrency) return 1;
  const perUsd = (code: string) => (code === "USD" ? 1 : rates[code]);
  const from = perUsd(inCurrency);
  const to = perUsd(outCurrency);
  if (!from || !to) return undefined;
  return to / from;
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

export type RemittanceResult = { ok: true; list: RemittanceList; remittance: Remittance } | { ok: false; message: string };

export function createRemittance(list: RemittanceList, input: RemittanceInput, now = new Date()): RemittanceResult {
  const client = input.client.trim();
  if (!client) return { ok: false, message: "اكتب اسم الزبون" };
  if (!(input.amount > 0)) return { ok: false, message: "اكتب المبلغ" };
  if (!input.inAccountId || !input.outAccountId) return { ok: false, message: "اختر من أين استلمت ومن أين أرسلت" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  if (!(input.rate > 0)) return { ok: false, message: "اكتب سعر الصرف" };
  if (input.commissionValue < 0 || (input.commissionMode === "percent" && input.commissionValue >= 100)) return { ok: false, message: "العمولة غير صحيحة" };
  const figures = remittanceFigures(input);
  if (!(figures.sent > 0)) return { ok: false, message: "العمولة أكبر من المبلغ" };
  const paidNow = input.paidNow === undefined ? figures.owed : round(input.paidNow);
  if (paidNow < 0 || paidNow > figures.owed + 0.005) return { ok: false, message: "المدفوع أكبر مما عليه" };
  const rates: Record<string, number> = {};
  for (const code of new Set(["MRU", input.inCurrency, input.outCurrency])) {
    const r = code === "USD" ? 1 : input.rates[code];
    if (r) rates[code] = r;
  }
  const remittance: Remittance = {
    id: newId("rmt"),
    date: input.date,
    createdAt: now.toISOString(),
    client,
    ...(input.clientPhone?.trim() ? { clientPhone: input.clientPhone.trim() } : {}),
    ...(input.beneficiary?.trim() ? { beneficiary: input.beneficiary.trim() } : {}),
    ...(input.beneficiaryNumber?.trim() ? { beneficiaryNumber: input.beneficiaryNumber.trim() } : {}),
    inAccountId: input.inAccountId,
    inCurrency: input.inCurrency,
    amount: round(input.amount),
    commissionMode: input.commissionMode,
    commissionValue: input.commissionValue,
    commissionWho: input.commissionWho,
    commission: figures.commission,
    owed: figures.owed,
    outAccountId: input.outAccountId,
    outCurrency: input.outCurrency,
    rate: input.rate,
    sent: figures.sent,
    paidNow,
    payments: [],
    rates,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  return { ok: true, list: [...list, remittance], remittance };
}

/** What the customer still owes on it (received currency). */
export function remittanceRemaining(r: Remittance): number {
  const paid = r.paidNow + r.payments.reduce((s, p) => s + p.amount, 0);
  return Math.max(0, round(r.owed - paid));
}

export function addRemittancePayment(
  list: RemittanceList,
  id: string,
  input: { amount: number; date: string; accountId: string },
  now = new Date(),
): { ok: true; list: RemittanceList; payment: RemittancePayment } | { ok: false; message: string } {
  const r = list.find((x) => x.id === id);
  if (!r) return { ok: false, message: "الحوالة غير موجودة" };
  if (!(input.amount > 0)) return { ok: false, message: "اكتب المبلغ" };
  if (input.amount > remittanceRemaining(r) + 0.005) return { ok: false, message: "المبلغ أكبر مما عليه" };
  if (!input.accountId) return { ok: false, message: "اختر أين دفع" };
  const payment: RemittancePayment = { id: newId("rmp"), date: input.date, amount: round(input.amount), accountId: input.accountId, createdAt: now.toISOString() };
  return { ok: true, list: list.map((x) => (x.id === id ? { ...x, payments: [...x.payments, payment] } : x)), payment };
}

export function deleteRemittance(list: RemittanceList, id: string): RemittanceList {
  return list.filter((r) => r.id !== id);
}

/** Profit in أوقية at its locked rates: what he's owed − what he sent (commission + exchange). */
export function remittanceProfitMru(r: Remittance): number | undefined {
  const owed = toMru(r.owed, r.inCurrency, r.rates);
  const sent = toMru(r.sent, r.outCurrency, r.rates);
  if (owed === undefined || sent === undefined) return undefined;
  return round(owed - sent);
}

/** The month's line in «يبقى لك»: profit in أوقية (from `since` on, like the rest of «حسابي»). */
export function remittanceMonth(list: RemittanceList, month: string, since?: string): { count: number; profitMru: number; missing: number } {
  let count = 0;
  let profitMru = 0;
  let missing = 0;
  for (const r of list) {
    if (r.date.slice(0, 7) !== month || (since && r.date < since)) continue;
    count += 1;
    const p = remittanceProfitMru(r);
    if (p === undefined) missing += 1;
    else profitMru += p;
  }
  return { count, profitMru: round(profitMru), missing };
}

/** Money in and out of the bank / wallet accounts (الكاش goes through cash entries instead). */
export function remittanceFlows(list: RemittanceList): AccountFlow[] {
  const flows: AccountFlow[] = [];
  for (const r of list) {
    if (r.paidNow > 0 && r.inAccountId !== CASH_ID) flows.push({ accountId: r.inAccountId, currencyCode: r.inCurrency, date: r.date, amount: r.paidNow });
    if (r.outAccountId !== CASH_ID) flows.push({ accountId: r.outAccountId, currencyCode: r.outCurrency, date: r.date, amount: -r.sent });
    for (const p of r.payments) if (p.accountId !== CASH_ID) flows.push({ accountId: p.accountId, currencyCode: r.inCurrency, date: p.date, amount: p.amount });
  }
  return flows;
}

const who = (r: Remittance) => `${r.client}${r.beneficiary ? ` ← ${r.beneficiary}` : ""}`;

/** The الكاش entries of one transfer (all carry its id, so they go with it). */
export function remittanceCashEntries(r: Remittance): CreateCashEntryInput[] {
  const out: CreateCashEntryInput[] = [];
  const base = { sourceId: r.id, sourceKind: "remittance" as const, category: "تحويل أموال" };
  if (r.inAccountId === CASH_ID && r.paidNow > 0) out.push({ ...base, kind: "in", amount: r.paidNow, currencyCode: r.inCurrency, date: r.date, note: `💸 حوالة من ${who(r)}` });
  if (r.outAccountId === CASH_ID) out.push({ ...base, kind: "out", amount: r.sent, currencyCode: r.outCurrency, date: r.date, note: `💸 حوالة ${who(r)}` });
  for (const p of r.payments)
    if (p.accountId === CASH_ID) out.push({ ...base, kind: "in", amount: p.amount, currencyCode: r.inCurrency, date: p.date, note: `💸 تسديد حوالة ${r.client}` });
  return out;
}

/** People who still owe on transfers, one line per customer and currency («كل ما تملك»). */
export function remittanceDebtors(list: RemittanceList): { name: string; byCurrency: Record<string, number> }[] {
  const byName = new Map<string, Record<string, number>>();
  for (const r of list) {
    const left = remittanceRemaining(r);
    if (left <= 0) continue;
    const row = byName.get(r.client) ?? {};
    row[r.inCurrency] = round((row[r.inCurrency] ?? 0) + left);
    byName.set(r.client, row);
  }
  return Array.from(byName, ([name, byCurrency]) => ({ name: `💸 ${name}`, byCurrency }));
}

const KEY = "starnet_remittances_v1";

export function loadRemittances(): RemittanceList {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RemittanceList).map((r) => ({ ...r, payments: Array.isArray(r.payments) ? r.payments : [] })) : [];
  } catch {
    return [];
  }
}

export function saveRemittances(list: RemittanceList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}
