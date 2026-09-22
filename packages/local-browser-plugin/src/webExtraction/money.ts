import { toWesternDigits } from "./arabicNumerals";

// Longest/most specific tokens first - "USDT" must be tried before "USD" or "10 USDT" would
// incorrectly match "USD" and leave a stray "T". Starlink bills in whatever currency the account's
// own country uses, never just USD - ARS was a real, confirmed miss (an Argentina-billed account's
// balance came back as "not found" entirely), so this list covers Starlink's other common billing
// currencies too rather than waiting for each one to surface as its own bug report.
const CURRENCY_TOKEN =
  "(USDT|USD|SAR|MRU|ARS|CLP|PEN|COP|MXN|BRL|EUR|GBP|CAD|AUD|NZD|ZAR|NGN|KES|PHP|MYR|IDR|INR|JPY" +
  "|US\\$|\\$US|\\$|€|£|ريال|ر\\.س)";
// A whole number, optionally grouped into 3-digit chunks by "." or "," (either can be the
// thousands separator depending on locale - Starlink's page isn't always US-style), with an
// optional final 1-2 digit fractional part. Must start and end on a digit so a trailing/leading
// separator is never swept in. parseAmountToken below decides which separator (if any) was
// actually the decimal point.
const AMOUNT_TOKEN = "([0-9](?:[0-9.,]*[0-9])?)";
const MONEY_PATTERN = new RegExp(
  `(?:${CURRENCY_TOKEN}\\s*${AMOUNT_TOKEN})|(?:${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN})`,
  "i",
);

export interface ParsedMoney {
  /** Always two decimal places, e.g. "0.00" - 0 is a real, confirmed "no balance due", not absent. */
  amount: string;
  /** Canonical form - "$", "US$", "$US" and "USD" all normalize to "USD" (similarly for €/£). */
  currency: string;
}

/**
 * Finds a currency+amount pair anywhere in `text` (Arabic-Indic digits included, e.g. "٠,٠٠
 * USD"). Returns null when nothing matches - never a fabricated "0.00".
 */
export function parseMoney(text: string): ParsedMoney | null {
  const normalized = normalizeArabicSeparators(toWesternDigits(text));
  const match = MONEY_PATTERN.exec(normalized);
  if (!match) return null;

  const [, currencyA, amountA, amountB, currencyB] = match;
  const currencyToken = currencyA ?? currencyB;
  const amountToken = amountA ?? amountB;
  if (!currencyToken || !amountToken) return null;

  const numeric = parseAmountToken(amountToken);
  if (Number.isNaN(numeric)) return null;

  return { amount: numeric.toFixed(2), currency: normalizeCurrency(currencyToken) };
}

// The Arabic thousands separator (٬, U+066C) and decimal separator (٫, U+066B) - toWesternDigits
// only converts the digits themselves, never these marks, so a real Arabic-locale amount would
// otherwise still fail to match AMOUNT_TOKEN's "." / "," grouping entirely.
function normalizeArabicSeparators(text: string): string {
  return text.replace(/٬/g, ",").replace(/٫/g, ".");
}

/**
 * Locale-agnostic: the LAST "." or "," is the decimal point only when exactly 1-2 digits follow
 * it (e.g. "137,861.11" or the EU-style "137.861,11") - every other "." or "," in the token is
 * thousands grouping and is discarded. A token whose last separator is followed by 3 digits (a
 * grouped whole number like "1,234", no fractional part at all) is read as that whole number, not
 * misread as "1.234".
 */
function parseAmountToken(token: string): number {
  const match = /^(.*)[.,](\d{1,2})$/.exec(token);
  if (!match) return Number(token.replace(/[.,]/g, ""));
  const [, wholePart, fractionPart] = match;
  return Number(`${wholePart.replace(/[.,]/g, "")}.${fractionPart}`);
}

function normalizeCurrency(token: string): string {
  const upper = token.toUpperCase();
  if (upper === "$" || upper === "US$" || upper === "$US" || upper === "USD") return "USD";
  if (token === "€") return "EUR";
  if (token === "£") return "GBP";
  return upper;
}
