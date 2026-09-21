import { toWesternDigits } from "./arabicNumerals";

// Longest/most specific tokens first - "USDT" must be tried before "USD" or "10 USDT" would
// incorrectly match "USD" and leave a stray "T".
const CURRENCY_TOKEN = "(USDT|USD|SAR|MRU|US\\$|\\$US|\\$|ريال|ر\\.س)";
const AMOUNT_TOKEN = "([0-9]+(?:[.,][0-9]{1,2})?)";
const MONEY_PATTERN = new RegExp(
  `(?:${CURRENCY_TOKEN}\\s*${AMOUNT_TOKEN})|(?:${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN})`,
  "i",
);

export interface ParsedMoney {
  /** Always two decimal places, e.g. "0.00" - 0 is a real, confirmed "no balance due", not absent. */
  amount: string;
  /** Canonical form - "$", "US$", "$US" and "USD" all normalize to "USD". */
  currency: string;
}

/**
 * Finds a currency+amount pair anywhere in `text` (Arabic-Indic digits included, e.g. "٠,٠٠
 * USD"). Returns null when nothing matches - never a fabricated "0.00".
 */
export function parseMoney(text: string): ParsedMoney | null {
  const normalized = toWesternDigits(text);
  const match = MONEY_PATTERN.exec(normalized);
  if (!match) return null;

  const [, currencyA, amountA, amountB, currencyB] = match;
  const currencyToken = currencyA ?? currencyB;
  const amountToken = amountA ?? amountB;
  if (!currencyToken || !amountToken) return null;

  const numeric = Number(amountToken.replace(",", "."));
  if (Number.isNaN(numeric)) return null;

  return { amount: numeric.toFixed(2), currency: normalizeCurrency(currencyToken) };
}

function normalizeCurrency(token: string): string {
  const upper = token.toUpperCase();
  if (upper === "$" || upper === "US$" || upper === "$US" || upper === "USD") {
    return "USD";
  }
  return token;
}
