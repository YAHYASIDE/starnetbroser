/**
 * 📂 How one operation of a rep's account reads - the same words on «📂 حساباته» (the app) and in
 * the money bot's «📊 كشفي». Pure.
 */

import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import type { RepSettlement, RepSettlementKind, RepStatementRow } from "./repStore";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

/** The operator only ever picks "له" or "عليه" (plus whether cash went through الكاش); the
 * stored kind keeps both facts so the till entry and older records stay exact. */
export const SETTLEMENT_LABELS: Record<RepSettlementKind, string> = {
  cashHandover: "➕ له · استلمت منه نقدًا",
  commissionPayout: "➖ عليه · دفعت له نقدًا",
  manualCredit: "➕ له",
  manualDebit: "➖ عليه",
  profitTransfer: "↪️ من ربحه",
  profitCredit: "➕ له في ربحه",
};

export function settlementText(s: RepSettlement): string {
  if (s.expenseId) return "📉 نصيبه من مصروف";
  if (s.kind === "profitTransfer") return s.toDebt ? `↪️ من ربحه إلى حساب ${currencyLabel(s.currencyCode)}` : "🧹 تصفير الربح";
  if (s.kind === "commissionPayout") return "💸 دفعت له من ربحه";
  if (s.kind === "profitCredit") return s.note?.startsWith("🧹") ? "🧹 تصفير الربح" : "➕ له في ربحه";
  return SETTLEMENT_LABELS[s.kind];
}

export function customerOpLabel(op: { amount: number; byRep: boolean }): string {
  if (op.amount > 0) return "📡 تجديد عليه";
  return op.byRep ? "💵 سلّمك" : "💵 دفع زبونه لك";
}

/** One line of «📂 حساباته». */
export function repRowText(row: RepStatementRow, accountName: (accountId: string) => string): string {
  if (row.type === "device") return `📈 حصته · ${accountName(row.row.accountId)}`;
  if (row.type === "customer") return `${customerOpLabel(row.op)} · ${accountName(row.op.accountId)}`;
  if (row.type === "invoice") return "🧾 فاتورة متجر";
  return `${settlementText(row.settlement)}${row.settlement.note ? ` · ${row.settlement.note}` : ""}`;
}
