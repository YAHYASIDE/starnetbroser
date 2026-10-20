/**
 * ⏳ «الفاتورة لم تنزل بعد» (his Oct 19 2026 ask): he pays a device's old debt, starts a new service
 * (charge, ROM…) and Starlink shows 0 for minutes or hours until the invoice comes down. He knows the
 * customer's price, not Starlink's: the charge is recorded at once with an empty D marked
 * `awaitingBill`, the device is checked again in the background (30 min, 1 h, 2 h, 6 h, 12 h), and the first
 * read of a new bill fills the D by itself (his choice «وحده مع إشعار»). Still empty after a day → a
 * task in «خطة اليوم».
 */

import { openDebtEntries } from "./deviceFault";
import { starlinkCostUsd } from "./accountingStore";
import { getCurrency, type CurrencyStore } from "./currencyStore";
import { createLedgerEntry, LEDGER_CURRENCIES, type LedgerByAccount, type LedgerCurrency, type LedgerEntry } from "./ledgerStore";

/** When the device is checked again after the charge (his Oct 20 2026 choice: 30 min, 1 h, 2 h, 6 h, 12 h). */
export const BILL_CHECK_DELAYS_MS = [30 * 60_000, 60 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 12 * 60 * 60_000];
/** After this long without an invoice he is told to look himself. */
export const AWAITING_LATE_MS = 24 * 60 * 60_000;

export function isAwaitingBill(entry: LedgerEntry): boolean {
  const cost = entry.starlinkCost;
  return entry.kind === "debit" && cost?.status === "pending" && Boolean(cost.awaitingBill) && !((cost.amount ?? 0) > 0);
}

export function awaitingEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter(isAwaitingBill).sort((a, b) => (a.starlinkCost!.awaitingBill!.since < b.starlinkCost!.awaitingBill!.since ? -1 : 1));
}

/** The D of a charge whose invoice hasn't come down yet (currency = the device's bill currency, if known). */
export function awaitingCost(billCurrency: string | undefined, now: Date = new Date()): NonNullable<LedgerEntry["starlinkCost"]> {
  const code = billCurrency?.trim().toUpperCase();
  return { status: "pending", ...(code && /^[A-Z]{3,4}$/.test(code) ? { currencyCode: code } : {}), awaitingBill: { since: now.toISOString() } };
}

