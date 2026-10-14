/**
 * 💵 The currencies money can be held in as cash (الكاش) and moved through «تحويل الأموال»: the
 * ledger's three plus the Algerian dinar (his Oct 10 2026 request: «اضف لي دينار جزائري مع العملات
 * لي تحويل الاموال وكاش»). Device / customer ledgers keep their own three (LEDGER_CURRENCIES).
 */

import { LEDGER_CURRENCY_LABELS } from "./ledgerStore";

export const DZD = "DZD";

export const CASH_CURRENCIES: string[] = ["MRU", "SIFA", "USD", DZD];

const LABELS: Record<string, string> = { ...LEDGER_CURRENCY_LABELS, [DZD]: "دينار جزائري" };

/** Arabic name of a cash / ledger currency (the code itself when unknown). */
export function cashCurrencyLabel(code: string): string {
  return LABELS[code] ?? code;
}
