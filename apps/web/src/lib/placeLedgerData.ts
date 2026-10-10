/**
 * 📄 Reads every store and builds one money place's «كشف حساب» (placeLedger.ts) - the same records
 * «حسابي» and the reports add up.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { loadCashEntries } from "./cashStore";
import { getClient, loadClientStore } from "./clientStore";
import { loadInvoices } from "./invoiceStore";
import { loadLedgerStore } from "./ledgerStore";
import { loadAccountsBook } from "./moneyAccounts";
import { buildMovements, moneyPlaces } from "./moneyMovements";
import { loadDebtBook, loadIncome } from "./myMoney";
import { loadPartyAdjustments } from "./partyBalanceStore";
import { loadPersonalExpenses } from "./personalExpenses";
import { buildPlaceLedger, type PlaceLedger } from "./placeLedger";
import { loadRemittances } from "./remittances";
import { loadRepresentativeStore, loadRepSettlements } from "./repStore";
import { loadCardTopUps } from "./starlinkDebt";
import { loadSupplierStore } from "./supplierStore";

export function loadPlaceLedger(placeId: string, devices: StarlinkAccountSummary[]): PlaceLedger | null {
  const book = loadAccountsBook();
  const place = moneyPlaces(book).find((p) => p.id === placeId);
  if (!place) return null;
  const clients = loadClientStore();
  const suppliers = loadSupplierStore();
  const reps = loadRepresentativeStore();
  const movements = buildMovements({
    ledger: loadLedgerStore(),
    invoices: loadInvoices(),
    adjustments: loadPartyAdjustments(),
    settlements: loadRepSettlements(),
    cash: loadCashEntries(),
    book,
    cardTopUps: loadCardTopUps(),
    incomes: loadIncome(),
    expenses: loadPersonalExpenses(),
    debts: loadDebtBook(),
    remittances: loadRemittances(),
    clientOf: (id) => devices.find((a) => a.id === id)?.clientId,
    deviceName: (id) => devices.find((a) => a.id === id)?.name,
    partyName: (kind, id) => (kind === "client" ? getClient(clients, id)?.name : kind === "supplier" ? suppliers[id]?.name : reps[id]?.name),
  });
  return buildPlaceLedger(place, movements);
}
