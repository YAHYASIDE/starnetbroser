/**
 * What the Claude assistant (المساعد الذكي) knows about the business: one compact JSON snapshot
 * built from the phone's own stores, sent with every question so answers come from the operator's
 * real numbers. Per the operator's choice it includes names, phones and emails - but NEVER any
 * password (email, Wi-Fi), login session, product image or setting: fields are copied one by one
 * from an allow-list, never spread from the stored records.
 *
 * Profits use the app's own rules (computeShipmentProfit: only once Starlink is paid, dated on the
 * payment day), so the assistant never recomputes them differently from the reports.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeShipmentProfit, shipmentProfitDate, starlinkCostUsd } from "./accountingStore";
import { CashEntryList, computeCashBalanceByCurrency } from "./cashStore";
import { ClientStore, getClient } from "./clientStore";
import { CurrencyStore, listCurrencies } from "./currencyStore";
import { InvoiceList, invoiceBalanceDue, invoiceTotal } from "./invoiceStore";
import { LedgerByAccount, LedgerEntry, computeBalanceByCurrency } from "./ledgerStore";
import { PreviousDebtList, listOpenPreviousDebts } from "./previousDebt";
import { RepresentativeStore, getRepresentative } from "./repStore";
import { CardTopUpList, buildCardStatement, listCardPayments, listOpenShipmentDebts } from "./starlinkDebt";
import { StoreItemRegistry, StoreTransactionList, computeStockByItem, isLowStock } from "./storeStore";
import { SupplierStore, getSupplier } from "./supplierStore";

export interface BusinessData {
  today: string;
  accounts: StarlinkAccountSummary[];
  clients: ClientStore;
  reps: RepresentativeStore;
  suppliers: SupplierStore;
  ledger: LedgerByAccount;
  previousDebts: PreviousDebtList;
  cash: CashEntryList;
  topUps: CardTopUpList;
  invoices: InvoiceList;
  items: StoreItemRegistry;
  transactions: StoreTransactionList;
  currencies: CurrencyStore;
}

/** How far back device operations and invoices are sent (older ones only if still open). */
export const SNAPSHOT_HISTORY_DAYS = 400;

const r2 = (n: number) => Math.round(n * 100) / 100;

function roundAll(record: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(record)) if (Math.abs(v) >= 0.005) out[k] = r2(v);
  return out;
}

