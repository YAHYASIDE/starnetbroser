"use client";

/**
 * Storage glue for repClients.ts (the pure part): the rep handing us money, spread over his
 * customers' devices, and his bot's book entries.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { loadCashEntries, postRepSettlementToCash, saveCashEntries } from "./cashStore";
import { loadClientStore } from "./clientStore";
import { saveClientDevicePayment } from "./clientDevicePaymentSave";
import { loadDemoAccounts } from "./demoAccountStore";
import { demoAccounts } from "./demoData";
import { LEDGER_CURRENCIES, loadLedgerStore, type LedgerCurrency, type PaymentMethod } from "./ledgerStore";
import { devicePaymentAccountId, loadAccountsBook } from "./moneyAccounts";
import { planRepHandover, replayRepClients, loadRepBook } from "./repClients";
import { loadRepresentativeStore, loadRepSettlements, recordRepSettlement, saveRepSettlements } from "./repStore";
import { isDemoMode } from "./settingsStore";

export function loadStoredAccounts(): StarlinkAccountSummary[] {
  return isDemoMode() ? loadDemoAccounts(demoAccounts) : [];
}

export interface RepHandoverOutcome {
  ok: true;
  /** Paid onto his customers' devices (his debt to us for them). */
  toDevices: number;
  /** The rest, recorded as before: a cash handover on his account. */
  remainder: number;
}

/** The rep hands us money: first it settles what he owes us for his own customers' devices
 * (largest first, each a device payment tagged with him, with its cash-register entry); whatever
 * is left is a cash handover on his account, exactly as before. */
export function recordRepMoneyHandover(
  repId: string,
  input: { amount: number; currencyCode: string; date: string; note?: string; rates?: Record<string, number>; paymentMethod?: PaymentMethod },
  accounts: StarlinkAccountSummary[] = loadStoredAccounts(),
): RepHandoverOutcome | { ok: false; message: string } {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "المبلغ يجب أن يكون أكبر من صفر" };
  // 🏦 Sent through an app of «حسابي» (his Oct 11 2026 report: 70,000 فرانك on أورانج and 130,000 on نيتا
  // from his rep landed in الكاش): the money goes to that account, not to الكاش.
  const method = input.paymentMethod && input.paymentMethod !== "cash" ? input.paymentMethod : undefined;
  const moneyAccountId = method ? devicePaymentAccountId({ paymentMethod: method, currency: input.currencyCode }, loadAccountsBook().accounts) : null;
  let ledger = loadLedgerStore();
  let toDevices = 0;
  let remainder = input.amount;
  if (LEDGER_CURRENCIES.includes(input.currencyCode as LedgerCurrency)) {
    const replays = replayRepClients(loadClientStore(), accounts, ledger, loadRepBook());
    const plan = planRepHandover(repId, input.amount, input.currencyCode, accounts, ledger, replays);
    remainder = plan.remainder;
    for (const { accountId, amount } of plan.allocations) {
      const device = accounts.find((a) => a.id === accountId);
      if (!device) {
        remainder += amount;
        continue;
      }
      const result = saveClientDevicePayment(ledger, { id: device.id, name: device.name, email: device.expectedEmail }, {
        amount,
        currencyCode: input.currencyCode,
        date: input.date,
        note: input.note || "سلّمها المندوب",
        paymentMethod: moneyAccountId ? method : "cash",
        cashMoved: !moneyAccountId,
        heldByRepId: repId,
      });
      if (!result.ok) return result;
      ledger = result.ledgerStore;
      toDevices += amount;
    }
  }
  if (remainder > 0.005) {
    const result = recordRepSettlement(loadRepSettlements(), {
      representativeId: repId,
      kind: "cashHandover",
      amount: Math.round(remainder * 100) / 100,
      currencyCode: input.currencyCode,
      date: input.date,
      note: input.note,
      rates: input.rates,
      ...(moneyAccountId ? { accountId: moneyAccountId } : {}),
    });
    if (!result.ok) return result;
    saveRepSettlements(result.settlements);
    if (!moneyAccountId) saveCashEntries(postRepSettlementToCash(loadCashEntries(), result.settlement, loadRepresentativeStore()[repId]?.name ?? ""));
  }
  return { ok: true, toDevices: Math.round(toDevices * 100) / 100, remainder: remainder > 0.005 ? Math.round(remainder * 100) / 100 : 0 };
}
