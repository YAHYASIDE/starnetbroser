/**
 * 📌 «تثبيت سعر العملة» (his Nov 19 2026 ask): a pinned currency keeps its rate - nothing automatic changes it (a D
 * payment, a quote on a customer's net line, a currency added from a dialog); only the currencies page, after he
 * removes the pin. Paying a D in a pinned currency records what was really paid on THAT D only; the difference from
 * the pinned rate may be up to PIN_TOLERANCE_USD either way, beyond it the payment needs «رمز العملات» - his own code,
 * set and changed on the currencies page (only a SHA-256 of it is kept, phone-only).
 */

import { sha256Hex, normalizeCode } from "./deleteCode";
import { implausibleRate, type Currency, type CurrencyStore } from "./currencyStore";

/** Phone-only (a code, never backed up). */
export const CURRENCY_CODE_KEY = "starnet.currencyCode";
export const PIN_TOLERANCE_USD = 5;
export const MIN_CODE_LENGTH = 4;

export function isPinned(currency: Pick<Currency, "pinnedAt"> | undefined): boolean {
  return Boolean(currency?.pinnedAt);
}

export function pinCurrency(store: CurrencyStore, code: string, now: string): CurrencyStore {
  const c = store[code];
  // an impossible rate (EUR at 0.27 instead of ~0.87, Nov 21 2026) is never pinned - it would block every D
  if (!c || code === "USD" || c.pinnedAt || implausibleRate(code, c.rateFromUsd)) return store;
  return { ...store, [code]: { ...c, pinnedAt: now } };
}

export function unpinCurrency(store: CurrencyStore, code: string): CurrencyStore {
  const c = store[code];
  if (!c?.pinnedAt) return store;
  const { pinnedAt: _p, ...rest } = c;
  return { ...store, [code]: rest };
}

export function currencyCodeHash(code: string): string {
  return sha256Hex("starnet-currency:" + normalizeCode(code));
}

export function matchesCurrencyCode(input: string, hash: string | null | undefined): boolean {
  const code = normalizeCode(input);
  return Boolean(hash) && code.length > 0 && currencyCodeHash(code) === hash;
}

/** A new code must be at least MIN_CODE_LENGTH characters; null = fine, else his message. */
export function newCodeProblem(code: string, repeat: string): string | null {
  const a = normalizeCode(code);
  if (a.length < MIN_CODE_LENGTH) return `الرمز ${MIN_CODE_LENGTH} أرقام أو حروف على الأقل`;
  if (a !== normalizeCode(repeat)) return "الرمزان غير متطابقين";
  return null;
}

export interface PinnedPayCheck {
  /** What the foreign amount costs at the pinned rate. */
  expectedUsd: number;
  /** Paid − expected (+ = paid more). */
  diffUsd: number;
  /** Beyond PIN_TOLERANCE_USD: only with «رمز العملات». */
  needsCode: boolean;
  /** The pinned rate itself is impossible (outside the currency's band): the pin is not trusted, the payment is not
   * blocked, and he is told to correct the rate on the currencies page. */
  wrongPin?: readonly [number, number];
}

/** A D paid in a pinned currency: how far the dollars paid are from the pinned rate. Null when the currency is not
 * pinned (or an amount is missing) - then nothing is checked. */
export function pinnedPayCheck(currency: Pick<Currency, "code" | "pinnedAt" | "rateFromUsd"> | undefined, foreignAmount: number, paidUsd: number): PinnedPayCheck | null {
  if (!currency?.pinnedAt || !(currency.rateFromUsd > 0) || !(foreignAmount > 0) || !(paidUsd > 0)) return null;
  const expectedUsd = Math.round((foreignAmount / currency.rateFromUsd) * 100) / 100;
  const diffUsd = Math.round((paidUsd - expectedUsd) * 100) / 100;
  const wrongPin = implausibleRate(currency.code, currency.rateFromUsd);
  if (wrongPin) return { expectedUsd, diffUsd, needsCode: false, wrongPin };
  return { expectedUsd, diffUsd, needsCode: Math.abs(diffUsd) > PIN_TOLERANCE_USD + 0.004 };
}

export function loadCurrencyCodeHash(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(CURRENCY_CODE_KEY);
  } catch {
    return null;
  }
}

export function saveCurrencyCode(code: string): void {
  try {
    window.localStorage.setItem(CURRENCY_CODE_KEY, currencyCodeHash(code));
  } catch {
    // stays as it was
  }
}