function daysBefore(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function entryRow(entry: LedgerEntry) {
  const row: Record<string, unknown> = {
    date: entry.date,
    type: entry.kind === "debit" ? "شحنة/تجديد (على الزبون)" : "دفعة (من الزبون)",
    amount: entry.amount,
    currency: entry.currency,
  };
  if (entry.note) row.note = entry.note;
  const cost = entry.starlinkCost;
  if (entry.kind === "debit" && cost) {
    const usd = starlinkCostUsd(entry);
    if (cost.waived) row.starlink = "D متروك (جهاز محروق) - كله ربح";
    else if (cost.status === "pending") row.starlink = usd !== undefined ? `D غير مدفوع لستارلينك: ${r2(usd)} USD` : "D غير مدفوع (مبلغ غير محدد)";
    else row.starlink = `مدفوع لستارلينك ${usd !== undefined ? `${r2(usd)} USD ` : ""}بتاريخ ${cost.paidAt ?? entry.date}${cost.paidVia === "card" ? " من بطاقة الكاش" : ""}`;
    const profit = computeShipmentProfit(entry);
    if (profit.status === "computed" && profit.profitUsd !== undefined) {
      row.profitUsd = r2(profit.profitUsd);
      row.profitDate = shipmentProfitDate(entry);
      if (profit.profitMru !== undefined) row.profitMru = Math.round(profit.profitMru);
    }
  }
  if (entry.representativeId) row.repPercent = entry.representativeCommissionPercent;
  if (entry.previousDebtId) row.previousDebtPayment = true;
  return row;
}

export function buildBusinessSnapshot(data: BusinessData) {
  const since = daysBefore(data.today, SNAPSHOT_HISTORY_DAYS);
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "جهاز محذوف";

  const devices = data.accounts.map((account) => {
    const entries = data.ledger[account.id] ?? [];
    const client = getClient(data.clients, account.clientId);
    const rep = getRepresentative(data.reps, account.representativeId);
    const kept = entries.filter((e) => e.date >= since || (e.kind === "debit" && e.starlinkCost?.status === "pending"));
    const device: Record<string, unknown> = {
      name: account.name,
      client: client?.name ?? null,
      rep: rep?.name ?? null,
      renewalDate: account.rechargeDate || null,
      state: account.deletedAt ? "محذوف (في السلة)" : account.archivedAt ? "مؤرشف" : account.deviceFault ? `متعطل (${account.deviceFault.reason === "burned" ? "محروق" : "عطل"})` : "نشط",
      balanceOwedByClient: roundAll(computeBalanceByCurrency(entries)),
      operations: kept.map(entryRow),
    };
    if (entries.length > kept.length) device.olderOperationsOmitted = entries.length - kept.length;
    if (account.serviceStatus) device.starlinkStatus = account.serviceStatus;
    if (account.planName) device.plan = account.planName;
    if (account.kitNumber) device.kit = account.kitNumber;
    if (account.phone) device.phone = account.phone;
    const email = account.expectedEmail || account.starlinkAccountEmail;
    if (email) device.email = email;
    if (account.balanceDue && account.balanceDue !== "0") device.starlinkBalanceDue = `${account.balanceDue} ${account.currency ?? ""}`.trim();
    if (account.renewalPlan) {
      const plan = account.renewalPlan;
      device.monthlyPlan = `يدفع الزبون ${plan.saleAmount} ${plan.saleCurrency}، تكلفة ستارلينك ${plan.costAmount} ${plan.costCurrency}`;
    }
    return device;
  });

  const clients = Object.values(data.clients).map((client) => {
    const owned = data.accounts.filter((a) => a.clientId === client.id);
    const total: Record<string, number> = {};
    for (const account of owned) {
      for (const [cur, amount] of Object.entries(computeBalanceByCurrency(data.ledger[account.id] ?? []))) total[cur] = (total[cur] ?? 0) + amount;
    }
    const row: Record<string, unknown> = { name: client.name, devices: owned.map((a) => a.name), devicesBalanceOwed: roundAll(total) };
    if (client.phone) row.phone = client.phone;
    if (client.creditLimit !== undefined) row.creditLimit = client.creditLimit;
    return row;
  });

  const reps = Object.values(data.reps).map((rep) => ({
    name: rep.name,
    ...(rep.phone ? { phone: rep.phone } : {}),
    commissionPercent: rep.commissionPercent,
    sharesLosses: Boolean(rep.sharesLosses),
    devices: data.accounts.filter((a) => a.representativeId === rep.id).map((a) => a.name),
  }));

  const openD = listOpenShipmentDebts(data.ledger).map((d) => ({ device: accountName(d.accountId), since: d.entry.date, usd: r2(d.costUsd) }));
  const previousDebts = listOpenPreviousDebts(data.previousDebts, data.ledger).map((d) => ({
    device: accountName(d.accountId),
    date: d.date,
    usd: d.amountUsd,
    ...(d.note ? { note: d.note } : {}),
  }));

  const stock = computeStockByItem(data.items, data.transactions);
  const storeItems = Object.values(data.items).map((item) => ({
    name: item.name,
    stock: stock[item.id] ?? 0,
    unit: item.unit,
    ...(isLowStock(item, stock[item.id] ?? 0) ? { lowStock: true } : {}),
    ...(item.defaultSalePrice !== undefined ? { salePrice: `${item.defaultSalePrice} ${item.defaultSaleCurrencyCode ?? ""}`.trim() } : {}),
  }));
  const invoices = data.invoices
    .filter((inv) => inv.date >= since || invoiceBalanceDue(inv) > 0)
    .map((inv) => ({
      date: inv.date,
      kind: inv.kind === "sale" ? "بيع" : "شراء",
      party: inv.kind === "sale" ? getClient(data.clients, inv.clientId)?.name ?? "زبون نقدي" : getSupplier(data.suppliers, inv.supplierId)?.name ?? "مورد",
      total: r2(invoiceTotal(inv)),
      remaining: r2(invoiceBalanceDue(inv)),
      currency: inv.currencyCode,
      items: inv.lines.map((l) => `${data.items[l.itemId]?.name ?? "منتج"} ×${l.quantity}`).join("، "),
    }));

  return {
    today: data.today,
    exchangeRatesPerUsd: Object.fromEntries(listCurrencies(data.currencies).map((c) => [c.code, c.rateFromUsd])),
    devices,
    clients,
    representatives: reps,
    starlinkOwed: { openD, previousDebts, totalUsd: r2(openD.reduce((s, d) => s + d.usd, 0) + previousDebts.reduce((s, d) => s + d.usd, 0)) },
    cashCardBalanceUsd: r2(buildCardStatement(data.topUps, listCardPayments(data.ledger)).balanceUsd),
    cashRegisterBalance: roundAll(computeCashBalanceByCurrency(data.cash)),
    store: { items: storeItems, invoices },
  };
}

export function snapshotText(data: BusinessData): string {
  return JSON.stringify(buildBusinessSnapshot(data));
}
