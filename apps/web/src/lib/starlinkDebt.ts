/**
 * What STAR NET owes Starlink ("المتسلَّف عليه") and the "كاش" card it pays Starlink from.
 *
 * - Every renewal starts as D: Starlink's cost (in USD) is known but not yet paid - we are
 *   borrowing it. Those open D's, per device, are the debt list.
 * - Paying Starlink settles the D (paidAt = that day, the day its profit becomes real, profit
 *   rates locked then). A payment made from the card is marked paidVia "card".
 * - The card's balance (USD) is derived: every top-up (a record here, which also takes the money
 *   out of الصندوق) minus every settled cost paid from it. Nothing is kept as a running counter.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeExpectedShipmentProfit, starlinkCostUsd } from "./accountingStore";
import { CashEntryList, recordCashEntry, removeLinkedCashEntries } from "./cashStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";

const EPSILON = 0.000001;

// ---- Open D's (what we owe Starlink) ----

export interface OpenShipmentDebt {
  accountId: string;
  entry: LedgerEntry;
  /** Starlink's cost still to pay, USD. */
  costUsd: number;
  /** Expected profit once paid, USD (undefined when the sale's USD value is unknown). */
  expectedProfitUsd?: number;
}

/** Every shipment still marked D with a real cost to pay - oldest first (pay those first). */
export function listOpenShipmentDebts(ledgerStore: LedgerByAccount): OpenShipmentDebt[] {
  const result: OpenShipmentDebt[] = [];
  for (const [accountId, entries] of Object.entries(ledgerStore)) {
    for (const entry of entries) {
      if (entry.kind !== "debit" || entry.starlinkCost?.status !== "pending") continue;
      const costUsd = starlinkCostUsd(entry);
      if (costUsd === undefined || costUsd <= EPSILON) continue;
      const expected = computeExpectedShipmentProfit(entry);
      result.push({ accountId, entry, costUsd, expectedProfitUsd: expected.status === "expected" ? expected.profitUsd : undefined });
    }
  }
  return result.sort((a, b) => (a.entry.date !== b.entry.date ? (a.entry.date < b.entry.date ? -1 : 1) : a.entry.createdAt < b.entry.createdAt ? -1 : 1));
}

export function totalOpenDebtUsd(debts: OpenShipmentDebt[]): number {
  return debts.reduce((sum, d) => sum + d.costUsd, 0);
}

// ---- Settling (paying Starlink) ----

export interface SettleOptions {
  /** yyyy-mm-dd - the payment day, which is also the day the profit lands. */
  date: string;
  /** Today's MRU/SIFA rates, locked onto the shipment's profit. */
  profitRates: { MRU?: number; SIFA?: number };
  fromCard: boolean;
}

/** Pays one D shipment: its recorded cost becomes settled on `date`. */
export function settleShipmentCost(entry: LedgerEntry, options: SettleOptions): LedgerEntry {
  if (entry.kind !== "debit" || entry.starlinkCost?.status !== "pending") return entry;
  return {
    ...entry,
    starlinkCost: {
      ...entry.starlinkCost,
      status: "settled",
      paidAt: options.date,
      paidVia: options.fromCard ? "card" : undefined,
      settledAt: new Date().toISOString(),
    },
    profitCurrencyRates: options.profitRates,
  };
}

/** Pays several D shipments at once (the same day, the same way). */
export function settleShipments(
  ledgerStore: LedgerByAccount,
  items: { accountId: string; entryId: string }[],
  options: SettleOptions,
): LedgerByAccount {
  const next: LedgerByAccount = { ...ledgerStore };
  for (const { accountId, entryId } of items) {
    const entries = next[accountId];
    if (!entries) continue;
    next[accountId] = entries.map((e) => (e.id === entryId ? settleShipmentCost(e, options) : e));
  }
  return next;
}

// ---- Devices Starlink suspended while we still owe their D ----

export interface SuspendedDebtDevice {
  account: StarlinkAccountSummary;
  debts: OpenShipmentDebt[];
  costUsd: number;
}

/** Starlink stops a device a few days before month end when its bill isn't paid - with an open D
 * on it, that's the signal to pay now. */
export function listSuspendedWithDebt(accounts: StarlinkAccountSummary[], debts: OpenShipmentDebt[]): SuspendedDebtDevice[] {
  const result: SuspendedDebtDevice[] = [];
  for (const account of accounts) {
    if (account.serviceStatus !== "suspended" || account.archivedAt || account.deletedAt) continue;
    const own = debts.filter((d) => d.accountId === account.id);
    if (own.length === 0) continue;
    result.push({ account, debts: own, costUsd: totalOpenDebtUsd(own) });
  }
  return result;
}

/** How much the card is short of paying every suspended device's D right now (0 when it covers
 * them all). Shown only with the suspension alert - the card only matters once a device stops. */
export function cardShortfallForSuspended(suspended: SuspendedDebtDevice[], cardBalanceUsd: number): number {
  const needed = suspended.reduce((sum, s) => sum + s.costUsd, 0);
  const shortfall = needed - Math.max(0, cardBalanceUsd);
  return shortfall > EPSILON ? shortfall : 0;
}

