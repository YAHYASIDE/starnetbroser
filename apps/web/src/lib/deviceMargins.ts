/**
 * 🔻 Losing / weak devices (the council's Oct 2026 verdict, his choice «الخاسر والضعيف»): each
 * device's monthly profit = its monthly sale price (renewalPlan) − Starlink's cost, both turned into
 * dollars with TODAY's registered rates - so a rising dollar or a Starlink price rise shows up even
 * though the sale price on the record never changed. Pure; nothing is stored.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { type CurrencyStore, getCurrency } from "./currencyStore";

/** Below this share of the sale price, a device is «ضعيف الربح». */
export const WEAK_MARGIN_PERCENT = 10;

export interface DeviceMargin {
  id: string;
  name: string;
  clientId?: string;
  saleUsd: number;
  costUsd: number;
  profitUsd: number;
  /** profit / sale, 0-100 (negative when losing). */
  percent: number;
}

export interface DeviceMargins {
  /** Profit below 0 - he pays Starlink more than he takes. Worst first. */
  losing: DeviceMargin[];
  /** Profit from 0 up to WEAK_MARGIN_PERCENT of the sale. Weakest first. */
  weak: DeviceMargin[];
  /** Active devices with no monthly price (or no Starlink cost) - can't be judged until typed. */
  unpriced: number;
  /** Priced devices whose currency has no registered rate today. */
  noRate: number;
}

function usdRate(store: CurrencyStore, code: string): number | undefined {
  if (code.toUpperCase() === "USD") return 1;
  const rate = getCurrency(store, code)?.rateFromUsd;
  return rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

export function computeDeviceMargins(accounts: StarlinkAccountSummary[], currencies: CurrencyStore): DeviceMargins {
  const out: DeviceMargins = { losing: [], weak: [], unpriced: 0, noRate: 0 };
  for (const account of accounts) {
    if (account.deletedAt || account.archivedAt || account.deviceFault) continue;
    const plan = account.renewalPlan;
    if (!plan || !(plan.saleAmount > 0) || !(plan.costAmount > 0)) {
      out.unpriced += 1;
      continue;
    }
    const saleRate = usdRate(currencies, plan.saleCurrency);
    const costRate = usdRate(currencies, plan.costCurrency);
    if (!saleRate || !costRate) {
      out.noRate += 1;
      continue;
    }
    const saleUsd = plan.saleAmount / saleRate;
    const costUsd = plan.costAmount / costRate;
    const profitUsd = saleUsd - costUsd;
    const margin: DeviceMargin = { id: account.id, name: account.name, clientId: account.clientId, saleUsd, costUsd, profitUsd, percent: (profitUsd / saleUsd) * 100 };
    if (profitUsd < 0) out.losing.push(margin);
    else if (margin.percent < WEAK_MARGIN_PERCENT) out.weak.push(margin);
  }
  out.losing.sort((a, b) => a.profitUsd - b.profitUsd);
  out.weak.sort((a, b) => a.percent - b.percent);
  return out;
}

/** The morning-summary line, or null when no device is losing or weak. */
export function marginsTelegramLine(margins: Pick<DeviceMargins, "losing" | "weak">): string | null {
  const parts: string[] = [];
  if (margins.losing.length) parts.push(`🔻 ${margins.losing.length} ${margins.losing.length === 1 ? "جهاز خاسر" : "أجهزة خاسرة"} (تدفع لستارلينك أكثر مما تأخذ)`);
  if (margins.weak.length) parts.push(`🟡 ${margins.weak.length} ${margins.weak.length === 1 ? "جهاز ربحه" : "أجهزة ربحها"} أقل من ${WEAK_MARGIN_PERCENT}%`);
  return parts.length ? parts.join("\n") : null;
}
