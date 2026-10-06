import type { StarlinkAccountSummary } from "@starnet/shared";
import { starlinkCostUsd } from "./accountingStore";
import { getCurrency, toUsd, type CurrencyStore } from "./currencyStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";

/**
 * 💳 The operator's KAST cards and what their mail tells the app (KastWatch on the phone reads it
 * from the linked Gmail): which card pays which device (to guess the device of a refused Starlink
 * payment - the Telegram alert), each device's expected Starlink charge in dollars, and the dollars
 * received that wait to be recorded as a card top-up (never recorded by themselves).
 */

export interface PaymentCard {
  id: string;
  /** The card's last 4 digits, as KAST's mail shows them. */
  last4: string;
  name: string;
  createdAt: string;
}

export type PaymentCardList = PaymentCard[];

const CARDS_KEY = "starnet_payment_cards_v1";
const DEPOSITS_KEY = "starnet_card_deposits_v1";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, list: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(list));
}

export const loadPaymentCards = (): PaymentCardList => load<PaymentCard>(CARDS_KEY);
export const savePaymentCards = (list: PaymentCardList): void => save(CARDS_KEY, list);

export type CardResult = { ok: true; list: PaymentCardList } | { ok: false; message: string };

export function addPaymentCard(list: PaymentCardList, input: { last4: string; name: string }, now = new Date()): CardResult {
  const last4 = input.last4.replace(/\D/g, "");
  if (last4.length !== 4) return { ok: false, message: "اكتب آخر 4 أرقام من البطاقة" };
  if (list.some((c) => c.last4 === last4)) return { ok: false, message: "هذه البطاقة مسجلة" };
  const name = input.name.trim() || `بطاقة ${last4}`;
  return { ok: true, list: [...list, { id: newId("card"), last4, name, createdAt: now.toISOString() }] };
}

export function removePaymentCard(list: PaymentCardList, id: string): PaymentCardList {
  return list.filter((c) => c.id !== id);
}

export function cardLabel(card: Pick<PaymentCard, "name" | "last4">): string {
  return `${card.name} •${card.last4}`;
}

/** USD as Starlink shows it ("$", "US$", "USD"). */
function isUsd(currency: string | undefined): boolean {
  return ["$", "US$", "$US", "USD"].includes((currency ?? "").trim().toUpperCase());
}

/**
 * What Starlink should charge the device, in dollars: the amount due read by sync (converted at the
 * registered rate), else the device's last recorded Starlink cost. Undefined when neither is known.
 */
export function expectedStarlinkUsd(
  account: Pick<StarlinkAccountSummary, "balanceDue" | "currency">,
  entries: LedgerEntry[],
  currencyStore: CurrencyStore,
): number | undefined {
  const due = Number(String(account.balanceDue ?? "").replace(/[^\d.-]/g, ""));
  if (Number.isFinite(due) && due > 0) {
    if (isUsd(account.currency)) return due;
    const rate = getCurrency(currencyStore, account.currency)?.rateFromUsd;
    if (rate && rate > 0) return toUsd(due, rate);
  }
  const costs = [...entries]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map(starlinkCostUsd)
    .filter((v): v is number => v !== undefined && v > 0);
  return costs[0];
}

/** What the phone's KastWatch needs: each device's name, expected dollars and card - nothing else. */
export function kastDevicesSnapshot(
  accounts: StarlinkAccountSummary[],
  ledger: LedgerByAccount,
  currencyStore: CurrencyStore,
): { name: string; expectedUsd: number; cardLast4: string }[] {
  const out: { name: string; expectedUsd: number; cardLast4: string }[] = [];
  for (const account of accounts) {
    const usd = expectedStarlinkUsd(account, ledger[account.id] ?? [], currencyStore);
    if (usd === undefined) continue;
    out.push({ name: account.name || "جهاز", expectedUsd: Math.round(usd * 100) / 100, cardLast4: account.paymentCardLast4 ?? "" });
  }
  return out;
}

// ---- dollars received on KAST («لقد تلقيت دولارات») ----

export interface CardDeposit {
  /** The Gmail message id, or the KAST notification's. */
  id: string;
  /** "spent": a Starlink payment (the KAST app's notification); else dollars received. */
  kind?: "received" | "spent";
  amountUsd: number;
  sender: string;
  merchant?: string;
  cardLast4?: string;
  /** ms */
  at: number;
  status: "pending" | "recorded" | "dismissed";
}

export const loadCardDeposits = (): CardDeposit[] => load<CardDeposit>(DEPOSITS_KEY);
export const saveCardDeposits = (list: CardDeposit[]): void => save(DEPOSITS_KEY, list);

/** Adds the phone's new deposits (each mail once). */
export function mergeCardDeposits(
  list: CardDeposit[],
  incoming: { id: string; kind?: "received" | "spent"; amountUsd: number; sender: string; merchant?: string; cardLast4?: string; at: number }[],
): CardDeposit[] {
  const known = new Set(list.map((d) => d.id));
  const added = incoming
    .filter((d) => d.id && !known.has(d.id) && Number.isFinite(d.amountUsd) && d.amountUsd > 0)
    .map((d) => ({
      id: d.id,
      kind: d.kind === "spent" ? ("spent" as const) : ("received" as const),
      amountUsd: d.amountUsd,
      sender: d.sender ?? "",
      ...(d.merchant ? { merchant: d.merchant } : {}),
      ...(d.cardLast4 ? { cardLast4: d.cardLast4 } : {}),
      at: d.at ?? 0,
      status: "pending" as const,
    }));
  return added.length ? [...list, ...added] : list;
}

