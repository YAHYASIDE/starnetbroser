/**
 * 🧾 The red amount on a device card (his Oct 25 2026 ask: «أزل كل عملية قديمة في بطاقة الجهاز، أضف فقط آخر
 * عملية - مثلًا كانت عليه 13000 وأضفنا بعد تجديد عملية بـ 6000، أضف فقط الأخير»; his choice «آخر عملية فقط»).
 * Per currency: the newest charge (عليه) - never more than what is really still owed (a partly paid
 * charge shows what's left of it). A credit or a zero balance shows as before. Display only: every
 * operation stays recorded and counted in the customer's statement and the money pages.
 */

import { computeBalanceByCurrency, LEDGER_CURRENCIES, type BalanceByCurrency, type LedgerEntry } from "./ledgerStore";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function cardDueByCurrency(entries: LedgerEntry[]): BalanceByCurrency {
  const balances = computeBalanceByCurrency(entries);
  const out: BalanceByCurrency = {};
  for (const c of LEDGER_CURRENCIES) {
    const balance = balances[c];
    if (!balance) continue;
    if (balance < 0) {
      out[c] = balance;
      continue;
    }
    const last = entries
      .filter((e) => e.kind === "debit" && e.currency === c)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
    out[c] = round2(last ? Math.min(balance, last.amount) : balance);
  }
  return out;
}
