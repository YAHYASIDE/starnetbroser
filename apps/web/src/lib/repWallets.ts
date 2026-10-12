import { buildRepPeriodStatement, keepCurrency, repRowKey, repRowSplit, type RepConvert } from "./repAccount";
import type { RepStatementDay, RepStatementRow } from "./repStore";

/**
 * 📂 «حساباته» (his Oct 12 2026 ask): a rep's money as separate accounts inside his account -
 *  - «🟠 حساب السيفا وأورانج»: everything between you in سيفا (his devices' renewals in سيفا, what he
 *    deposits in سيفا / أورانج / نيتا, the سيفا loans);
 *  - «💰 حساب الربح»: his share, minus what left it (paid to him, moved into his account, written off);
 *  - «🟢 حساب الأوقية»: the same in أوقية.
 * The two money accounts are «ما عليه» (repRowSplit's debt side) cut by each record's own currency -
 * never converted, never mixed; another currency (دولار…) gets its own account when it has records.
 * Positive = له (we owe him), negative = عليه.
 */

export interface RepWalletLine {
  key: string;
  date: string;
  row: RepStatementRow;
  /** What this record did to the account. */
  amount: Record<string, number>;
  /** The account's balance right after it. */
  after: Record<string, number>;
}

export interface RepWallet {
  /** A currency code for a money account, "profit" for his profit. */
  id: string;
  balance: Record<string, number>;
  /** Newest first. */
  lines: RepWalletLine[];
}

const EPS = 0.005;
const nonZero = (r: Record<string, number>) => Object.values(r).some((v) => Math.abs(v) > EPS);

/** His accounts from his statement days (newest first, as buildRepDailyStatement gives them).
 * `profitConvert` = the currencies his profit is shown in (his share is in dollars). */
export function repWallets(allDays: RepStatementDay[], profitConvert: RepConvert): { money: RepWallet[]; profit: RepWallet } {
  const native = buildRepPeriodStatement(allDays, {}, keepCurrency);
  const shown = buildRepPeriodStatement(allDays, {}, profitConvert);
  const codes = new Set<string>(["SIFA", "MRU", ...Object.keys(native.debt.closing)]);
  const money: RepWallet[] = [...codes].map((code) => ({ id: code, balance: { [code]: native.debt.closing[code] ?? 0 }, lines: [] }));
  const profit: RepWallet = { id: "profit", balance: shown.profit.closing, lines: [] };
  for (const day of allDays) {
    for (const row of day.rows) {
      const key = repRowKey(row);
      const debt = repRowSplit(row, keepCurrency).debt;
      for (const wallet of money) {
        const amount = debt[wallet.id];
        if (amount !== undefined && Math.abs(amount) > EPS) {
          wallet.lines.push({ key, date: day.date, row, amount: { [wallet.id]: amount }, after: { [wallet.id]: native.debt.after[key]?.[wallet.id] ?? 0 } });
        }
      }
      const gained = repRowSplit(row, profitConvert).profit;
      if (nonZero(gained)) profit.lines.push({ key, date: day.date, row, amount: gained, after: shown.profit.after[key] ?? {} });
    }
  }
  // سيفا first, then أوقية, then any other currency that has records.
  const order = (id: string) => (id === "SIFA" ? 0 : id === "MRU" ? 1 : 2);
  return { money: money.filter((w) => w.id === "SIFA" || w.id === "MRU" || w.lines.length > 0).sort((a, b) => order(a.id) - order(b.id)), profit };
}

/** His profit right now in one currency (for «↪️ نقل ربحه» / «💸 دفعت له»), 0 when none is due. */
export function repProfitIn(allDays: RepStatementDay[], code: string, convert: RepConvert): number {
  const value = buildRepPeriodStatement(allDays, {}, convert).profit.closing[code] ?? 0;
  return value > EPS ? Math.round(value * 100) / 100 : 0;
}

/** His profit now in one currency, signed (+ = له, − = عليه) - what «🧹 تصفير الربح» brings to 0. */
export function repProfitSigned(allDays: RepStatementDay[], code: string, convert: RepConvert): number {
  const value = buildRepPeriodStatement(allDays, {}, convert).profit.closing[code] ?? 0;
  return Math.abs(value) > EPS ? Math.round(value * 100) / 100 : 0;
}

/** 🧹 «تصفير الربح» either way (his Oct 12 2026 report: a profit at «عليه 336,025 سيفا» could not be
 * zeroed): له → written off (profitTransfer), عليه → added back (profitCredit); 0 → null. */
export function repProfitZeroEntry(profit: number): { kind: "profitTransfer" | "profitCredit"; amount: number } | null {
  if (Math.abs(profit) <= EPS) return null;
  const amount = Math.round(Math.abs(profit) * 100) / 100;
  return profit > 0 ? { kind: "profitTransfer", amount } : { kind: "profitCredit", amount };
}

export function repWalletTitle(id: string): string {
  if (id === "profit") return "💰 حساب الربح";
  if (id === "SIFA") return "🟠 حساب السيفا وأورانج";
  if (id === "MRU") return "🟢 حساب الأوقية";
  if (id === "USD") return "💵 حساب الدولار";
  return `حساب ${id}`;
}

/**
 * 🧹 «تصفير الحساب» for one of his money accounts (his Oct 12 2026 ask «اريد اصفّر حساباته، اضف في كل
 * حساب له أو عليه»): the له / عليه amount that brings it back to 0 - a normal, deletable record.
 * عليه 44,000 (−44,000) → «له» 44,000; له 6,000 → «عليه» 6,000; already 0 → null.
 */
export function repZeroEntry(balance: number): { kind: "manualCredit" | "manualDebit"; amount: number } | null {
  if (Math.abs(balance) <= EPS) return null;
  const amount = Math.round(Math.abs(balance) * 100) / 100;
  return balance < 0 ? { kind: "manualCredit", amount } : { kind: "manualDebit", amount };
}
