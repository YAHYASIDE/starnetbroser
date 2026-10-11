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
    const mruRate = rate("MRU");
    const foreignRate = foreign ? rate(foreign) : undefined;
    const block = foreign && BLOCK_OF_1000.has(foreign) ? 1000 : 1;
    const quote = foreign && mruRate && foreignRate ? { foreign, block, mru: Math.round((mruRate / foreignRate) * block * 100) / 100 } : undefined;
    converted.push({ currency: code, amount: value, inBase: Math.round(inBase * 100) / 100, ...(quote ? { quote } : {}) });
  }
  return { currency: base, amount: Math.round(amount * 100) / 100, converted };
}
