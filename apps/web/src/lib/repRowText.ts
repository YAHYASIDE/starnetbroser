/**
 * 📂 How one operation of a rep's account reads - the same words on «📂 حساباته» (the app) and in
 * the money bot's «📊 كشفي». Pure.
 */

import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "./ledgerStore";
import type { RepSettlement, RepSettlementKind, RepStatementRow } from "./repStore";
import { deletedText } from "./deletedOps";
import { formatAmount } from "./formatAmount";

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
  // 🧹 only the real «تصفير الربح» (its note says so); a «➖ عليه» from his profit is said as one (his Nov 1 2026 report:
  // a 140,000 «تلفون» taken from his profit read «🧹 تصفير الربح»).
  if (s.kind === "profitTransfer") return s.toDebt ? `↪️ من ربحه إلى حساب ${currencyLabel(s.currencyCode)}` : s.note?.startsWith("🧹") ? "🧹 تصفير الربح" : "➖ عليه في ربحه";
  if (s.kind === "commissionPayout") return "💸 دفعت له من ربحه";
  if (s.kind === "profitCredit") return s.note?.startsWith("🧹") ? "🧹 تصفير الربح" : "➕ له في ربحه";
  return SETTLEMENT_LABELS[s.kind];
}

/** «10,000 سيفا» */
function formatDeletedAmount(amount: number, currency: string): string {
  return `${formatAmount(amount)} ${LEDGER_CURRENCY_LABELS[currency as LedgerCurrency] ?? currency}`;
}

export function customerOpLabel(op: { amount: number; byRep: boolean }): string {
  if (op.amount > 0) return "📡 تجديد عليه";
  return op.byRep ? "💵 سلّمك" : "💵 دفع زبونه لك";
}

/** 🔔 What the operation is, without the device or note (the money bot's operation message puts the
 * device's email on its own line). */
export function repRowLabel(row: RepStatementRow): string {
  if (row.type === "device") return "📈 حصته من الربح";
  if (row.type === "customer") return customerOpLabel(row.op);
  if (row.type === "invoice") return "🧾 فاتورة متجر";
  if (row.type === "deleted") return "🗑️ عملية محذوفة";
  return settlementText(row.settlement);
}

/** The device an operation is about, if any. */
export function repRowAccountId(row: RepStatementRow): string | undefined {
  if (row.type === "device") return row.row.accountId;
  if (row.type === "customer") return row.op.accountId;
  if (row.type === "deleted" && row.deleted.store === "ledger") return row.deleted.accountId;
  return undefined;
}

/** 🔔 The facts the money bot's operation message shows apart (repOpMessage.ts). */
export function repRowFacts(row: RepStatementRow): { kind: string; accountId?: string; note?: string } {
  const accountId = repRowAccountId(row);
  const note = row.type === "settlement" ? row.settlement.note : undefined;
  return { kind: repRowLabel(row), ...(accountId ? { accountId } : {}), ...(note ? { note } : {}) };
}

/** One line of «📂 حساباته». */
export function repRowText(row: RepStatementRow, accountName: (accountId: string) => string): string {
  if (row.type === "device") return `📈 حصته · ${accountName(row.row.accountId)}`;
  if (row.type === "customer") return `${customerOpLabel(row.op)} · ${accountName(row.op.accountId)}`;
  if (row.type === "invoice") return "🧾 فاتورة متجر";
  if (row.type === "deleted") return `${deletedText(row.deleted, accountName, settlementText)} · ${formatDeletedAmount(row.amount, row.currency)}`;
  const label = settlementText(row.settlement);
  // the note «🧹 تصفير الربح» is the label itself - never twice
  const note = row.settlement.note && row.settlement.note !== label ? row.settlement.note : "";
  return `${label}${note ? ` · ${note}` : ""}`;
}
