/**
 * 🛂 A rep's «توثيق الأجهزة» account (his Oct 19 2026 ask «يجب أن يكون تابع لأجهزة المندوب التي
 * وثقنا له»): every «💰 سعر التوثيق» on that rep's verified devices is a «عليه» line there, named by
 * the device, changed and removed with the price - instead of a debt in his normal account.
 *
 * The price still posts its debt on the device's ledger first (lib/travelRegistration.ts
 * applyTravelFee, the same for customers); this moves it into the rep's account when he has one, so
 * nothing is counted twice: the device's debt leaves, the account's line arrives. A debt a payment
 * was already allocated to stays where it was paid. Older registrations' lines stay. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import type { PaymentAllocation } from "./paymentAllocationStore";
import { repTravelLedgerOf, type RepLedgerBook, type RepLedgerEntry } from "./repLedgers";
import { travelRepOf } from "./travelBook";
import { isTravelVerified, travelFeeKey } from "./travelRegistration";

export function travelLineKey(accountId: string, feeKey: string): string {
  return `${accountId}|${feeKey}`;
}

/** The registrations whose debt is a line in a rep's «توثيق الأجهزة» (for «لا دين عليه» checks). */
export function travelLedgerKeys(book: RepLedgerBook): Set<string> {
  return new Set(book.entries.filter((e) => e.travelFor).map((e) => e.travelFor!));
}

export interface TravelLedgerSync {
  book: RepLedgerBook;
  ledger: LedgerByAccount;
  changed: boolean;
}

export function syncRepTravelLedgers(
  accounts: StarlinkAccountSummary[],
  ledger: LedgerByAccount,
  book: RepLedgerBook,
  allocations: PaymentAllocation[],
  today: string,
  now: Date = new Date(),
  newId: () => string = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `rle-${now.getTime()}-${Math.random()}`),
): TravelLedgerSync {
  const paid = new Set(allocations.map((a) => a.shipmentEntryId));
  let ledgers = book.ledgers;
  let entries = book.entries;
  let nextLedger = ledger;
  let changed = false;

  const ensureCurrency = (ledgerId: string, code: string) => {
    if (ledgers.some((l) => l.id === ledgerId && !l.currencies.includes(code))) ledgers = ledgers.map((l) => (l.id === ledgerId ? { ...l, currencies: [...l.currencies, code] } : l));
  };
  const line = (ledgerId: string, key: string, account: StarlinkAccountSummary, amount: number, currencyCode: string, date: string): RepLedgerEntry => ({
    id: newId(),
    ledgerId,
    direction: "debit",
    amount,
    currencyCode,
    date,
    note: account.name,
    travelFor: key,
    createdAt: now.toISOString(),
  });

  for (const account of accounts) {
    const repId = travelRepOf(account);
    const target = repId ? repTravelLedgerOf({ ledgers, entries }, repId) : undefined;
    if (!target) continue;
    const deviceEntries = nextLedger[account.id] ?? [];
    const kept: LedgerEntry[] = [];
    let moved = false;
    // The device's travel debts (any registration) move into the account, unless a payment was
    // allocated to them.
    for (const e of deviceEntries) {
      if (typeof e.travelFeeFor !== "string" || paid.has(e.id)) {
        kept.push(e);
        continue;
      }
      moved = true;
      const key = travelLineKey(account.id, e.travelFeeFor);
      if (!entries.some((x) => x.travelFor === key)) {
        ensureCurrency(target.id, e.currency);
        entries = [...entries, line(target.id, key, account, e.amount, e.currency, e.date)];
      }
    }
    if (moved) {
      nextLedger = { ...nextLedger, [account.id]: kept };
      changed = true;
    }
    if (!isTravelVerified(account)) continue;
    // The current registration follows its price.
    const feeKey = travelFeeKey(account);
    const key = travelLineKey(account.id, feeKey);
    if (kept.some((e) => e.travelFeeFor === feeKey)) continue; // paid where it was
    const price = account.travelRegistrationPrice;
    const existing = entries.find((x) => x.travelFor === key);
    if (!price || !(price.amount > 0)) {
      if (existing) {
        entries = entries.filter((x) => x.id !== existing.id);
        changed = true;
      }
      continue;
    }
    if (!existing) {
      ensureCurrency(target.id, price.currency);
      entries = [...entries, line(target.id, key, account, price.amount, price.currency, today)];
      changed = true;
    } else if (existing.amount !== price.amount || existing.currencyCode !== price.currency) {
      ensureCurrency(target.id, price.currency);
      entries = entries.map((x) => (x.id === existing.id ? { ...x, amount: price.amount, currencyCode: price.currency } : x));
      changed = true;
    }
  }
  if (ledgers !== book.ledgers) changed = true;
  return { book: { ledgers, entries }, ledger: nextLedger, changed };
}
