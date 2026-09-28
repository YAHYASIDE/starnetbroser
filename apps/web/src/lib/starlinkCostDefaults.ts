/**
 * What a new shipment's "تكلفة اشتراك Starlink" starts with, read from what Starlink itself says
 * about the device: the currency it bills in (the balance's own currency, else the currency of
 * the service address's country) and the amount it currently shows as due. Only a starting point -
 * the operator can still change any of it before saving, and the saved entry locks its own values.
 */

import type { RenewalPlan } from "@starnet/shared";
import { countryFromIso2, CountryCurrencyOption } from "./countryCurrencies";

export interface StarlinkCostDefaultsInput {
  /** Synced ISO code of the service address, e.g. "GR". */
  serviceCountry?: string;
  /** Synced currency of Starlink's balance, e.g. "EUR". */
  billingCurrency?: string;
  /** Synced balance due, e.g. "80.10". */
  balanceDue?: string;
  renewalPlan?: RenewalPlan;
  lastUsedCurrency?: string;
}

export interface StarlinkCostDefaults {
  currencyCode: string;
  /** The device's own country, when it matches the chosen currency. */
  country?: CountryCurrencyOption;
  amount?: number;
  /** True when the currency came from Starlink's own data rather than a past choice. */
  detected: boolean;
}

function validCode(code: string | undefined): string | undefined {
  const c = code?.trim().toUpperCase();
  return c && /^[A-Z]{3,4}$/.test(c) ? c : undefined;
}

export function starlinkCostDefaults(input: StarlinkCostDefaultsInput): StarlinkCostDefaults {
  const country = countryFromIso2(input.serviceCountry);
  const billing = validCode(input.billingCurrency);
  const detectedCode = billing ?? country?.code;
  const currencyCode = detectedCode ?? validCode(input.renewalPlan?.costCurrency) ?? validCode(input.lastUsedCurrency) ?? "";

  let amount: number | undefined;
  const due = Number((input.balanceDue ?? "").replace(/[^\d.]/g, ""));
  if (billing && billing === currencyCode && Number.isFinite(due) && due > 0) amount = due;
  else if (input.renewalPlan && validCode(input.renewalPlan.costCurrency) === currencyCode && input.renewalPlan.costAmount > 0) {
    amount = input.renewalPlan.costAmount;
  }

  return {
    currencyCode,
    country: country && country.code === currencyCode ? country : undefined,
    amount,
    detected: detectedCode !== undefined,
  };
}
