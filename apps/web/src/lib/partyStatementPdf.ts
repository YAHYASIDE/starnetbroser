/**
 * كشف حساب زبون / مورد as a printable document (pdfDocument.ts) - shared by the party cards
 * (AccountsSection) and the Telegram bot's «كشف ...» command.
 */

import { formatAmount } from "./formatAmount";
import type { PartyStatementRow, PartyStoreTotals } from "./invoiceStore";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency } from "./ledgerStore";
import type { PrintableDocument } from "./pdfDocument";
import { buildStatementData, statementKindLabel } from "./statementDocument";

export { statementKindLabel };

const EPSILON = 0.0001;

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

export function buildPartyStatementPdf(
  party: { name: string; phone?: string },
  isClient: boolean,
  totals: Record<string, PartyStoreTotals>,
  statement: PartyStatementRow[],
  devices: string[] = [],
): PrintableDocument {
  const summary = Object.entries(totals).flatMap(([code, t]) => [
    { label: `الإجمالي (${currencyLabel(code)})`, value: formatAmount(t.total) },
    { label: `المدفوع (${currencyLabel(code)})`, value: formatAmount(t.paid), tone: "clear" as const },
    {
      label: `${isClient ? "المتبقي عليه" : "المتبقي له"} (${currencyLabel(code)})`,
      value: formatAmount(t.remaining),
      tone: t.remaining > EPSILON ? ("due" as const) : ("clear" as const),
    },
  ]);
  return {
    title: isClient ? "كشف حساب زبون" : "كشف حساب مورد",
    partyName: party.name,
    partyPhone: party.phone,
    summary,
    columns: ["التاريخ", "البيان", "ملاحظة", "المبلغ", "الرصيد بعدها"],
    rows: statement.map((row) => [
      row.date,
      statementKindLabel(row, isClient),
      row.note ?? "",
      `${row.delta < 0 ? "-" : "+"}${formatAmount(row.amount)} ${currencyLabel(row.currencyCode)}`,
      `${formatAmount(row.balanceAfter)} ${currencyLabel(row.currencyCode)}`,
    ]),
    rowTones: statement.map((row) => (row.balanceAfter > EPSILON ? "due" : "clear")),
    footerNote: isClient ? "يشمل فواتير المتجر وعمليات أجهزة Starlink المرتبطة بالزبون." : undefined,
    // Rendered with the invoice-style statement (statementDocument.ts) - the fields above stay as
    // the plain-table fallback.
    statement: buildStatementData(party, isClient, totals, statement, devices),
  };
}
