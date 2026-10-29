/**
 * ✅ What the rep reads after the operator records his payment. For a rep whose customers are his
 * alone («🔒 زبائنه عنده فقط»), the debt is HIS: the message says what he still owes for his
 * devices - never «لم يبقَ على الزبون شيء», which told him he was clear (his Oct 2026 council).
 * Pure apart from reading his book / invoices / settlements from the phone.
 */

import { loadRepLedgerBook, repLedgerSummaries } from "./repLedgers";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { ClientStore } from "./clientStore";
import { loadInvoices } from "./invoiceStore";
import type { LedgerByAccount } from "./ledgerStore";
import { getCurrency, loadCurrencyStore } from "./currencyStore";
import { keepCurrency, makeRepConverter } from "./repAccount";
import { loadRepBook } from "./repClients";
import { loadRepDisplayCodes, repPosition } from "./repPosition";
import { loadRepSettlements, type Representative } from "./repStore";
import { formatMoneyShort, repWalletsText } from "./telegramRepMessages";

export function repPaymentConfirmationText(input: {
  value: number;
  currency: string;
  deviceName: string;
  clientName?: string;
  /** His own debt for his devices after this payment, per currency - only for «زبائنه عنده فقط». */
  repOwes?: Record<string, number>;
  /** What the device's customer still owes (the old wording, for other reps). */
  balanceAfter: number;
}): string {
  const head = `✅ سُجّلت دفعتك ${formatMoneyShort(input.value, input.currency)} عن ${input.deviceName}${input.clientName ? ` (${input.clientName})` : ""}`;
  if (input.repOwes) {
    const left = Object.entries(input.repOwes).filter(([, v]) => v > 0.005);
    return [head, left.length ? `🧾 الباقي عليك عن أجهزتك: ${left.map(([c, v]) => formatMoneyShort(v, c)).join(" + ")}` : "✓ لم يبقَ عليك شيء عن أجهزتك"].join("\n");
  }
  return [head, input.balanceAfter > 0.005 ? `المتبقي على الزبون: ${formatMoneyShort(input.balanceAfter, input.currency)}` : "✓ لم يبقَ على الزبون شيء"].join("\n");
}

export function repPaymentConfirmation(input: {
  rep?: Representative;
  value: number;
  currency: string;
  device: StarlinkAccountSummary;
  clientName?: string;
  balanceAfter: number;
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  ledgerStore: LedgerByAccount;
}): string {
  const { rep } = input;
  const repOwes = rep?.customersHidden
    ? repPosition({ rep, clients: input.clientStore, accounts: input.accounts, ledgerStore: input.ledgerStore, book: loadRepBook(), invoices: loadInvoices(), settlements: loadRepSettlements(), convert: keepCurrency }).owed
    : undefined;
  return repPaymentConfirmationText({
    value: input.value,
    currency: input.currency,
    deviceName: input.device.name,
    clientName: rep?.customersHidden ? undefined : input.clientName,
    balanceAfter: input.balanceAfter,
    ...(repOwes ? { repOwes } : {}),
  });
}

/**
 * 📂 «حساباتك الآن» under every confirmation the rep gets (his Oct 12 2026 ask: what he sends lands in
 * his accounts and he sees them) - his accounts right after the operator recorded it. "" when none.
 */
export function repWalletsNow(input: { rep?: Representative; accounts: StarlinkAccountSummary[]; clientStore: ClientStore; ledgerStore: LedgerByAccount }): string {
  if (!input.rep) return "";
  const store = loadCurrencyStore();
  const convert = makeRepConverter(loadRepDisplayCodes(), { MRU: getCurrency(store, "MRU")?.rateFromUsd, SIFA: getCurrency(store, "SIFA")?.rateFromUsd });
  const position = repPosition({ rep: input.rep, clients: input.clientStore, accounts: input.accounts, ledgerStore: input.ledgerStore, book: loadRepBook(), invoices: loadInvoices(), settlements: loadRepSettlements(), convert });
  return repWalletsText(position.wallets, repLedgerSummaries(loadRepLedgerBook(), input.rep.id)).replace("📂 حساباتك:", "📂 حساباتك الآن:");
}

/** 👀 His account balances right now (+ = له, − = عليه, each in its own currency): the normal accounts by
 * currency, and each named account by id + currency. */
export function repBalancesNow(input: { rep?: Representative; accounts: StarlinkAccountSummary[]; clientStore: ClientStore; ledgerStore: LedgerByAccount }): {
  wallets: Record<string, number>;
  named: Record<string, number>;
} {
  if (!input.rep) return { wallets: {}, named: {} };
  const position = repPosition({ rep: input.rep, clients: input.clientStore, accounts: input.accounts, ledgerStore: input.ledgerStore, book: loadRepBook(), invoices: loadInvoices(), settlements: loadRepSettlements(), convert: keepCurrency });
  const wallets: Record<string, number> = {};
  for (const w of position.wallets) if (w.id !== "profit") wallets[w.id] = w.balance[w.id] ?? 0;
  const named: Record<string, number> = {};
  for (const l of repLedgerSummaries(loadRepLedgerBook(), input.rep.id)) named[`${l.id}|${l.currencyCode}`] = l.balance;
  return { wallets, named };
}

/** 👀 What the rep owes in one account, as the operator reads it: «عليه 44,000 سيفا» / «له 6,000 أوقية» / «متوازن ✓». */
export function ownerBalanceWords(value: number, currency: string): string {
  if (Math.abs(value) < 0.005) return "متوازن ✓";
  return `${value < 0 ? "عليه" : "له"} ${formatMoneyShort(Math.abs(value), currency)}`;
}

/** The confirmation text with his accounts under it. */
export function withRepWallets(text: string, wallets: string): string {
  return wallets ? `${text}\n\n${wallets}` : text;
}
