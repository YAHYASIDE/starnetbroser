/**
 * 📊 The finance dashboard's inputs (components/FinanceDashboard.tsx), assembled from the app's own
 * records - moved out of the reports page when the dashboard moved into «💰 حسابي» (his Oct 12 2026
 * choice «ننقلها كلها إلى حسابي»). The same figures the reports page computed, nothing recalculated
 * differently: `loadFinanceStores` reads storage, `assembleFinanceDashboard` is pure.
 */

import { loadBusinessExpenses, type BusinessExpenseList } from "./businessExpenses";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { DashBooks, DashSnapshot } from "@/components/FinanceDashboard";
import { loadCashEntries, type CashEntryList } from "./cashStore";
import { loadClientProfitResets, profitResetByAccount } from "./clientBulk";
import { getClient, listClients, loadClientStore, type ClientStore } from "./clientStore";
import { loadCurrencyStore } from "./currencyStore";
import { computeDebtAging } from "./debtAging";
import type { DashInput } from "./financeDashboard";
import type { MoneyInput } from "./financeAnalysis";
import { computeSupplierStoreBalance, loadInvoices, type InvoiceList } from "./invoiceStore";
import { loadLedgerStore, type LedgerByAccount } from "./ledgerStore";
import { loadAccountsBook, type AccountsBook } from "./moneyAccounts";
import { loadDebtBook, loadIncome, type DebtBook, type IncomeList } from "./myMoney";
import { loadPartyAdjustments, type PartyAdjustmentList } from "./partyBalanceStore";
import { allStoredAllocations, loadAllocationStore, type AllocationsByAccount } from "./paymentAllocationStore";
import { loadPromises, type PaymentPromise } from "./paymentPromises";
import { loadPersonalExpenses, type PersonalExpenseList } from "./personalExpenses";
import { listOpenPreviousDebts, loadPreviousDebts, totalPreviousDebtUsd, type PreviousDebtList } from "./previousDebt";
import { loadProfitReset, type ProfitReset } from "./profitReset";
import { loadHiddenProfitDays, withoutHiddenProfitDays, type HiddenProfitDays } from "./profitStatement";
import { loadRemittances, type RemittanceList } from "./remittances";
import { loadExchanges, type ExchangeList } from "./exchanges";
import { loadRepresentativeStore, loadRepSettlements, type RepresentativeStore, type RepSettlementList } from "./repStore";
import { isRepWorkspace } from "./repMode";
import { sumToMru, type RatesFromUsd } from "./reportsView";
import { buildCardStatement, listCardPayments, listOpenShipmentDebts, loadCardTopUps, totalOpenDebtUsd, type CardTopUpList } from "./starlinkDebt";
import { loadStoreTransactions, type StoreTransactionList } from "./storeStore";
import { listSuppliers, loadSupplierStore, type SupplierStore } from "./supplierStore";

export interface FinanceStores {
  ledger: LedgerByAccount;
  hiddenDays: HiddenProfitDays;
  clients: ClientStore;
  invoices: InvoiceList;
  transactions: StoreTransactionList;
  cash: CashEntryList;
  rates: RatesFromUsd;
  reps: RepresentativeStore;
  settlements: RepSettlementList;
  adjustments: PartyAdjustmentList;
  cardTopUps: CardTopUpList;
  businessExpenses: BusinessExpenseList;
  previousDebts: PreviousDebtList;
  profitReset: ProfitReset | null;
  clientResets: ReturnType<typeof loadClientProfitResets>;
  allocations: AllocationsByAccount;
  book: AccountsBook;
  incomes: IncomeList;
  expenses: PersonalExpenseList;
  debts: DebtBook;
  promises: PaymentPromise[];
  remittances: RemittanceList;
  exchanges: ExchangeList;
  suppliers: SupplierStore;
  ownerView: boolean;
}

export function loadFinanceStores(): FinanceStores {
  const rates: RatesFromUsd = {};
  for (const [code, currency] of Object.entries(loadCurrencyStore())) rates[code] = currency.rateFromUsd;
  return {
    ledger: loadLedgerStore(),
    hiddenDays: loadHiddenProfitDays(),
    clients: loadClientStore(),
    invoices: loadInvoices(),
    transactions: loadStoreTransactions(),
    cash: loadCashEntries(),
    rates,
    reps: loadRepresentativeStore(),
    settlements: loadRepSettlements(),
    adjustments: loadPartyAdjustments(),
    cardTopUps: loadCardTopUps(),
    businessExpenses: loadBusinessExpenses(),
    previousDebts: loadPreviousDebts(),
    profitReset: loadProfitReset(),
    clientResets: loadClientProfitResets(),
    allocations: loadAllocationStore(),
    book: loadAccountsBook(),
    incomes: loadIncome(),
    expenses: loadPersonalExpenses(),
    debts: loadDebtBook(),
    promises: loadPromises(),
    remittances: loadRemittances(),
    exchanges: loadExchanges(),
    suppliers: loadSupplierStore(),
    ownerView: !isRepWorkspace(),
  };
}

