/**
 * مركز التذكيرات: pure logic for the three daily-nudge lists shown on /reminders (and summarized
 * as a header badge count on the home page) - renewals due soon, unpaid balances (both the
 * device/Starlink ledger and the store's own retail invoices, kept separate since they're
 * different businesses), and store items running low. Every function here just reads existing
 * data (ledgerStore.ts, invoiceStore.ts, storeStore.ts) - nothing new is persisted.
 */

import { StarlinkAccountSummary } from "@starnet/shared";
import { daysRemainingNumber } from "./date";
import { BalanceByCurrency, computeBalanceByCurrency, LEDGER_CURRENCIES, LedgerByAccount } from "./ledgerStore";
import { Client, ClientStore, listClients } from "./clientStore";
import { computeClientStoreBalance, InvoiceList } from "./invoiceStore";
import { computeStock, isLowStock, listStoreItems, StoreItem, StoreItemRegistry, StoreTransactionList } from "./storeStore";

export interface RenewalReminder {
  account: StarlinkAccountSummary;
  /** Signed days until the renewal date - 0 is "due today", negative is overdue. */
  daysRemaining: number;
}

/** Active accounts whose renewal is due within `thresholdDays` (default 1, i.e. starts appearing
 * the day before) - stays listed through "due today" and however many days overdue, since the
 * point is "still needs a nudge", not a single-day window that then hides an unrenewed account. */
export function computeRenewalReminders(
  accounts: StarlinkAccountSummary[],
  thresholdDays = 1,
): RenewalReminder[] {
  const reminders: RenewalReminder[] = [];
  for (const account of accounts) {
    if (account.archivedAt || account.deletedAt) continue;
    const daysRemaining = daysRemainingNumber(account.rechargeDate || account.standbyDate || "");
    if (daysRemaining === null || daysRemaining > thresholdDays) continue;
    reminders.push({ account, daysRemaining });
  }
  return reminders.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export interface DeviceDebtReminder {
  account: StarlinkAccountSummary;
  balances: BalanceByCurrency;
}

/** Active accounts with a positive Starlink-ledger balance (money owed BY the customer) in any
 * currency - a negative/zero balance (paid up, or a credit owed back to them) never needs a
 * collection nudge. */
export function computeDeviceDebtReminders(
  accounts: StarlinkAccountSummary[],
  ledgerStore: LedgerByAccount,
): DeviceDebtReminder[] {
  const reminders: DeviceDebtReminder[] = [];
  for (const account of accounts) {
    if (account.archivedAt || account.deletedAt) continue;
    const entries = ledgerStore[account.id] ?? [];
    if (entries.length === 0) continue;
    const balances = computeBalanceByCurrency(entries);
    const owesSomething = LEDGER_CURRENCIES.some((c) => (balances[c] ?? 0) > 0.0001);
    if (!owesSomething) continue;
    reminders.push({ account, balances });
  }
  return reminders;
}

export interface StoreDebtReminder {
  client: Client;
  balances: Record<string, number>;
}

/** Clients with a positive store-invoice balance (money owed BY them for retail purchases) - the
 * store's own separate business from the device ledger above, per computeClientStoreBalance's own
 * "never mixed" currency rule. */
export function computeStoreDebtReminders(clientStore: ClientStore, invoices: InvoiceList): StoreDebtReminder[] {
  const reminders: StoreDebtReminder[] = [];
  for (const client of listClients(clientStore)) {
    const balance = computeClientStoreBalance(invoices, client.id);
    const owed = Object.fromEntries(Object.entries(balance).filter(([, amount]) => amount > 0.0001));
    if (Object.keys(owed).length === 0) continue;
    reminders.push({ client, balances: owed });
  }
  return reminders;
}

export interface LowStockReminder {
  item: StoreItem;
  stock: number;
}

/** Store items at or below their own configured low-stock threshold (see storeStore.ts's
 * isLowStock) - an item with no threshold set never appears here, never a guessed default. */
export function computeLowStockReminders(
  items: StoreItemRegistry,
  transactions: StoreTransactionList,
): LowStockReminder[] {
  const reminders: LowStockReminder[] = [];
  for (const item of listStoreItems(items)) {
    const stock = computeStock(transactions, item.id);
    if (isLowStock(item, stock)) reminders.push({ item, stock });
  }
  return reminders;
}

/** True once `thresholdDays` (default 7) have passed since the last export backup - or
 * immediately true when one was never taken at all (lastBackupAt === null), since all of this
 * app's data lives only on this one device (settingsStore.ts's getLastBackupAt). */
export function isBackupOverdue(lastBackupAt: string | null, thresholdDays = 7, now: Date = new Date()): boolean {
  if (lastBackupAt === null) return true;
  const last = new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) return true;
  const diffDays = (now.getTime() - last.getTime()) / 86_400_000;
  return diffDays >= thresholdDays;
}
