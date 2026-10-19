/**
 * ⚖️ A customer's balances in several currencies, as ONE figure in his own currency (his Oct 11 2026
 * ask: «له 60,000 سيفا وعليه 214,000 أوقية… سطر تحتهم بعملته الأساسية: 60,000 سيفا = 216,000 أوقية →
 * يبقى له 2,000 أوقية؛ وإن كانت عملته سيفا 555.55»). Display only, at today's registry rates - the
 * balances themselves stay apart per currency and are never converted in the records. Pure.
 */

export interface PartyNet {
  /** The currency the net is in (his own). */
  currency: string;
  /** + he owes us (عليه), − we owe him (له) - same sign as `remaining`. */
  amount: number;
  /** Each other currency's balance in his currency («60,000 سيفا ≈ 218,520 أوقية»), with the rate
   * used as he says it - أوقية per block of the other one («1,000 سيفا = 3,600 أوقية») - when one
   * side is أوقية. */
  converted: { currency: string; amount: number; inBase: number; quote?: PairQuote }[];
}

export interface PairQuote {
  /** The currency that isn't أوقية. */
  foreign: string;
  /** 1,000 for سيفا / دينار, else 1. */
  block: number;
  /** أوقية per block. */
  mru: number;
}

const BLOCK_OF_1000 = new Set(["SIFA", "DZD"]);

/** His rate «1,000 سيفا = 3,600 أوقية» → the registry's rate of that currency (units per dollar),
 * keeping the أوقية rate as it is. */
export function foreignRateFromQuote(quote: PairQuote, mruRateFromUsd: number): number {
  return (mruRateFromUsd * quote.block) / quote.mru;
}

/** Today's rate of a currency the way he says it: أوقية per block of it («1,000 سيفا = 3,600 أوقية»).
 * Null for أوقية / الدولار themselves or a missing rate. */
export function mruQuoteFor(code: string, rateFromUsd: number | undefined, mruRateFromUsd: number | undefined): PairQuote | null {
  if (code === "MRU" || code === "USD" || !rateFromUsd || !(rateFromUsd > 0) || !mruRateFromUsd || !(mruRateFromUsd > 0)) return null;
  const block = BLOCK_OF_1000.has(code) ? 1000 : 1;
  return { foreign: code, block, mru: Math.round((mruRateFromUsd / rateFromUsd) * block * 100) / 100 };
}

const EPSILON = 0.005;

/** Null unless he has balances in at least two currencies and every one of them has a rate. */
export function partyNetIn(remaining: Record<string, number>, base: string, rateFromUsd: (code: string) => number | undefined): PartyNet | null {
  const open = Object.entries(remaining).filter(([, v]) => Math.abs(v) > EPSILON);
  if (open.length < 2) return null;
  const rate = (code: string) => (code === "USD" ? 1 : rateFromUsd(code));
  const baseRate = rate(base);
  if (!baseRate || !(baseRate > 0)) return null;
  let amount = 0;
  const converted: PartyNet["converted"] = [];
  for (const [code, value] of open) {
    if (code === base) {
      amount += value;
      continue;
    }
    const r = rate(code);
    if (!r || !(r > 0)) return null;
    const inBase = (value / r) * baseRate;
    amount += inBase;
    const foreign = base === "MRU" ? code : code === "MRU" ? base : null;
    const quote = foreign ? (mruQuoteFor(foreign, rate(foreign), rate("MRU")) ?? undefined) : undefined;
    converted.push({ currency: code, amount: value, inBase: Math.round(inBase * 100) / 100, ...(quote ? { quote } : {}) });
  }
  return { currency: base, amount: Math.round(amount * 100) / 100, converted };
}

/**
 * Where his account stands (his Oct 19 2026 report: «دفع كل شيء عليه وحسابه 0، وأنت تُظهر سيفا»): with balances
 * in 2+ currencies the net in his currency decides - 32,000 سيفا عليه against 118,400 أوقية له at 3,700 is
 * «متعادل», never «عليه دين»; with one currency (or no rate) each currency as before.
 */
export function partyStanding(remaining: Record<string, number>, net: PartyNet | null): "due" | "credit" | "clear" {
  if (net) return net.amount > EPSILON ? "due" : net.amount < -EPSILON ? "credit" : "clear";
  const values = Object.values(remaining);
  if (values.some((v) => v > EPSILON)) return "due";
  return values.some((v) => v < -EPSILON) ? "credit" : "clear";
}
