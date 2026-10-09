/**
 * 🛂 «✅ الأجهزة التي تم توثيقها» as a small book (his Oct 9 2026 request «اجعله دوائري»): six circles -
 * الكل · 🏠 أجهزتي · 👥 أجهزة المندوبين · 💰 بلا سعر · 🧾 لم يُدفع · 📈 ربحي - and, per rep, what his devices
 * were charged, his share and ours. His choices: a rep gets his OWN percent for registrations
 * (`Representative.travelPercent`, not his renewal percent), taken from the price (no cost - his
 * choice «بلا تكلفة»), and LOCKED onto each device's price when it's saved (`repId`/`repPercent` on
 * `travelRegistrationPrice`), so changing it later never rewrites a past one. Per currency, never
 * mixed. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { LEDGER_CURRENCY_LABELS, type LedgerByAccount, type LedgerEntry } from "./ledgerStore";
import { computeShipmentPaymentStatus, type PaymentAllocation } from "./paymentAllocationStore";
import type { RepresentativeStore } from "./repStore";
import { isTravelVerified, travelFeeKey } from "./travelRegistration";
import { formatAmount } from "./formatAmount";

export type TravelPrice = NonNullable<StarlinkAccountSummary["travelRegistrationPrice"]>;
export type ByCurrency = Record<string, number>;

/** What the circles filter on. `rep:<id>` = one rep's devices. */
export type TravelGroup = "all" | "mine" | "reps" | "unpriced" | "unpaid" | `rep:${string}`;

/** The rep a registration belongs to: the one locked on its price, else the device's current rep. */
export function travelRepOf(account: Pick<StarlinkAccountSummary, "representativeId" | "travelRegistrationPrice">): string | undefined {
  return account.travelRegistrationPrice?.repId || account.representativeId || undefined;
}

/** The rep's share of one price, or undefined while no percent is locked on it. */
export function repShareOf(price: TravelPrice | null | undefined): number | undefined {
  if (!price || !price.repId || price.repPercent === undefined) return undefined;
  return (price.amount * price.repPercent) / 100;
}

/** 💰 The price as saved: an existing lock stays (history is never rewritten); a new price on a
 * rep's device locks that rep and his CURRENT travel percent (none yet = locked later). */
export function lockTravelPrice(
  account: Pick<StarlinkAccountSummary, "representativeId" | "travelRegistrationPrice">,
  price: { amount: number; currency: string } | null,
  reps: RepresentativeStore,
): TravelPrice | null {
  if (!price) return null;
  const current = account.travelRegistrationPrice;
  if (current?.repId) {
    return { ...price, repId: current.repId, ...(current.repPercent !== undefined ? { repPercent: current.repPercent } : {}) };
  }
  const repId = account.representativeId;
  if (!repId) return { ...price };
  const percent = reps[repId]?.travelPercent;
  return { ...price, repId, ...(percent !== undefined ? { repPercent: percent } : {}) };
}

/** ⚙️ «نسبة التوثيق» set for a rep: every one of his priced registrations that has no percent yet
 * takes it now (the ones already locked keep theirs). Returns the device patches. */
export function lockRepTravelPercent(
  accounts: StarlinkAccountSummary[],
  repId: string,
  percent: number,
): { id: string; patch: Partial<StarlinkAccountSummary> }[] {
  const out: { id: string; patch: Partial<StarlinkAccountSummary> }[] = [];
  for (const account of accounts) {
    const price = account.travelRegistrationPrice;
    if (!isTravelVerified(account) || !price || price.repPercent !== undefined || travelRepOf(account) !== repId) continue;
    out.push({ id: account.id, patch: { travelRegistrationPrice: { ...price, repId, repPercent: percent } } });
  }
  return out;
}

/** This registration's debt entry (posted by applyTravelFee), if any. */
export function travelFeeEntryOf(account: StarlinkAccountSummary, ledger: LedgerByAccount): LedgerEntry | undefined {
  const key = travelFeeKey(account);
  return (ledger[account.id] ?? []).find((e) => e.travelFeeFor === key);
}

export interface TravelState {
  repId?: string;
  priced: boolean;
  /** Its debt is there and not fully paid. */
  unpaid: boolean;
  /** Priced before the debt was posted automatically: no debt on the owner yet. */
  noDebt: boolean;
}

export function travelStateOf(account: StarlinkAccountSummary, ledger: LedgerByAccount, allocations: PaymentAllocation[]): TravelState {
  const price = account.travelRegistrationPrice;
  const priced = Boolean(price && price.amount > 0);
  const entry = priced ? travelFeeEntryOf(account, ledger) : undefined;
  return {
    repId: travelRepOf(account),
    priced,
    unpaid: Boolean(entry) && computeShipmentPaymentStatus(entry!, allocations) !== "paid",
    noDebt: priced && !entry,
  };
}

export function matchesTravelGroup(state: TravelState, group: TravelGroup): boolean {
  switch (group) {
    case "all":
      return true;
    case "mine":
      return !state.repId;
    case "reps":
      return Boolean(state.repId);
    case "unpriced":
      return !state.priced;
    case "unpaid":
      return state.unpaid;
    default:
      return state.repId === group.slice(4);
  }
}

