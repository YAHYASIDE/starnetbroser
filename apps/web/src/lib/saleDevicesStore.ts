/**
 * 📦 Saving a sale invoice together with its devices (his Oct 22 2026 rule: the invoice is never saved
 * while its devices silently fail): the invoice, its stock, its cash and the device list are written
 * as one (lib/saveTogether.ts). The device side is lib/saleDevices.ts.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { saveCashEntries, type CashEntryList } from "./cashStore";
import { getClient, loadClientStore } from "./clientStore";
import { commitDemoAccounts, loadDemoAccounts } from "./demoAccountStore";
import { saveInvoices, type Invoice, type InvoiceList } from "./invoiceStore";
import { releaseSaleDevices, syncSaleDevices, type SaleDevicesResult, isStarlinkItem } from "./saleDevices";
import { saveTogether } from "./saveTogether";
import { isDemoMode } from "./settingsStore";
import { loadStoreItems, saveStoreTransactions, type StoreTransactionList } from "./storeStore";

const KEYS = ["starnet_store_invoices_v1", "starnet_store_transactions_v1", "starnet_cash_entries_v1", "starnet_demo_accounts_v1"];

const newDeviceId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** The device list after this invoice (or its deletion, `invoice` undefined) - nothing written. */
export function planSaleDevices(accounts: StarlinkAccountSummary[], invoice: Invoice | undefined, invoiceId: string, now = new Date().toISOString()): SaleDevicesResult {
  if (!invoice) return releaseSaleDevices(accounts, invoiceId, now);
  const items = loadStoreItems();
  const client = getClient(loadClientStore(), invoice.clientId);
  return syncSaleDevices(accounts, {
    invoice,
    itemName: (id) => items[id]?.name,
    isDeviceItem: (id) => isStarlinkItem(items[id]),
    client: client ? { name: client.name, phone: client.phone } : undefined,
    now,
    newId: newDeviceId,
  });
}

export type InvoiceWithDevicesResult =
  | { ok: true; devices: SaleDevicesResult | null }
  | { ok: false; message: string };

/** Writes the invoice change and its devices as one - all or nothing. */
export function commitInvoiceWithDevices(
  change: { invoices: InvoiceList; transactions: StoreTransactionList; cash?: CashEntryList },
  invoice: Invoice | undefined,
  invoiceId: string,
): InvoiceWithDevicesResult {
  // Devices live on this phone only in the local (no-server) mode - the app's normal mode.
  const local = isDemoMode();
  const before = local ? loadDemoAccounts([]) : [];
  const devices = local ? planSaleDevices(before, invoice, invoiceId) : null;
  const touched = devices && (devices.created.length || devices.updated.length || devices.released.length);
  const saved = saveTogether(KEYS, () => {
    saveInvoices(change.invoices);
    saveStoreTransactions(change.transactions);
    if (change.cash) saveCashEntries(change.cash);
    if (touched) commitDemoAccounts(before, devices.accounts, "store-sale");
  });
  return saved.ok ? { ok: true, devices } : saved;
}
