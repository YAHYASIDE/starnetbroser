/**
 * 📌 «تثبيت سعر العملة» (his Nov 19 2026 ask): a pinned currency keeps its rate - nothing automatic changes it (a D
 * payment, a quote on a customer's net line, a currency added from a dialog); only the currencies page, after he
 * removes the pin. Paying a D in a pinned currency records what was really paid on THAT D only; the difference from
 * the pinned rate may be up to PIN_TOLERANCE_USD either way, beyond it the payment needs «رمز العملات» - his own code,
 * set and changed on the currencies page (only a SHA-256 of it is kept, phone-only).
 */

import { sha256Hex, normalizeCode } from "./deleteCode";
import { implausibleRate, losesPin, withChange, type Currency, type CurrencyStore } from "./currencyStore";
import type { SyncOp } from "./deviceSync";

/** Phone-only (a code, never backed up). */
export const CURRENCY_CODE_KEY = "starnet.currencyCode";
export const PIN_TOLERANCE_USD = 5;
export const MIN_CODE_LENGTH = 4;

export function isPinned(currency: Pick<Currency, "pinnedAt"> | undefined): boolean {
  return Boolean(currency?.pinnedAt);
}

export function pinCurrency(store: CurrencyStore, code: string, now: string, by = ""): CurrencyStore {
  const c = store[code];
  // an impossible rate (EUR at 0.27 instead of ~0.87, Nov 21 2026) is never pinned - it would block every D
  if (!c || code === "USD" || c.pinnedAt || implausibleRate(code, c.rateFromUsd)) return store;
  const { unpinnedAt: _u, ...rest } = c;
  return { ...store, [code]: withChange({ ...rest, pinnedAt: now }, { at: now, by, what: "pin", rate: c.rateFromUsd }) };
}

/** 🔓 Only after «رمز العملات» (the page asks it): `unpinnedAt` is what lets the other phones accept the unpin. */
export function unpinCurrency(store: CurrencyStore, code: string, now: string = new Date().toISOString(), by = ""): CurrencyStore {
  const c = store[code];
  if (!c?.pinnedAt) return store;
  const { pinnedAt: _p, ...rest } = c;
  return { ...store, [code]: withChange({ ...rest, unpinnedAt: now }, { at: now, by, what: "unpin", rate: c.rateFromUsd }) };
}

/** 📌 «ثبّت كل الأسعار» (his Nov 21 2026 ask): every enabled currency but USD at its current rate - except one at an
 * impossible rate (listed, to correct first). */
export function pinAllCurrencies(store: CurrencyStore, now: string, by = ""): { store: CurrencyStore; pinned: string[]; wrong: string[] } {
  let next = store;
  const pinned: string[] = [];
  const wrong: string[] = [];
  for (const c of Object.values(store)) {
    if (!c || c.code === "USD" || c.enabled === false || c.pinnedAt) continue;
    if (implausibleRate(c.code, c.rateFromUsd)) {
      wrong.push(c.code);
      continue;
    }
    next = pinCurrency(next, c.code, now, by);
    pinned.push(c.code);
  }
  return { store: next, pinned, wrong };
}

export const CURRENCIES_KEY = "starnet_currencies_v1";

/**
 * 🛡️ His Nov 21 2026 report: the pinned euro became 0.2675 on Nov 20 and its pin was gone - a phone of the team on an
 * older build (or an unpin without the code) wrote over it, and the team link took it. Now every phone refuses, from
 * another phone, a change that drops a pin or moves a pinned rate - unless it is his unpin with «رمز العملات»
 * (`unpinnedAt` after the pin) or a newer pin (unpinned, corrected and pinned again with the code). A refused change is
 * sent back corrected (the pinned record goes out again). Null = not a pinned currency, nothing to say.
 */
