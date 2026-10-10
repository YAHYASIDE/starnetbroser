"use client";

/**
 * 💰 «حسابي»'s inputs from the rest of the app - the same calculations the reports («الصافي») and
 * the clients page («مجموع ما لنا عند الزبائن») already show, so the final figures match them.
 */

import { isFrancAccount } from "./payCurrency";
import { loadRemittances, remittanceDebtors, remittanceFlows } from "./remittances";
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
import { cardMovementFlows, currentCardBalanceUsd, loadCardTopUps } from "./starlinkDebt";
import { loadStoreTransactions } from "./storeStore";
import { computeSupplierStoreBalance } from "./invoiceStore";
import { accountBalance, cashInHandEntries, devicePaymentFlows, partyFlows, type AccountFlow, type AccountsBook, type MoneyAccount } from "./moneyAccounts";
import type { LedgerByAccount } from "./ledgerStore";
import { personalFlows, type DebtBook, type IncomeList, type WealthInput } from "./myMoney";
import type { PersonalExpense } from "./personalExpenses";
import { listOpenPreviousDebts, loadPreviousDebts } from "./previousDebt";
import { listRepresentatives, loadRepresentativeStore, loadRepSettlements } from "./repStore";
import { repBalancesMru } from "./reportsView";
import { listOpenShipmentDebts } from "./starlinkDebt";
import { listSuppliers, loadSupplierStore } from "./supplierStore";

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
    cardTopUps: loadCardTopUps(),
  });
  return { netMru: net.netMru, missing: net.missingCurrencies };
}

/** Everything that went through one bank / wallet: customers' device payments by its method, my
 * own records on it (`personal` = myMoney.personalFlows), and supplier / rep payments recorded
 * from a bank notification. `accounts` = the whole book's accounts (a payment in a currency its
 * app doesn't hold is routed to that currency's cash wallet - devicePaymentAccountId). */
export function loadAccountFlows(ledger: LedgerByAccount, account: MoneyAccount, personal: AccountFlow[], accounts: MoneyAccount[]): AccountFlow[] {
  return [
    ...devicePaymentFlows(ledger, account, accounts),
    ...personal,
    ...partyFlows(loadPartyAdjustments(), loadRepSettlements()),
    ...cardMovementFlows(loadCardTopUps()),
    // 💸 «تحويل الأموال»: money in from the customer, out to the beneficiary.
    ...remittanceFlows(loadRemittances()),
  ];
}

/** Everything «كل ما تملك» is made of, read from the app's own records (same figures as the
 * clients, suppliers, representatives, reports and «ستارلينك والبطاقة» pages). */
export function loadWealthInput(input: {
  accounts: StarlinkAccountSummary[];
  rates: RatesFromUsd;
  incomes: IncomeList;
  expenses: PersonalExpense[];
  debts: DebtBook;
  book: AccountsBook;
}): WealthInput {
  const ledger = loadLedgerStore();
  const invoices = loadInvoices();
  const adjustments = loadPartyAdjustments();
  const deviceName = (id: string) => input.accounts.find((a) => a.id === id)?.name ?? "جهاز";

  const flows = personalFlows(input.incomes, input.expenses, input.debts);
  const banks = input.book.accounts.map((account) => ({
    name: `${account.icon} ${account.name}`,
    byCurrency: accountBalance(input.book, account, loadAccountFlows(ledger, account, flows, input.book.accounts)),
    ...(isFrancAccount(account) ? { franc: true } : {}),
  }));

  const clients = listClients(loadClientStore());
  const debtLedger = ourDebtLedgerForClients(ledger, input.accounts, clients);
  // One pass per client: a positive remaining = he owes us («لك عند الزبائن»); a negative one = we
  // owe him a credit («له رصيد» → «عليك للزبائن»). Before this both negatives were dropped, so a
  // customer we owed never appeared anywhere (his Oct 2026 report: «شخص له عندنا 1,917,900 لا يظهر»).
  const clientTotals = clients.map((client) => {
    const totals = computeClientCombinedTotals(invoices, adjustments, client.id, input.accounts.filter((a) => a.clientId === client.id), debtLedger);
    const owes: Record<string, number> = {};
    const credit: Record<string, number> = {};
    for (const [code, t] of Object.entries(totals)) {
      if (t.remaining > 0.0001) owes[code] = t.remaining;
      else if (t.remaining < -0.0001) credit[code] = -t.remaining;
    }
    return { name: client.name, owes, credit };
  });
  const customers = [
    ...clientTotals.filter((c) => Object.keys(c.owes).length > 0).map((c) => ({ name: c.name, byCurrency: c.owes })),
    // 💸 what's still owed on transfers («تحويل الأموال»)
    ...remittanceDebtors(loadRemittances()),
  ];
  const customersOwe = clientTotals.filter((c) => Object.keys(c.credit).length > 0).map((c) => ({ name: c.name, byCurrency: c.credit }));

  const suppliers = listSuppliers(loadSupplierStore())
    .map((supplier) => {
      const byCurrency: Record<string, number> = {};
      for (const [code, v] of Object.entries(computeSupplierStoreBalance(invoices, supplier.id, adjustments))) if (v > 0.0001) byCurrency[code] = v;
      return { name: supplier.name, byCurrency };
    })
    .filter((s) => Object.keys(s.byCurrency).length > 0);

  const starlinkByDevice = new Map<string, number>();
  for (const d of listOpenShipmentDebts(ledger)) starlinkByDevice.set(d.accountId, (starlinkByDevice.get(d.accountId) ?? 0) + d.costUsd);
  for (const d of listOpenPreviousDebts(loadPreviousDebts(), ledger)) starlinkByDevice.set(d.accountId, (starlinkByDevice.get(d.accountId) ?? 0) + d.amountUsd);

  // repBalancesMru: positive = we owe him; here positive = he owes me.
  const repsMru = repBalancesMru(listRepresentatives(loadRepresentativeStore()), ledger, invoices, loadRepSettlements(), input.rates).map((r) => ({
    name: r.rep.name,
    mru: -r.balanceMru,
  }));

  return {
    cash: computeCashBalanceByCurrency(cashInHandEntries(loadCashEntries(), ledger, input.book)),
    banks,
    cardUsd: currentCardBalanceUsd(ledger),
    customers,
    customersOwe,
    repsMru,
    debts: input.debts,
    suppliers,
    starlink: Array.from(starlinkByDevice, ([id, usd]) => ({ name: deviceName(id), usd })),
    rates: input.rates,
  };
}