/** «80.10», «USD 80.10», «$1,234.50» → 1234.5; NaN when there's no number. */
export function parseBillAmount(text: string | undefined): number {
  const cleaned = (text ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : NaN;
}

export interface BillRead {
  accountId: string;
  /** Starlink's «Balance Due» as read. */
  balanceDue: string;
  /** The bill's currency (the read's, else the device's). */
  currency: string;
  /** When the read was made (ms). */
  at: number;
}

export interface FilledBill {
  accountId: string;
  entryId: string;
  amount: number;
  currencyCode: string;
  usd: number;
}

export interface FillResult {
  ledger: LedgerByAccount;
  filled: FilledBill[];
  /** Devices whose bill came but its currency has no rate in «العملات» - left waiting. */
  noRate: { accountId: string; currencyCode: string }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fills every awaiting D from a later read of a bill: the new invoice is what Starlink asks beyond
 * the D's already recorded (and unpaid). A read made before the charge, a bill of 0 or one no larger
 * than the D's already open leaves it waiting. Several awaiting on one device: the oldest takes it.
 */
export function fillAwaitingBills(
  ledger: LedgerByAccount,
  reads: BillRead[],
  rateOf: (code: string) => number | undefined,
): FillResult {
  let next = ledger;
  const filled: FilledBill[] = [];
  const noRate: FillResult["noRate"] = [];
  for (const read of reads) {
    const entries = next[read.accountId] ?? [];
    const waiting = awaitingEntries(entries).filter((e) => Date.parse(e.starlinkCost!.awaitingBill!.since) <= read.at);
    const first = waiting[0];
    if (!first) continue;
    const due = parseBillAmount(read.balanceDue);
    if (!(due > 0)) continue;
    const code = (read.currency || first.starlinkCost?.currencyCode || "USD").trim().toUpperCase();
    const rate = code === "USD" ? 1 : rateOf(code);
    if (!rate || !(rate > 0)) {
      noRate.push({ accountId: read.accountId, currencyCode: code });
      continue;
    }
    const openUsd = openDebtEntries(entries).reduce((sum, e) => sum + (starlinkCostUsd(e) ?? 0), 0);
    const newUsd = due / rate - openUsd;
    if (newUsd < 1) continue;
    const amount = code === "USD" ? round2(newUsd) : round2(newUsd * rate);
    const usd = round2(newUsd);
    const cost = first.starlinkCost!;
    const { awaitingBill: _done, ...rest } = cost;
    void _done;
    const updated: LedgerEntry = {
      ...first,
      starlinkCost: { ...rest, status: "pending", currencyCode: code, amount, ...(code === "USD" ? {} : { rate: { rateFromUsd: rate, usdValue: usd } }) },
    };
    next = { ...next, [read.accountId]: entries.map((e) => (e.id === first.id ? updated : e)) };
    filled.push({ accountId: read.accountId, entryId: first.id, amount, currencyCode: code, usd });
  }
  return { ledger: next, filled, noRate };
}

/** Devices still waiting for their invoice longer than a day («خطة اليوم»). */
export function lateAwaitingBills(ledger: LedgerByAccount, now: Date = new Date()): { accountId: string; entryId: string; since: string }[] {
  const late: { accountId: string; entryId: string; since: string }[] = [];
  for (const [accountId, entries] of Object.entries(ledger)) {
    for (const e of awaitingEntries(entries ?? [])) {
      const since = e.starlinkCost!.awaitingBill!.since;
      if (now.getTime() - Date.parse(since) >= AWAITING_LATE_MS) late.push({ accountId, entryId: e.id, since });
    }
  }
  return late;
}

/** Devices with any charge still waiting (to keep their background checks). */
export function devicesAwaitingBill(ledger: LedgerByAccount): string[] {
  return Object.entries(ledger)
    .filter(([, entries]) => (entries ?? []).some(isAwaitingBill))
    .map(([id]) => id);
}

/**
 * ⏳ The charge typed in a device's browser («شحن بانتظار الفاتورة»): the customer's price in his
 * currency at today's rate, the rep's terms locked as on any charge, and an empty D waiting.
 */
export function buildAwaitingCharge(input: {
  amount: number;
  currency: string;
  at: Date;
  billCurrency?: string;
  currencyStore: CurrencyStore;
  email?: string;
  representative?: { id: string; commissionPercent: number; sharesLosses?: boolean; ratePlan?: { since: string; MRU?: number; SIFA?: number; base?: { MRU?: number; SIFA?: number } } };
}): { ok: true; entry: LedgerEntry } | { ok: false; message: string } {
  if (!(input.amount > 0) || !Number.isFinite(input.amount)) return { ok: false, message: "مبلغ الشحن غير صحيح" };
  if (!LEDGER_CURRENCIES.includes(input.currency as LedgerCurrency)) return { ok: false, message: `عملة غير معروفة: ${input.currency}` };
  const currency = input.currency as LedgerCurrency;
  const rate = currency === "USD" ? 1 : getCurrency(input.currencyStore, currency)?.rateFromUsd;
  if (!rate || !(rate > 0)) return { ok: false, message: `سعر صرف ${currency} غير مسجّل في العملات` };
  const y = input.at.getFullYear();
  const m = String(input.at.getMonth() + 1).padStart(2, "0");
  const d = String(input.at.getDate()).padStart(2, "0");
  const entry = createLedgerEntry({
    kind: "debit",
    amount: input.amount,
    currency,
    note: "⏳ شحن من متصفح الجهاز - D ينتظر الفاتورة",
    email: input.email ?? "",
    date: `${y}-${m}-${d}`,
    saleRate: currency === "USD" ? undefined : { rateFromUsd: rate, usdValue: input.amount / rate },
    starlinkCost: awaitingCost(input.billCurrency, input.at),
    representative: input.representative,
  });
  return { ok: true, entry };
}

/** The checks still ahead of a charge recorded at `since` (delays from now, ms); none once all passed. */
export function billCheckDelays(since: string, now: Date = new Date()): number[] {
  const start = Date.parse(since);
  if (!Number.isFinite(start)) return [];
  return BILL_CHECK_DELAYS_MS.map((d) => start + d - now.getTime()).filter((d) => d > 0);
}