export interface TravelRepRow {
  repId: string;
  name: string;
  phone?: string;
  count: number;
  unpriced: number;
  /** What his devices were charged. */
  total: ByCurrency;
  /** His share (locked percents only) and ours. */
  repShare: ByCurrency;
  myShare: ByCurrency;
  /** His current travel percent (the one new prices take). */
  percent?: number;
  /** Priced devices still without a percent - not counted in either share. */
  noPercent: number;
}

export interface TravelBook {
  all: number;
  mine: number;
  reps: number;
  unpriced: number;
  unpaid: number;
  noDebt: number;
  /** Every price, per currency. */
  collected: ByCurrency;
  /** Ours: my devices' prices + my part of the reps' devices. */
  myProfit: ByCurrency;
  repShares: ByCurrency;
  /** Rep devices priced without a percent yet (counted in neither share). */
  noPercent: number;
  byRep: TravelRepRow[];
}

function add(target: ByCurrency, currency: string, amount: number): void {
  target[currency] = (target[currency] ?? 0) + amount;
}

export function buildTravelBook(
  accounts: StarlinkAccountSummary[],
  reps: RepresentativeStore,
  ledger: LedgerByAccount,
  allocations: PaymentAllocation[],
): TravelBook {
  const book: TravelBook = { all: 0, mine: 0, reps: 0, unpriced: 0, unpaid: 0, noDebt: 0, collected: {}, myProfit: {}, repShares: {}, noPercent: 0, byRep: [] };
  const rows = new Map<string, TravelRepRow>();
  for (const account of accounts) {
    if (!isTravelVerified(account)) continue;
    const state = travelStateOf(account, ledger, allocations);
    book.all += 1;
    if (!state.priced) book.unpriced += 1;
    if (state.unpaid) book.unpaid += 1;
    if (state.noDebt) book.noDebt += 1;
    const price = state.priced ? account.travelRegistrationPrice! : undefined;
    if (price) add(book.collected, price.currency, price.amount);
    if (!state.repId) {
      book.mine += 1;
      if (price) add(book.myProfit, price.currency, price.amount);
      continue;
    }
    book.reps += 1;
    const rep = reps[state.repId];
    let row = rows.get(state.repId);
    if (!row) {
      row = { repId: state.repId, name: rep?.name ?? "مندوب", phone: rep?.phone, count: 0, unpriced: 0, total: {}, repShare: {}, myShare: {}, percent: rep?.travelPercent, noPercent: 0 };
      rows.set(state.repId, row);
    }
    row.count += 1;
    if (!price) {
      row.unpriced += 1;
      continue;
    }
    add(row.total, price.currency, price.amount);
    const share = repShareOf(price);
    if (share === undefined) {
      row.noPercent += 1;
      book.noPercent += 1;
      continue;
    }
    add(row.repShare, price.currency, share);
    add(book.repShares, price.currency, share);
    add(row.myShare, price.currency, price.amount - share);
    add(book.myProfit, price.currency, price.amount - share);
  }
  book.byRep = [...rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return book;
}

/** "15,000 أوقية + 3,000 سيفا" (never one summed number). */
export function byCurrencyText(amounts: ByCurrency): string {
  const parts = Object.entries(amounts)
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => `${formatAmount(amount)} ${(LEDGER_CURRENCY_LABELS as Record<string, string>)[currency] ?? currency}`);
  return parts.length ? parts.join(" + ") : "0";
}

/** 💬 The rep's own registration statement (his choice «كشف المندوب للتوثيق»): his verified devices
 * (named by their Starlink email, as every customer message), each price, the total, his percent and
 * his share. */
export function buildRepTravelMessage(row: TravelRepRow, accounts: StarlinkAccountSummary[]): string {
  const devices = accounts.filter((a) => isTravelVerified(a) && travelRepOf(a) === row.repId);
  const lines = devices.map((account, i) => {
    const price = account.travelRegistrationPrice;
    const label = account.expectedEmail || account.starlinkAccountEmail || account.name;
    const amount = price && price.amount > 0 ? byCurrencyText({ [price.currency]: price.amount }) : "بلا سعر بعد";
    const share = repShareOf(price);
    const shareText = share !== undefined && price ? ` · نصيبك ${byCurrencyText({ [price.currency]: share })} (${price.repPercent}%)` : "";
    return `${i + 1}) ${label} - ${amount}${shareText}`;
  });
  return (
    `🛂 كشف توثيق السفر - ${row.name}\n\n` +
    `وُثّق ${devices.length} جهاز:\n${lines.join("\n")}\n\n` +
    `المجموع: ${byCurrencyText(row.total)}\n` +
    `نصيبك: ${byCurrencyText(row.repShare)}` +
    (row.noPercent > 0 ? `\n(${row.noPercent} جهاز بلا نسبة بعد)` : "") +
    `\n\n- STAR NET`
  );
}
