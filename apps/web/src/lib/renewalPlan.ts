/**
 * One-tap renewal: turns a device's fixed monthly price (StarlinkAccountSummary.renewalPlan) into
 * the month's shipment ledger entry, using today's registered exchange rates - exactly what the
 * operator would otherwise type into "إضافة حركة". Refuses (with the reason) rather than guess
 * whenever a needed rate isn't registered; the caller then falls back to the manual dialog.
 */

import type { RenewalPlan } from "@starnet/shared";
import { CurrencyStore, getCurrency } from "./currencyStore";
import { createLedgerEntry, LEDGER_CURRENCIES, LedgerCurrency, LedgerEntry } from "./ledgerStore";

export type RenewalShipmentResult = { ok: true; entry: LedgerEntry } | { ok: false; message: string };

function rateOf(store: CurrencyStore, code: string): number | undefined {
  if (code.toUpperCase() === "USD") return 1;
  const rate = getCurrency(store, code)?.rateFromUsd;
  return rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/** Validates a plan typed in AccountDialog - null when valid, else the Arabic error. */
export function validateRenewalPlan(plan: RenewalPlan): string | null {
  if (!Number.isFinite(plan.saleAmount) || plan.saleAmount <= 0) return "أدخل سعر البيع الشهري أكبر من صفر";
  if (!Number.isFinite(plan.costAmount) || plan.costAmount <= 0) return "أدخل تكلفة Starlink الشهرية أكبر من صفر";
  if (!LEDGER_CURRENCIES.includes(plan.saleCurrency as LedgerCurrency)) return "اختر عملة البيع";
  if (!plan.costCurrency) return "اختر عملة تكلفة Starlink";
  return null;
}

export function buildRenewalShipment(
  plan: RenewalPlan,
  currencyStore: CurrencyStore,
  date: string,
  options: { note?: string; email?: string; representative?: { id: string; commissionPercent: number; sharesLosses?: boolean } } = {},
): RenewalShipmentResult {
  const invalid = validateRenewalPlan(plan);
  if (invalid) return { ok: false, message: invalid };
  const saleRate = rateOf(currencyStore, plan.saleCurrency);
  if (saleRate === undefined) return { ok: false, message: `سعر صرف ${plan.saleCurrency} غير مسجّل في العملات` };
  const costRate = rateOf(currencyStore, plan.costCurrency);
  if (costRate === undefined) return { ok: false, message: `سعر صرف ${plan.costCurrency} غير مسجّل في العملات` };
  const mru = rateOf(currencyStore, "MRU");
  const sifa = rateOf(currencyStore, "SIFA");
  if (mru === undefined) return { ok: false, message: "سعر الأوقية مقابل الدولار غير موجود في الإعدادات" };
  if (sifa === undefined) return { ok: false, message: "سعر السيفا مقابل الدولار غير موجود في الإعدادات" };

  const saleIsUsd = plan.saleCurrency === "USD";
  const costIsUsd = plan.costCurrency.toUpperCase() === "USD";
  const entry = createLedgerEntry({
    kind: "debit",
    amount: plan.saleAmount,
    currency: plan.saleCurrency as LedgerCurrency,
    note: options.note ?? "تجديد شهري",
    email: options.email ?? "",
    date,
    saleRate: saleIsUsd ? undefined : { rateFromUsd: saleRate, usdValue: plan.saleAmount / saleRate },
    starlinkCost: {
      status: "settled",
      currencyCode: plan.costCurrency.toUpperCase(),
      amount: plan.costAmount,
      rate: costIsUsd ? undefined : { rateFromUsd: costRate, usdValue: plan.costAmount / costRate },
      paidAt: date,
    },
    profitCurrencyRates: { MRU: mru, SIFA: sifa },
    representative: options.representative,
  });
  return { ok: true, entry };
}
