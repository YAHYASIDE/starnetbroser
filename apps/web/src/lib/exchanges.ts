/**
 * 💱 «شراء عملة / صرف» (his Oct 10 2026 choice): he buys سيفا / دولار / دينار from someone - «اشتريت
 * 10,000 سيفا بـ 3,600 ودفعت من بنكيلي». One record moves both places (paid out of one, received into
 * the other; a الكاش side is a cash entry carrying the record's id), the rate is shown his way («1,000
 * سيفا = 3,600 أوقية»), and the average of what he paid becomes the cost a transfer's profit is measured
 * against (his choice «مقابل متوسط شرائي»): the purchases paid in أوقية over the last 30 days, weighted
 * by amount (none in 30 days → the latest one). Pure + storage (`starnet_exchanges_v1`).
 */

import type { CreateCashEntryInput } from "./cashStore";
import type { AccountFlow } from "./moneyAccounts";

export const CASH_ID = "cash";

export interface Exchange {
  id: string;
  date: string;
  createdAt: string;
  /** Where the money paid left from (an account id, or "cash"). */
  fromAccountId: string;
  fromCurrency: string;
  paid: number;
  /** Where the bought currency arrived. */
  toAccountId: string;
  toCurrency: string;
  received: number;
  /** Who sold it. */
  seller?: string;
  note?: string;
}

export type ExchangeList = Exchange[];

export interface ExchangeInput {
  date: string;
  fromAccountId: string;
  fromCurrency: string;
  paid: number;
  toAccountId: string;
  toCurrency: string;
  received: number;
  seller?: string;
  note?: string;
}

export type ExchangeResult = { ok: true; list: ExchangeList; exchange: Exchange } | { ok: false; message: string };

const round = (n: number) => Math.round(n * 100) / 100;
const newId = () => `exc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function validate(input: ExchangeInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "اختر التاريخ";
  if (!input.fromAccountId || !input.toAccountId) return "اختر من أين دفعت وأين استلمت";
  if (!(input.paid > 0)) return "اكتب المبلغ الذي دفعته";
  if (!(input.received > 0)) return "اكتب المبلغ الذي استلمته";
  if (input.fromCurrency === input.toCurrency) return "العملتان متشابهتان - هذا تحويل بين حساباتك وليس شراء عملة";
  return null;
}

function build(input: ExchangeInput, id: string, createdAt: string): Exchange {
  return {
    id,
    date: input.date,
    createdAt,
    fromAccountId: input.fromAccountId,
    fromCurrency: input.fromCurrency,
    paid: round(input.paid),
    toAccountId: input.toAccountId,
    toCurrency: input.toCurrency,
    received: round(input.received),
    ...(input.seller?.trim() ? { seller: input.seller.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
}

export function createExchange(list: ExchangeList, input: ExchangeInput, now = new Date()): ExchangeResult {
  const message = validate(input);
  if (message) return { ok: false, message };
  const exchange = build(input, newId(), now.toISOString());
  return { ok: true, list: [...list, exchange], exchange };
}

export function updateExchange(list: ExchangeList, id: string, input: ExchangeInput): ExchangeResult {
  const current = list.find((e) => e.id === id);
  if (!current) return { ok: false, message: "العملية غير موجودة" };
  const message = validate(input);
  if (message) return { ok: false, message };
  const exchange = build(input, current.id, current.createdAt);
  return { ok: true, list: list.map((e) => (e.id === id ? exchange : e)), exchange };
}

export function deleteExchange(list: ExchangeList, id: string): ExchangeList {
  return list.filter((e) => e.id !== id);
}

/** The bank / wallet sides (+ received, − paid); the الكاش sides are cash entries. */
export function exchangeFlows(list: ExchangeList): AccountFlow[] {
  const flows: AccountFlow[] = [];
  for (const e of list) {
    if (e.fromAccountId !== CASH_ID) flows.push({ accountId: e.fromAccountId, currencyCode: e.fromCurrency, date: e.date, amount: -e.paid });
    if (e.toAccountId !== CASH_ID) flows.push({ accountId: e.toAccountId, currencyCode: e.toCurrency, date: e.date, amount: e.received });
  }
  return flows;
}

export function exchangeLabel(e: Exchange): string {
  return `💱 شراء ${e.toCurrency === "MRU" ? "أوقية" : e.toCurrency}${e.seller ? ` من ${e.seller}` : ""}`;
}

/** The الكاش entries of one purchase (they carry its id and go with it). */
export function exchangeCashEntries(e: Exchange): CreateCashEntryInput[] {
  const base = { sourceId: e.id, sourceKind: "exchange" as const, category: "شراء عملة", date: e.date, note: exchangeLabel(e) };
  const out: CreateCashEntryInput[] = [];
  if (e.fromAccountId === CASH_ID) out.push({ ...base, kind: "out", amount: e.paid, currencyCode: e.fromCurrency });
  if (e.toAccountId === CASH_ID) out.push({ ...base, kind: "in", amount: e.received, currencyCode: e.toCurrency });
  return out;
}

export interface AverageCost {
  /** أوقية paid per 1 unit. */
  mruPerUnit: number;
  /** Purchases it's made of. */
  count: number;
  /** "30d" = the last 30 days; "latest" = only the latest purchase (none in 30 days). */
  basis: "30d" | "latest";
}

const DAY_MS = 86_400_000;

/** What 1 unit of `currency` cost him: purchases paid in أوقية, the last 30 days up to `day`. */
export function averageCost(list: ExchangeList, currency: string, day: string): AverageCost | undefined {
  if (currency === "MRU") return undefined;
  const bought = list.filter((e) => e.toCurrency === currency && e.fromCurrency === "MRU" && e.date <= day).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1));
  if (bought.length === 0) return undefined;
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - 30 * DAY_MS).toISOString().slice(0, 10);
  const recent = bought.filter((e) => e.date >= since);
  const used = recent.length ? recent : [bought[bought.length - 1]!];
  const paid = used.reduce((s, e) => s + e.paid, 0);
  const received = used.reduce((s, e) => s + e.received, 0);
  return { mruPerUnit: paid / received, count: used.length, basis: recent.length ? "30d" : "latest" };
}

/** Every currency's average cost on `day` (for the transfer form). */
export function averageCosts(list: ExchangeList, day: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const code of new Set(list.map((e) => e.toCurrency))) {
    const c = averageCost(list, code, day);
    if (c) out[code] = c.mruPerUnit;
  }
  return out;
}

const KEY = "starnet_exchanges_v1";

export function loadExchanges(): ExchangeList {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as ExchangeList) : [];
  } catch {
    return [];
  }
}

export function saveExchanges(list: ExchangeList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}