export interface FinanceDashboardData {
  input: DashInput;
  money: MoneyInput;
  snapshot: DashSnapshot;
  books: DashBooks;
  clientName: (clientId: string) => string | undefined;
}

export function assembleFinanceDashboard(s: FinanceStores, accounts: StarlinkAccountSummary[], today: string): FinanceDashboardData {
  const mruRate = s.rates.MRU;
  const clients = listClients(s.clients);
  const resetByAccount = profitResetByAccount(accounts, s.clientResets, s.profitReset);
  const input: DashInput = {
    ledgerStore: withoutHiddenProfitDays(s.ledger, s.hiddenDays),
    activityLedger: s.ledger,
    invoices: s.invoices,
    transactions: s.transactions,
    cash: s.cash,
    rates: s.rates,
    cardTopUps: s.cardTopUps,
    businessExpenses: s.businessExpenses,
    profitReset: s.profitReset,
    profitResetByAccount: resetByAccount,
    clientOf: (id) => accounts.find((a) => a.id === id)?.clientId,
  };

  // 🧾 what customers owe now, one figure per party (the «الديون» tab's list).
  const aging = computeDebtAging({ clients, accounts, invoices: s.invoices, adjustments: s.adjustments, ledgerStore: s.ledger, today });
  const parties = new Map<string, Record<string, number>>();
  for (const row of aging) {
    const key = `${row.kind}-${row.id}`;
    const byCurrency = parties.get(key) ?? {};
    byCurrency[row.currencyCode] = (byCurrency[row.currencyCode] ?? 0) + row.total;
    parties.set(key, byCurrency);
  }
  const debtorsTotal = [...parties.values()].reduce((sum, byCurrency) => sum + sumToMru(byCurrency, s.rates).mru, 0);

  // 🏭 what I owe suppliers now.
  let suppliersMru = 0;
  let suppliersCount = 0;
  let known = true;
  for (const supplier of listSuppliers(s.suppliers)) {
    const owed: Record<string, number> = {};
    for (const [code, v] of Object.entries(computeSupplierStoreBalance(s.invoices, supplier.id, s.adjustments))) if (v > 0.0001) owed[code] = v;
    if (Object.keys(owed).length === 0) continue;
    suppliersCount += 1;
    const sum = sumToMru(owed, s.rates);
    if (sum.missing.length) known = false;
    suppliersMru += sum.mru;
  }

  const starlinkUsd = totalOpenDebtUsd(listOpenShipmentDebts(s.ledger)) + totalPreviousDebtUsd(listOpenPreviousDebts(s.previousDebts, s.ledger));
  const active = accounts.filter((a) => !a.archivedAt && !a.deletedAt);
  const snapshot: DashSnapshot = {
    debtorsMru: mruRate ? debtorsTotal : undefined,
    debtorsCount: parties.size,
    owedStarlinkMru: mruRate ? starlinkUsd * mruRate : undefined,
    activeDevices: active.length,
    activeClients: new Set(active.map((a) => a.clientId).filter(Boolean)).size,
    suppliersMru: known && (mruRate || suppliersCount === 0) ? suppliersMru : undefined,
    suppliersCount,
  };

  const money: MoneyInput = { ledger: s.ledger, invoices: s.invoices, adjustments: s.adjustments, settlements: s.settlements, cash: s.cash, rates: s.rates };

  const used = new Set<string>();
  for (const entries of Object.values(s.ledger)) for (const e of entries) used.add(e.currency);
  for (const c of s.cash) used.add(c.currencyCode);
  for (const inv of s.invoices) used.add(inv.currencyCode);
  for (const a of s.adjustments) used.add(a.currencyCode);
  const month = today.slice(0, 7);
  const books: DashBooks = {
    book: s.book,
    cardTopUps: s.cardTopUps,
    incomes: s.incomes,
    expenses: s.expenses,
    debts: s.debts,
    allocations: allStoredAllocations(s.allocations),
    promises: s.promises,
    remittances: s.remittances,
    exchanges: s.exchanges,
    suppliers: listSuppliers(s.suppliers).map((x) => ({ id: x.id, name: x.name })),
    previousDebts: s.previousDebts,
    debtors: computeDebtAging({ clients, accounts, invoices: s.invoices, adjustments: s.adjustments, ledgerStore: s.ledger, today, includeCredit: true }),
    newClientsThisMonth: clients.filter((c) => c.createdAt?.startsWith(month)).length,
    cardBalanceUsd: buildCardStatement(s.cardTopUps, listCardPayments(s.ledger)).balanceUsd,
    usedCurrencies: [...used],
    partyName: (kind, id) => (kind === "client" ? getClient(s.clients, id)?.name : kind === "supplier" ? s.suppliers[id]?.name : s.reps[id]?.name),
    ownerView: s.ownerView,
  };

  return { input, money, snapshot, books, clientName: (id) => getClient(s.clients, id)?.name };
}
