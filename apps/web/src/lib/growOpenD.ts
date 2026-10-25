/**
 * 🔗 «أضفه إلى D المفتوح» (his Oct 25 2026 ask: «إذا أضفت دينًا جديدًا… خيار إضافة الدين الجديد على القديم،
 * يخلطو، يعني بنفس تكلفة القديم»). Starlink asks more than the open D («فرق … · الدين»): instead of a second
 * operation, the newest open D grows by the gap - his choices: **the old D's own locked rate** («سعر العملية
 * القديمة») and the customer's amount **raised at the same price per dollar** («يزيد بنفس سعر القديم»), so
 * the profit keeps its proportion. Pure.
 */

import { openDebtEntries } from "./deviceFault";
import type { LedgerEntry } from "./ledgerStore";

export interface GrowPlan {
  entry: LedgerEntry;
  /** Starlink's cost before / after, in USD (at the D's locked rate). */
  costUsdBefore: number;
  costUsdAfter: number;
  /** The customer's amount before / after, in the entry's own currency. */
  amountBefore: number;
  amountAfter: number;
}

function costUsd(entry: LedgerEntry): number | undefined {
  const cost = entry.starlinkCost;
  if (!cost || cost.amount === undefined || !cost.currencyCode) return undefined;
  return cost.currencyCode === "USD" ? cost.amount : cost.rate?.usdValue;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** أوقية / سيفا in whole units, dollars to the cent. */
const roundIn = (currency: string, n: number) => (currency === "USD" ? round2(n) : Math.round(n));

/** The open D a gap would join: the newest pending one with a known cost (not waiting for its bill). */
export function growableD(entries: LedgerEntry[]): LedgerEntry | null {
  const open = openDebtEntries(entries).filter((e) => !e.starlinkCost?.awaitingBill && (costUsd(e) ?? 0) > 0 && (e.currency === "USD" || e.saleRate));
  open.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return open[0] ?? null;
}

/** What the open D becomes with `gapUsd` added - or null when there is none to grow. */
export function planGrowOpenD(entries: LedgerEntry[], gapUsd: number): GrowPlan | null {
  if (!(gapUsd > 0)) return null;
  const entry = growableD(entries);
  const before = entry ? costUsd(entry) : undefined;
  if (!entry || !before) return null;
  const after = round2(before + gapUsd);
  return { entry, costUsdBefore: before, costUsdAfter: after, amountBefore: entry.amount, amountAfter: roundIn(entry.currency, (entry.amount * after) / before) };
}

/** The grown entry: cost + gap (in the cost's currency at its locked rate), the sale scaled the same. */
export function growOpenD(plan: GrowPlan, at: string): LedgerEntry {
  const { entry } = plan;
  const cost = entry.starlinkCost!;
  const gapUsd = round2(plan.costUsdAfter - plan.costUsdBefore);
  const usd = cost.currencyCode === "USD";
  const rateFromUsd = cost.rate?.rateFromUsd ?? 1;
  const addedCost = usd ? gapUsd : round2(gapUsd * rateFromUsd);
  const nextCost = {
    ...cost,
    amount: round2((cost.amount ?? 0) + addedCost),
    ...(usd || !cost.rate ? {} : { rate: { ...cost.rate, usdValue: plan.costUsdAfter } }),
  };
  const ratio = plan.amountBefore > 0 ? plan.amountAfter / plan.amountBefore : 1;
  const saleRate = entry.saleRate ? { ...entry.saleRate, usdValue: round2(entry.saleRate.usdValue * ratio) } : undefined;
  return {
    ...entry,
    amount: plan.amountAfter,
    ...(saleRate ? { saleRate } : {}),
    starlinkCost: nextCost,
    grownBy: [...(entry.grownBy ?? []), { at, usd: gapUsd, cost: addedCost, amount: round2(plan.amountAfter - plan.amountBefore) }],
  };
}