// ---- The "كاش" card ----

export interface CardTopUp {
  id: string;
  /** What landed on the card, USD. */
  amountUsd: number;
  /** What left الصندوق for it, in its own currency. */
  paidAmount: number;
  paidCurrency: string;
  date: string;
  note?: string;
  createdAt: string;
}

export type CardTopUpList = CardTopUp[];

const TOPUPS_KEY = "starnet_card_topups_v1";

export function loadCardTopUps(): CardTopUpList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TOPUPS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CardTopUpList) : [];
  } catch {
    return [];
  }
}

export function saveCardTopUps(list: CardTopUpList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOPUPS_KEY, JSON.stringify(list));
}

export interface CardTopUpInput {
  amountUsd: number;
  paidAmount: number;
  paidCurrency: string;
  date: string;
  note?: string;
}

export type CardTopUpResult = { ok: true; list: CardTopUpList; topUp: CardTopUp } | { ok: false; message: string };

export function recordCardTopUp(list: CardTopUpList, input: CardTopUpInput): CardTopUpResult {
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) return { ok: false, message: "أدخل مبلغ الشحن بالدولار" };
  if (!Number.isFinite(input.paidAmount) || input.paidAmount <= 0) return { ok: false, message: "أدخل المبلغ الذي خرج من الصندوق" };
  const topUp: CardTopUp = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `card-${Date.now()}-${Math.random()}`,
    amountUsd: input.amountUsd,
    paidAmount: input.paidAmount,
    paidCurrency: input.paidCurrency,
    date: input.date,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  return { ok: true, list: [...list, topUp], topUp };
}

export function deleteCardTopUp(list: CardTopUpList, id: string): CardTopUpList {
  return list.filter((t) => t.id !== id);
}

/** A top-up takes its money out of الصندوق (linked, removed together with it). */
export function postCardTopUpToCash(cash: CashEntryList, topUp: CardTopUp): CashEntryList {
  const posted = recordCashEntry(cash, {
    kind: "out",
    amount: topUp.paidAmount,
    currencyCode: topUp.paidCurrency,
    date: topUp.date,
    category: "شحن بطاقة كاش",
    note: topUp.note ? `شحن البطاقة ${topUp.amountUsd} $ - ${topUp.note}` : `شحن البطاقة ${topUp.amountUsd} $`,
    sourceId: topUp.id,
    sourceKind: "card-topup",
  });
  return posted.ok ? posted.entries : cash;
}

export function removeCardTopUpCash(cash: CashEntryList, topUpId: string): CashEntryList {
  return removeLinkedCashEntries(cash, topUpId);
}

export interface CardPayment {
  accountId: string;
  entry: LedgerEntry;
  amountUsd: number;
  date: string;
}

/** Every Starlink cost paid from the card - derived from the settled shipments themselves. */
export function listCardPayments(ledgerStore: LedgerByAccount): CardPayment[] {
  const result: CardPayment[] = [];
  for (const [accountId, entries] of Object.entries(ledgerStore)) {
    for (const entry of entries) {
      const cost = entry.starlinkCost;
      if (entry.kind !== "debit" || cost?.status !== "settled" || cost.paidVia !== "card") continue;
      const usd = starlinkCostUsd(entry);
      if (usd === undefined) continue;
      result.push({ accountId, entry, amountUsd: usd, date: cost.paidAt ?? entry.date });
    }
  }
  return result;
}

/** The card's current balance from what's stored (top-ups) and the ledger (card payments). */
export function currentCardBalanceUsd(ledgerStore: LedgerByAccount): number {
  return buildCardStatement(loadCardTopUps(), listCardPayments(ledgerStore)).balanceUsd;
}

export type CardStatementRow =
  | { type: "topup"; id: string; date: string; createdAt: string; amountUsd: number; topUp: CardTopUp; balanceAfter: number }
  | { type: "payment"; id: string; date: string; createdAt: string; amountUsd: number; payment: CardPayment; balanceAfter: number };

/** The card's statement, newest first, with the balance after every movement. */
export function buildCardStatement(topUps: CardTopUpList, payments: CardPayment[]): { rows: CardStatementRow[]; balanceUsd: number } {
  const movements: Omit<CardStatementRow, "balanceAfter">[] = [
    ...topUps.map((t) => ({ type: "topup" as const, id: t.id, date: t.date, createdAt: t.createdAt, amountUsd: t.amountUsd, topUp: t })),
    ...payments.map((p) => ({
      type: "payment" as const,
      id: p.entry.id,
      date: p.date,
      createdAt: p.entry.createdAt,
      amountUsd: -p.amountUsd,
      payment: p,
    })),
  ];
  movements.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  let balance = 0;
  const rows = movements.map((m) => {
    balance += m.amountUsd;
    return { ...m, balanceAfter: balance } as CardStatementRow;
  });
  return { rows: rows.reverse(), balanceUsd: balance };
}
