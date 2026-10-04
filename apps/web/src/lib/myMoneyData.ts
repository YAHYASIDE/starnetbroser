"use client";

/**
 * 💰 «حسابي»'s inputs from the rest of the app - the same calculations the reports («الصافي») and
 * the clients page («مجموع ما لنا عند الزبائن») already show, so the final figures match them.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { listAccounts } from "./apiClient";
import { computeCashBalanceByCurrency, loadCashEntries } from "./cashStore";
import { loadClientProfitResets, profitResetByAccount } from "./clientBulk";
import { computeClientCombinedTotals } from "./clientAccount";
import { listClients, loadClientStore } from "./clientStore";
import { loadCurrencyStore } from "./currencyStore";
import { demoAccounts } from "./demoData";
import { loadDemoAccounts } from "./demoAccountStore";
import { loadInvoices } from "./invoiceStore";
import { loadLedgerStore } from "./ledgerStore";
import { buildMonthNet } from "./netProfit";
import { loadPartyAdjustments } from "./partyBalanceStore";
import { loadHiddenProfitDays, withoutHiddenProfitDays } from "./profitStatement";
import { loadProfitReset } from "./profitReset";
import { ourDebtLedgerForClients } from "./repClients";
import type { RatesFromUsd } from "./reportsView";
import { isDemoMode, isLoggedIn } from "./settingsStore";
import { currentCardBalanceUsd } from "./starlinkDebt";
import { loadStoreTransactions } from "./storeStore";

export async function loadMoneyAccounts(): Promise<StarlinkAccountSummary[]> {
  if (isDemoMode()) return loadDemoAccounts(demoAccounts);
  if (!isLoggedIn()) return [];
  return listAccounts().catch(() => []);
}

export function loadRates(): RatesFromUsd {
  const rates: RatesFromUsd = {};
  for (const [code, currency] of Object.entries(loadCurrencyStore())) rates[code] = currency.rateFromUsd;
  return rates;
}

/** The month's business «الصافي», exactly as the reports page computes it. */
export function businessNetForMonth(month: string, accounts: StarlinkAccountSummary[], rates: RatesFromUsd): { netMru: number; missing: string[] } {
  const ledger = withoutHiddenProfitDays(loadLedgerStore(), loadHiddenProfitDays());
  const profitReset = loadProfitReset();
  const net = buildMonthNet({
    month,
    ledgerStore: ledger,
    invoices: loadInvoices(),
    transactions: loadStoreTransactions(),
    cash: loadCashEntries(),
    rates,
    profitReset,
    profitResetByAccount: profitResetByAccount(accounts, loadClientProfitResets(), profitReset),
  });
  return { netMru: net.netMru, missing: net.missingCurrencies };
}

/** What customers owe me (only positive balances), per currency - the clients page's total. */
export function customersOwe(accounts: StarlinkAccountSummary[]): Record<string, number> {
  const clients = listClients(loadClientStore());
  const ledger = ourDebtLedgerForClients(loadLedgerStore(), accounts, clients);
  const invoices = loadInvoices();
  const adjustments = loadPartyAdjustments();
  const out: Record<string, number> = {};
  for (const client of clients) {
    const totals = computeClientCombinedTotals(invoices, adjustments, client.id, accounts.filter((a) => a.clientId === client.id), ledger);
    for (const [code, t] of Object.entries(totals)) if (t.remaining > 0.0001) out[code] = (out[code] ?? 0) + t.remaining;
  }
  return out;
}

export function cashBalance(): Record<string, number> {
  return computeCashBalanceByCurrency(loadCashEntries());
}

export function cardBalanceUsd(): number {
  return currentCardBalanceUsd(loadLedgerStore());
}
