/**
 * ملخص آخر اليوم: one evening notification with the day's figures - what customers paid, the
 * shipments recorded, the expenses, what's in the till, and who still owes. Every figure stays in
 * its own currency. Like the morning digest, a notification's text is fixed when it's scheduled,
 * so the home page reschedules it whenever the data changes; everything is recorded in the app,
 * so the last reschedule of the day already holds the day's final figures.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { computeCashBalanceByCurrency, listStandaloneCashEntries, type CashEntryList } from "./cashStore";
import { formatAmount } from "./formatAmount";
import { computeBalanceByCurrency, LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency } from "./ledgerStore";

const EPSILON = 0.005;
export const EVENING_SUMMARY_ID = 7200;

export interface EveningSummary {
  title: string;
  /** One line per figure. */
  lines: string[];
}

function money(values: Record<string, number>): string {
  return Object.entries(values)
    .filter(([, v]) => Math.abs(v) > EPSILON)
    .map(([code, v]) => `${v < 0 ? "-" : ""}${formatAmount(Math.abs(v))} ${LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}`)
    .join(" + ");
}

function add(target: Record<string, number>, currency: string, amount: number) {
  target[currency] = (target[currency] ?? 0) + amount;
}

/** The summary for `day` (yyyy-mm-dd), or null when there's no business data at all yet. */
export function buildEveningSummary(input: {
  day: string;
  accounts: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  cash: CashEntryList;
}): EveningSummary | null {
  const live = input.accounts.filter((a) => !a.deletedAt && !a.archivedAt);
  const liveIds = new Set(live.map((a) => a.id));
  if (live.length === 0 && input.cash.length === 0) return null;

  const collected: Record<string, number> = {};
  const shipped: Record<string, number> = {};
  let paymentCount = 0;
  let shipmentCount = 0;
  const owed: Record<string, number> = {};
  let debtorCount = 0;
  for (const [accountId, entries] of Object.entries(input.ledgerStore)) {
    if (!liveIds.has(accountId)) continue;
    for (const entry of entries) {
      if (entry.date !== input.day) continue;
      if (entry.kind === "credit") {
        paymentCount += 1;
        add(collected, entry.currency, entry.amount);
      } else {
        shipmentCount += 1;
        add(shipped, entry.currency, entry.amount);
      }
    }
    let owes = false;
    for (const [currency, balance] of Object.entries(computeBalanceByCurrency(entries))) {
      if (balance > EPSILON) {
        add(owed, currency, balance);
        owes = true;
      }
    }
    if (owes) debtorCount += 1;
  }

  const expenses: Record<string, number> = {};
  for (const entry of listStandaloneCashEntries(input.cash)) {
    if (entry.date === input.day && entry.kind === "out") add(expenses, entry.currencyCode, entry.amount);
  }
  const till = computeCashBalanceByCurrency(input.cash);

  const lines: string[] = [];
  lines.push(paymentCount > 0 ? `💵 تحصّل اليوم: ${money(collected)} (${paymentCount} دفعة)` : "💵 لم تُسجَّل دفعات اليوم");
  if (shipmentCount > 0) lines.push(`📡 شحنات اليوم: ${shipmentCount} (${money(shipped)})`);
  if (money(expenses)) lines.push(`💸 مصاريف اليوم: ${money(expenses)}`);
  if (money(till)) lines.push(`🏦 في الصندوق: ${money(till)}`);
  lines.push(debtorCount > 0 ? `⏳ لم يدفع بعد: ${debtorCount} جهاز - ${money(owed)}` : "✓ لا ديون على الزبائن");

  return {
    title: paymentCount > 0 ? `🌙 ملخص اليوم - تحصّل ${money(collected)}` : "🌙 ملخص اليوم - STAR NET",
    lines,
  };
}

/** When the next summary goes out: today at `hour`:00, or tomorrow if that has passed. */
export function nextEveningTime(now: Date, hour: number): Date {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** yyyy-mm-dd of a moment in the phone's own time zone (records are dated that way). */
export function localDay(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}
