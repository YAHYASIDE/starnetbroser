/**
 * The currency registry (Settings -> "العملات وأسعار الصرف"). USD is the fixed reference currency
 * - every other currency's rate is "how many units of it equal 1 USD" (rateFromUsd), matching how
 * the accounting spec expresses rates ("1 USD = 1,400 ARS"). This module only manages the
 * registry itself; nothing here reads or writes a ledger entry - a transaction that uses one of
 * these currencies takes its own SNAPSHOT of the rate at that moment (see ledgerStore.ts), so a
 * later edit here must never retroactively change an already-recorded transaction.
 */

export interface Currency {
  /** International code, uppercase - the registry's key (e.g. "USD", "MRU", "ARS"). */
  code: string;
  name: string;
  /** Display symbol, e.g. "$" or "MRU" - shown next to amounts, separate from the code. */
  symbol: string;
  /** How many units of this currency equal 1 USD. Always exactly 1 for USD itself. */
  rateFromUsd: number;
  /** ISO timestamp of the last time the rate was edited - never touched by anything else. */
  updatedAt: string;
  /** Hidden currencies stay in the registry (so historical transactions in them still resolve)
   * but are left out of "choose a currency" pickers going forward. */
  enabled: boolean;
}

/** code -> Currency. */
export type CurrencyStore = Record<string, Currency>;

const STORAGE_KEY = "starnet_currencies_v1";
const USD = "USD";

function nowIso(): string {
  return new Date().toISOString();
}

/** USD always exists and is always enabled with rateFromUsd 1 - every other currency starts out
 * absent until the operator adds one (Settings, or "استخدام لأول مرة" during a transaction) with
 * a real rate, rather than seeding guessed rates nobody asked for. */
export function defaultCurrencyStore(): CurrencyStore {
  return {
    [USD]: { code: USD, name: "دولار أمريكي", symbol: "$", rateFromUsd: 1, updatedAt: nowIso(), enabled: true },
  };
}

export function loadCurrencyStore(): CurrencyStore {
  if (typeof window === "undefined") return defaultCurrencyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCurrencyStore();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return defaultCurrencyStore();
    const store = parsed as CurrencyStore;
    // USD must always be present and correct, even if a corrupted/old copy of the store lacks it.
    if (!store[USD] || store[USD].rateFromUsd !== 1) {
      return { ...store, [USD]: defaultCurrencyStore()[USD] };
    }
    return store;
  } catch {
    return defaultCurrencyStore();
  }
}

export function saveCurrencyStore(store: CurrencyStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function getCurrency(store: CurrencyStore, code: string | undefined): Currency | undefined {
  if (!code) return undefined;
  return store[code.toUpperCase()];
}

/** USD first, then every other currency alphabetically by code. `includeDisabled` defaults to
 * false, matching a "choose a currency" picker; pass true for the Settings management list. */
export function listCurrencies(store: CurrencyStore, includeDisabled = false): Currency[] {
  const all = Object.values(store).filter((c) => includeDisabled || c.enabled);
  return all.sort((a, b) => {
    if (a.code === USD) return -1;
    if (b.code === USD) return 1;
    return a.code.localeCompare(b.code);
  });
}

export interface UpsertCurrencyInput {
  code: string;
  name: string;
  symbol: string;
  rateFromUsd: number;
}

/** Creates a new currency, or updates name/symbol/rate for an existing one by the same code -
 * either way this is "save", matching the Settings "add new currency" and "edit rate" actions
 * sharing one form. USD's rate can never be changed away from 1 (it is the fixed reference). */
export function upsertCurrency(store: CurrencyStore, input: UpsertCurrencyInput): CurrencyStore {
  const code = input.code.trim().toUpperCase();
  const existing = store[code];
  const currency: Currency = {
    code,
    name: input.name.trim(),
    symbol: input.symbol.trim(),
    rateFromUsd: code === USD ? 1 : input.rateFromUsd,
    updatedAt: nowIso(),
    enabled: existing?.enabled ?? true,
  };
  return { ...store, [code]: currency };
}

/** Just the rate + updatedAt, for the Settings "تعديل السعر" button - never touches name/symbol/
 * enabled. No-op for USD, whose rate is always 1. */
export function setCurrencyRate(store: CurrencyStore, code: string, rateFromUsd: number): CurrencyStore {
  const existing = store[code];
  if (!existing || code === USD) return store;
  return { ...store, [code]: { ...existing, rateFromUsd, updatedAt: nowIso() } };
}

/** USD can never be hidden - every conversion in the app is expressed relative to it. */
export function setCurrencyEnabled(store: CurrencyStore, code: string, enabled: boolean): CurrencyStore {
  const existing = store[code];
  if (!existing || code === USD) return store;
  return { ...store, [code]: { ...existing, enabled } };
}

/** amount in `currency` -> the equivalent amount in USD, given that currency's rateFromUsd. */
export function toUsd(amount: number, rateFromUsd: number): number {
  return amount / rateFromUsd;
}

/** amount in USD -> the equivalent amount in `currency`, given that currency's rateFromUsd. */
export function fromUsd(amountUsd: number, rateFromUsd: number): number {
  return amountUsd * rateFromUsd;
}
