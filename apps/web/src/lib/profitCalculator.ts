/**
 * 🧮 حاسبة الربح - "if Starlink costs me X and I sell at Y, what do I keep?" A what-if tool only:
 * it converts between currencies with the rates it's handed (the registry's current rates), which
 * is fine for a calculator and is never written to any record. Pure.
 */

export interface CalculatorInput {
  costAmount: number;
  costCurrency: string;
  saleAmount: number;
  saleCurrency: string;
  /** code -> units per 1 USD (currencyStore rateFromUsd). */
  rates: Record<string, number | undefined>;
  /** Representative's share of the profit, 0-100. */
  repPercent?: number;
  /** Extra per-sale cost (transport, card fee...) in the sale currency. */
  extraCost?: number;
}

export interface CalculatorResult {
  /** All in the sale currency. */
  cost: number;
  profit: number;
  repShare: number;
  net: number;
  /** Profit / sale, %. */
  margin: number;
  /** Profit / cost, %. */
  markup: number;
}

export function convert(amount: number, from: string, to: string, rates: Record<string, number | undefined>): number | null {
  if (from === to) return amount;
  const fromRate = from === "USD" ? 1 : rates[from];
  const toRate = to === "USD" ? 1 : rates[to];
  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) return null;
  return (amount / fromRate) * toRate;
}

/** Null when a rate is missing or the numbers are unusable. */
export function calculateProfit(input: CalculatorInput): CalculatorResult | null {
  if (!(input.saleAmount > 0) || !(input.costAmount >= 0)) return null;
  const converted = convert(input.costAmount, input.costCurrency, input.saleCurrency, input.rates);
  if (converted === null) return null;
  const cost = converted + Math.max(0, input.extraCost ?? 0);
  const profit = input.saleAmount - cost;
  const percent = Math.min(100, Math.max(0, input.repPercent ?? 0));
  const repShare = profit > 0 ? (profit * percent) / 100 : 0;
  return {
    cost,
    profit,
    repShare,
    net: profit - repShare,
    margin: (profit / input.saleAmount) * 100,
    markup: cost > 0 ? (profit / cost) * 100 : 0,
  };
}

/** The sale price that leaves `targetProfit` (in the sale currency) after costs, rounded up to
 * `roundTo` (e.g. 100 أوقية). */
export function priceForProfit(
  input: Omit<CalculatorInput, "saleAmount">,
  targetProfit: number,
  roundTo = 1,
): number | null {
  const converted = convert(input.costAmount, input.costCurrency, input.saleCurrency, input.rates);
  if (converted === null) return null;
  const raw = converted + Math.max(0, input.extraCost ?? 0) + Math.max(0, targetProfit);
  const step = roundTo > 0 ? roundTo : 1;
  return Math.ceil(raw / step - 1e-9) * step;
}
