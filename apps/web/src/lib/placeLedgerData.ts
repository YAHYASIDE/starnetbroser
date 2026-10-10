/**
 * 📄 Reads every store and builds one money place's «كشف حساب» (placeLedger.ts) - the same records
 * «حسابي» and the reports add up.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { loadCashEntries } from "./cashStore";
import { getClient, loadClientStore } from "./clientStore";
import { loadInvoices } from "./invoiceStore";
import { loadLedgerStore } from "./ledgerStore";
import { accountDisplayUnit, loadAccountsBook, toDisplayAmount, type AccountsBook } from "./moneyAccounts";
import { buildMovements, moneyPlaces, placeBalance, type Movement } from "./moneyMovements";
import { accountForApp, BANK_APP_LABELS, loadBankInbox, noticeDay, partyLabel, pendingSuggestions } from "./bankNotices";
import { checkAlerts, loadBalanceAlerts, saveBalanceAlerts } from "./balanceAlerts";
import type { PendingNotice } from "./balanceMatch";
import { cashCurrencyLabel } from "./cashCurrencies";
import { formatAmount } from "./formatAmount";
import { loadDebtBook, loadIncome } from "./myMoney";
import { loadPartyAdjustments } from "./partyBalanceStore";
import { loadPersonalExpenses } from "./personalExpenses";
import { buildPlaceLedger, type PlaceLedger } from "./placeLedger";
import { loadRemittances } from "./remittances";
import { loadExchanges } from "./exchanges";
import { loadRepresentativeStore, loadRepSettlements } from "./repStore";
import { loadCardTopUps } from "./starlinkDebt";
import { loadSupplierStore } from "./supplierStore";

/** Every money movement, from storage (the same records «حسابي» adds up). */
function loadMovements(devices: StarlinkAccountSummary[], book: AccountsBook): Movement[] {
  const clients = loadClientStore();
  const suppliers = loadSupplierStore();
  const reps = loadRepresentativeStore();
  return buildMovements({
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
    exchanges: loadExchanges(),
    clientOf: (id) => devices.find((a) => a.id === id)?.clientId,
    deviceName: (id) => devices.find((a) => a.id === id)?.name,
    partyName: (kind, id) => (kind === "client" ? getClient(clients, id)?.name : kind === "supplier" ? suppliers[id]?.name : reps[id]?.name),
  });
}

export function loadPlaceLedger(placeId: string, devices: StarlinkAccountSummary[]): PlaceLedger | null {
  const book = loadAccountsBook();
  const place = moneyPlaces(book).find((p) => p.id === placeId);
  if (!place) return null;
  return buildPlaceLedger(place, loadMovements(devices, book));
}

/** Every place's balance per currency now (placeId → currency → amount). */
export function loadPlaceBalances(devices: StarlinkAccountSummary[]): Record<string, Record<string, number>> {
  const book = loadAccountsBook();
  const movements = loadMovements(devices, book);
  return Object.fromEntries(moneyPlaces(book).map((place) => [place.id, placeBalance(place, movements, "9999-12-31")]));
}

/** 📩 The bank notifications still waiting for him that touch this place (+ in / − out). */
export function pendingForPlace(placeId: string): PendingNotice[] {
  const book = loadAccountsBook();
  const out: PendingNotice[] = [];
  for (const s of pendingSuggestions(loadBankInbox())) {
    if (s.amount === undefined) continue;
    const date = noticeDay(s.at);
    const label = `${BANK_APP_LABELS[s.app] ?? s.app} · ${partyLabel(s.party) || "عملية"}`;
    const isHere = (app: string | undefined) => accountForApp(book.accounts, app)?.id === placeId;
    if (s.kind === "transfer") {
      if (isHere(s.fromApp)) out.push({ id: s.id, signed: -s.amount, label, date });
      if (isHere(s.toApp)) out.push({ id: s.id, signed: s.amount, label, date });
    } else if (isHere(s.app)) {
      out.push({ id: s.id, signed: s.kind === "in" ? s.amount : -s.amount, label, date });
    }
  }
  return out;
}

/** 🔔 Checks every floor he set; the phone is told once per crossing (lib/balanceAlerts.ts). Returns
 * the places / currencies low now (for the red mark). */
export function runBalanceAlerts(devices: StarlinkAccountSummary[], notify: (text: string) => void): string[] {
  const alerts = loadBalanceAlerts();
  if (Object.keys(alerts.thresholds).length === 0) return [];
  const balances = loadPlaceBalances(devices);
  const { alerts: next, newlyLow } = checkAlerts(alerts, balances);
  saveBalanceAlerts(next);
  const book = loadAccountsBook();
  const places = moneyPlaces(book);
  for (const key of newlyLow) {
    const [placeId, currency] = key.split("|") as [string, string];
    const place = places.find((p) => p.id === placeId);
    const account = book.accounts.find((a) => a.id === placeId);
    const unit = account ? accountDisplayUnit(account) : null;
    const show = (v: number) => (unit && currency === account?.currencyCode ? `${formatAmount(Math.round(toDisplayAmount(v, unit)))} ${unit.label}` : `${formatAmount(Math.round(v * 100) / 100)} ${cashCurrencyLabel(currency)}`);
    notify(`🔔 رصيد ${place?.icon ?? ""} ${place?.name ?? placeId} نزل تحت ${show(next.thresholds[key]!)}\nالآن: ${show(balances[placeId]?.[currency] ?? 0)}`);
  }
  return next.notified;
}
