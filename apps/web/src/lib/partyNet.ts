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
  /** Each other currency's balance in his currency («60,000 سيفا ≈ 218,520 أوقية»). */
  converted: { currency: string; amount: number; inBase: number }[];
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
    converted.push({ currency: code, amount: value, inBase: Math.round(inBase * 100) / 100 });
  }
  return { currency: base, amount: Math.round(amount * 100) / 100, converted };
}
