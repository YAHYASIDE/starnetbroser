"use client";

/**
 * ⚡ تفعيل from a rep's bot, once the operator approves it (✅ in his bot, or on the
 * representatives page): recorded like the card's «تجديد» - a shipment on the device (the price
 * the customer pays, the package's Starlink cost as D until it's paid, the rep's share) - and, when
 * the rep said the customer already paid him, that payment too (the money stays with the rep).
 * Each package's Starlink cost is set once in the settings (`starnet_activation_costs_v1`, backed
 * up with the business data).
 */

import type { RenewalPlan, StarlinkAccountSummary } from "@starnet/shared";
import { saveClientDevicePayment } from "./clientDevicePaymentSave";
import { loadCurrencyStore } from "./currencyStore";
import { getAccountEntries, loadLedgerStore, PAYMENT_METHODS, saveLedgerStore, withAccountEntries, type PaymentMethod } from "./ledgerStore";
import { buildRenewalShipment } from "./renewalPlan";
import type { RepRequest } from "./repRequests";
import { getRepresentative, loadRepresentativeStore } from "./repStore";

export interface ActivationCost {
  amount: number;
  currency: string;
}

export type ActivationCosts = Record<string, ActivationCost>;

const STORAGE_KEY = "starnet_activation_costs_v1";

export function parseActivationCosts(raw: string | null): ActivationCosts {
  try {
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object") return {};
    const out: ActivationCosts = {};
    for (const [plan, cost] of Object.entries(value as Record<string, unknown>)) {
      const c = cost as Partial<ActivationCost> | null;
      if (c && typeof c.amount === "number" && c.amount > 0 && typeof c.currency === "string" && c.currency) out[plan] = { amount: c.amount, currency: c.currency };
    }
    return out;
  } catch {
    return {};
  }
}

export function loadActivationCosts(): ActivationCosts {
  if (typeof window === "undefined") return {};
  try {
    return parseActivationCosts(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveActivationCosts(costs: ActivationCosts): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(costs));
  } catch {
    // storage full / unavailable - the settings screen shows the values it has
  }
}

/** The activation as a one-off monthly price (sale = what the customer pays the rep). */
export function activationPlan(sale: { amount: number; currency: string }, cost: ActivationCost): RenewalPlan {
  return { saleAmount: sale.amount, saleCurrency: sale.currency, costAmount: cost.amount, costCurrency: cost.currency, costPending: true };
}

export function isPaymentMethod(value: string | undefined): value is PaymentMethod {
  return !!value && (PAYMENT_METHODS as string[]).includes(value);
}

export type RecordActivationResult = { ok: true; paid: boolean } | { ok: false; message: string };

/**
 * Records an approved activation on its device: the shipment (D until Starlink is paid) and, if
 * the customer already paid the rep (`paid` = how), his payment. `accounts` is the phone's list.
 */
export function recordRepActivation(
  request: RepRequest,
  input: { amount: number; currency: string; cost: ActivationCost | undefined; paid?: PaymentMethod; date: string },
  accounts: StarlinkAccountSummary[],
): RecordActivationResult {
  const account = accounts.find((a) => a.id === request.accountId && !a.deletedAt);
  if (!account) return { ok: false, message: "لم أجد الجهاز في التطبيق" };
  if (!input.cost) return { ok: false, message: `سجّل تكلفة Starlink لباقة ${request.plan ?? ""} (الإعدادات ← ⚡ تكلفة باقات التفعيل)` };
  const rep = getRepresentative(loadRepresentativeStore(), request.repId);
  const email = account.expectedEmail || account.starlinkAccountEmail || "";
  const shipment = buildRenewalShipment(activationPlan({ amount: input.amount, currency: input.currency }, input.cost), loadCurrencyStore(), input.date, {
    note: `⚡ تفعيل ${request.plan ?? ""} عبر المندوب ${rep?.name ?? ""}`.trim(),
    email,
    representative: rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses, ratePlan: rep.usdRates } : undefined,
    costPending: true,
  });
  if (!shipment.ok) return shipment;
  const ledger = loadLedgerStore();
  const withShipment = withAccountEntries(ledger, account.id, [...getAccountEntries(ledger, account.id), shipment.entry]);
  saveLedgerStore(withShipment);
  if (!input.paid) return { ok: true, paid: false };
  const payment = saveClientDevicePayment(
    withShipment,
    { id: account.id, name: account.name, email: email || undefined },
    { amount: input.amount, currencyCode: input.currency, date: input.date, note: `استلمها المندوب ${rep?.name ?? ""} مع التفعيل`.trim(), paymentMethod: input.paid, cashMoved: false },
  );
  if (!payment.ok) return { ok: false, message: `سُجّل التفعيل، لكن تعذر تسجيل الدفعة: ${payment.message}` };
  return { ok: true, paid: true };
}
