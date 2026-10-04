/**
 * «صافي الربح الحقيقي»: one number per calendar month for the whole business -
 *   ربح ستارلينك − حصص المندوبين
 * + ربح المتجر (المبيعات − تكلفة البضاعة − الشحن) − عمولات المندوبين على المتجر
 * − المصاريف (قيود «خارج» يدوية في الكاش، غير مرتبطة بفاتورة أو دفعة)
 * Each part follows the app's own rules (Starlink profit on the day Starlink was paid, each at its
 * locked rate - see monthClosing.ts's buildMonthReport). Everything is shown in أوقية; store and
 * expense amounts in other currencies use today's registered rates (display only - the records keep
 * their own currency), and a currency with no known rate is listed, never guessed.
 */

import { CashEntryList, listStandaloneCashEntries } from "./cashStore";
import { InvoiceList, invoiceTotal } from "./invoiceStore";
import { LedgerByAccount } from "./ledgerStore";
import { buildMonthReport, monthOf } from "./monthClosing";
import { entriesAfterProfitReset, ProfitReset } from "./profitReset";
import type { RepResetPoint } from "./repStore";
import { RatesFromUsd, sumToMru } from "./reportsView";
import { computeStoreSalesSummary } from "./storeReports";
import { StoreTransactionList } from "./storeStore";

export interface MonthNetInput {
  month: string;
  ledgerStore: LedgerByAccount;
  invoices: InvoiceList;
  transactions: StoreTransactionList;
  cash: CashEntryList;
  rates: RatesFromUsd;
  profitReset?: ProfitReset | null;
  /** Each device's own start point (the global one or its client's, whichever is later -
   * clientBulk.ts#profitResetByAccount). When given, it replaces `profitReset` per device. */
  profitResetByAccount?: Record<string, RepResetPoint | null>;
}

export interface ExpenseGroup {
  category: string;
  mru: number;
  count: number;
}

export interface MonthNet {
  month: string;
  starlinkProfitMru: number;
  starlinkRepSharesMru: number;
  storeSalesMru: number;
  storeCogsMru: number;
  storeShippingMru: number;
  storeRepCommissionMru: number;
  /** Sales − goods − shipping − rep commission. */
  storeNetMru: number;
  expensesMru: number;
  expenses: ExpenseGroup[];
  netMru: number;
  /** Currencies that had amounts but no registered rate - left out of the totals. */
  missingCurrencies: string[];
  /** False when some Starlink profit used today's rate (none was locked at payment). */
  exact: boolean;
}

const NO_CATEGORY = "بدون تصنيف";

function addTo(record: Record<string, number>, code: string, amount: number) {
  record[code] = (record[code] ?? 0) + amount;
}

export function buildMonthNet(input: MonthNetInput): MonthNet {
  const { month, rates } = input;
  const missing = new Set<string>();
  const take = (byCurrency: Record<string, number>) => {
    const result = sumToMru(byCurrency, rates);
    for (const code of result.missing) missing.add(code);
    return result.mru;
  };

  // Starlink - the same figures as the month-closing report, after any "fresh start".
  const ledger: LedgerByAccount = {};
  for (const [accountId, entries] of Object.entries(input.ledgerStore)) {
    const reset = input.profitResetByAccount && accountId in input.profitResetByAccount ? input.profitResetByAccount[accountId] : input.profitReset;
    ledger[accountId] = entriesAfterProfitReset(entries, reset ?? null);
  }
  const mruRate = rates.MRU;
  const starlink = mruRate ? buildMonthReport(ledger, month, mruRate) : undefined;

  // Store - sale invoices dated in the month (returns count negative, as in the store report).
  const monthInvoices = input.invoices.filter((inv) => monthOf(inv.date) === month);
  const summary = computeStoreSalesSummary(input.transactions, input.invoices, monthInvoices);
  const commission: Record<string, number> = {};
  for (const inv of monthInvoices) {
    if (inv.kind !== "sale" || inv.returnOfInvoiceId || !inv.representativeId || inv.representativeCommissionPercent === undefined) continue;
    addTo(commission, inv.currencyCode, (inv.representativeCommissionPercent / 100) * invoiceTotal(inv));
  }
  const storeSalesMru = take(summary.salesByCurrency);
  const storeCogsMru = take(summary.cogsByCurrency);
  const storeShippingMru = take(summary.shippingCostByCurrency);
  const storeRepCommissionMru = take(commission);

  // Expenses - manual cash-out entries only (not a card top-up, rep payout, invoice or payment).
  const byCategory = new Map<string, Record<string, number>>();
  const counts = new Map<string, number>();
  for (const entry of listStandaloneCashEntries(input.cash)) {
    if (entry.kind !== "out" || monthOf(entry.date) !== month) continue;
    const category = entry.category?.trim() || NO_CATEGORY;
    const bucket = byCategory.get(category) ?? {};
    addTo(bucket, entry.currencyCode, entry.amount);
    byCategory.set(category, bucket);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const expenses: ExpenseGroup[] = Array.from(byCategory.entries())
    .map(([category, bucket]) => ({ category, mru: take(bucket), count: counts.get(category) ?? 0 }))
    .sort((a, b) => b.mru - a.mru);
  const expensesMru = expenses.reduce((sum, e) => sum + e.mru, 0);

  const starlinkProfitMru = starlink?.profitMru ?? 0;
  const starlinkRepSharesMru = starlink?.repSharesMru ?? 0;
  const storeNetMru = storeSalesMru - storeCogsMru - storeShippingMru - storeRepCommissionMru;
  if (!mruRate && Object.values(input.ledgerStore).some((entries) => entries.length > 0)) missing.add("MRU");
  return {
    month,
    starlinkProfitMru,
    starlinkRepSharesMru,
    storeSalesMru,
    storeCogsMru,
    storeShippingMru,
    storeRepCommissionMru,
    storeNetMru,
    expensesMru,
    expenses,
    netMru: starlinkProfitMru - starlinkRepSharesMru + storeNetMru - expensesMru,
    missingCurrencies: Array.from(missing),
    exact: starlink?.exact ?? true,
  };
}

/** Change against the previous month: the amount, and a percent only when both months made a
 * profit (a percent across a loss - "-1133%" - means nothing to read). */
export function monthChange(current: number, previous: number): { diffMru: number; percent: number | null } {
  const diffMru = current - previous;
  if (previous < 0.5 || current < 0) return { diffMru, percent: null };
  return { diffMru, percent: Math.round((diffMru / Math.abs(previous)) * 100) };
}