/** Dollars received, waiting to be recorded as a card top-up. */
export function pendingCardDeposits(list: CardDeposit[]): CardDeposit[] {
  return list.filter((d) => d.status === "pending" && d.kind !== "spent").sort((a, b) => a.at - b.at);
}

/** Starlink payments (the KAST notification), waiting to be matched to a device's D. */
export function pendingCardSpends(list: CardDeposit[]): CardDeposit[] {
  return list.filter((d) => d.status === "pending" && d.kind === "spent").sort((a, b) => a.at - b.at);
}

/** An open D's cost as a KAST payment would show it. A cost in another currency (ARS…) was turned
 * into dollars at the rate of the day it was recorded - the card pays at the rate of the day it
 * pays (plus KAST's fee, sometimes waived), so it is also valued at today's registered rate. */
export interface SpendDebtCost {
  costUsd: number;
  entry: { starlinkCost?: { currencyCode?: string; amount?: number } };
}

/** The D's cost at today's registered rate - undefined for a USD cost or an unknown rate. */
export function debtUsdToday(debt: SpendDebtCost, currencyStore: CurrencyStore): number | undefined {
  const cost = debt.entry.starlinkCost;
  if (!cost?.currencyCode || cost.currencyCode === "USD" || !cost.amount) return undefined;
  const rate = getCurrency(currencyStore, cost.currencyCode)?.rateFromUsd;
  return rate && rate > 0 ? toUsd(cost.amount, rate) : undefined;
}

export interface SpendCandidate<T> {
  debt: T;
  /** The D's dollars nearest to the payment: as recorded, or (another currency) at today's rate. */
  usd: number;
  /** Close enough to be this payment; else only the nearest open D's (no exact one). */
  exact: boolean;
}

/**
 * The open D's this payment probably settled, nearest first (at most 3) - only a suggestion, the
 * operator presses «سدّد». A USD cost must be within 2% (min 0.50$ - his rule: a 100$ D matches a
 * payment of 98-102$); a cost in another currency
 * within 6% (min 1$) of its recorded or today's dollars - the peso moves and KAST adds a fee. With
 * none that close, the nearest ones within 20% are offered as «الأقرب».
 *
 * 💳 The card first: with the payment's card known (KAST's notice) and the devices' own cards (read
 * from Starlink's Billing → Payment Method), only that card's D's are looked at; a device paid by
 * another card is never offered. Devices whose card isn't known yet come in only when that card's
 * D's have no exact match.
 */
export function spendCandidates<T extends SpendDebtCost>(
  amountUsd: number,
  debts: T[],
  currencyStore: CurrencyStore = {},
  card?: { last4?: string; of: (debt: T) => string | undefined },
): SpendCandidate<T>[] {
  const last4 = card?.last4?.trim();
  if (last4 && card) {
    const same = debts.filter((d) => card.of(d) === last4);
    const unknown = debts.filter((d) => !card.of(d));
    const own = rankSpend(amountUsd, same, currencyStore);
    if (own.some((c) => c.exact)) return own;
    const others = rankSpend(amountUsd, unknown, currencyStore);
    if (others.some((c) => c.exact)) return others;
    return rankSpend(amountUsd, [...same, ...unknown], currencyStore);
  }
  return rankSpend(amountUsd, debts, currencyStore);
}

function rankSpend<T extends SpendDebtCost>(amountUsd: number, debts: T[], currencyStore: CurrencyStore): SpendCandidate<T>[] {
  const scored = debts.map((debt) => {
    const today = debtUsdToday(debt, currencyStore);
    const values = today === undefined ? [debt.costUsd] : [debt.costUsd, today];
    const usd = values.reduce((best, v) => (Math.abs(v - amountUsd) < Math.abs(best - amountUsd) ? v : best));
    const foreign = Boolean(debt.entry.starlinkCost?.currencyCode && debt.entry.starlinkCost.currencyCode !== "USD");
    const tolerance = foreign ? Math.max(1, amountUsd * 0.06) : Math.max(0.5, amountUsd * 0.02);
    const distance = Math.abs(usd - amountUsd);
    return { debt, usd, distance, exact: distance <= tolerance };
  });
  const byDistance = (a: { distance: number }, b: { distance: number }) => a.distance - b.distance;
  const exact = scored.filter((c) => c.exact).sort(byDistance);
  const picked = exact.length ? exact : scored.filter((c) => c.distance <= amountUsd * 0.2).sort(byDistance);
  return picked.slice(0, 3).map(({ debt, usd, exact: isExact }) => ({ debt, usd, exact: isExact }));
}

export function setDepositStatus(list: CardDeposit[], id: string, status: CardDeposit["status"]): CardDeposit[] {
  return list.map((d) => (d.id === id ? { ...d, status } : d));
}

/** «وصل 18.30$ من demo-sender» / «دُفع 116.56$ لـ Starlink» */
export function depositLabel(d: Pick<CardDeposit, "amountUsd" | "sender" | "kind" | "merchant" | "cardLast4">): string {
  if (d.kind === "spent") return `دُفع ${d.amountUsd.toFixed(2)}$ لـ ${d.merchant || "Starlink"}${d.cardLast4 ? ` بالبطاقة ${d.cardLast4}` : ""}`;
  return `وصل ${d.amountUsd.toFixed(2)}$${d.sender ? ` من ${d.sender}` : ""}`;
}