export function guardPinnedOp(op: Pick<SyncOp, "k" | "v">, before: string | undefined): "reject" | null {
  if (op.k !== CURRENCIES_KEY || before === undefined) return null;
  let old: Partial<Currency>;
  try {
    old = JSON.parse(before) as Partial<Currency>;
  } catch {
    return null;
  }
  if (!old?.pinnedAt) return null;
  let next: Partial<Currency> | undefined;
  try {
    next = op.v === null ? undefined : (JSON.parse(op.v) as Partial<Currency>);
  } catch {
    return "reject";
  }
  return losesPin(old, next) ? "reject" : null;
}

/** A refused change, for the currencies page («🛡️ رُفض»). */
export interface RefusedRateChange {
  at: string;
  by: string;
  code: string;
  /** What it tried: the rate it carried, and whether it dropped the pin. */
  rate: number | null;
  unpinned: boolean;
}

export function refusedChange(op: Pick<SyncOp, "r" | "v" | "at">, by: string): RefusedRateChange {
  let next: Partial<Currency> | null = null;
  try {
    next = op.v === null ? null : (JSON.parse(op.v) as Partial<Currency>);
  } catch {
    next = null;
  }
  return { at: op.at, by, code: op.r, rate: typeof next?.rateFromUsd === "number" ? next.rateFromUsd : null, unpinned: !next?.pinnedAt };
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

/** 👥 «رمز العملات» of the whole team (his Nov 21 2026 ask «يكون رمز العملات واحدًا لكل الفريق ويُطلب على كل الأجهزة»):
 * a business store, so it travels in the team link (sealed) and the backup - only its hash. */
export const TEAM_CODE_KEY = "starnet_currency_code_v1";

export interface TeamCurrencyCode {
  hash: string;
  setAt: string;
  by: string;
}

function readTeamCode(): TeamCurrencyCode | null {
  try {
    const raw = window.localStorage.getItem(TEAM_CODE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<TeamCurrencyCode>) : null;
    return v && typeof v.hash === "string" && v.hash ? (v as TeamCurrencyCode) : null;
  } catch {
    return null;
  }
}

/** The team's code (hash), else this phone's older one. */
export function loadCurrencyCodeHash(): string | null {
  if (typeof window === "undefined") return null;
  const team = readTeamCode();
  if (team) return team.hash;
  try {
    return window.localStorage.getItem(CURRENCY_CODE_KEY);
  } catch {
    return null;
  }
}

export function saveCurrencyCode(code: string, by = ""): void {
  try {
    const value: TeamCurrencyCode = { hash: currencyCodeHash(code), setAt: new Date().toISOString(), by };
    window.localStorage.setItem(TEAM_CODE_KEY, JSON.stringify(value));
    window.localStorage.removeItem(CURRENCY_CODE_KEY);
  } catch {
    // stays as it was
  }
}

/** Once: a phone's own older code becomes the team's (when the team has none yet). */
export function shareOldCurrencyCode(): boolean {
  try {
    if (readTeamCode()) return false;
    const old = window.localStorage.getItem(CURRENCY_CODE_KEY);
    if (!old) return false;
    window.localStorage.setItem(TEAM_CODE_KEY, JSON.stringify({ hash: old, setAt: new Date().toISOString(), by: "" } satisfies TeamCurrencyCode));
    window.localStorage.removeItem(CURRENCY_CODE_KEY);
    return true;
  } catch {
    return false;
  }
}

// ---- 🛡️ the refused changes, on this phone (shown on the currencies page) ----

const REFUSED_KEY = "starnet.currencyRefused";

export function loadRefusedChanges(): RefusedRateChange[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(REFUSED_KEY) ?? "[]");
    return Array.isArray(v) ? (v as RefusedRateChange[]) : [];
  } catch {
    return [];
  }
}

export function addRefusedChanges(list: RefusedRateChange[]): void {
  if (!list.length) return;
  try {
    window.localStorage.setItem(REFUSED_KEY, JSON.stringify([...list, ...loadRefusedChanges()].slice(0, 30)));
  } catch {
    // only a notice
  }
}
