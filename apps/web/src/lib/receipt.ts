/**
 * سند قبض - a printable receipt for one device payment ("credit" ledger entry), built as a
 * PrintableDocument (pdfDocument.ts) so it shares the branded PDF layout. The balance shown is the
 * device's balance in the payment's currency right after this payment - later operations never
 * change an already-issued receipt's figure.
 */

import { LEDGER_CURRENCY_LABELS, LedgerEntry, PAYMENT_METHOD_LABELS } from "./ledgerStore";
import { formatAmount } from "./formatAmount";
import { ltr, type PrintableDocument } from "./pdfDocument";

/** A stable, human-friendly receipt number derived from the payment itself (never a stored
 * counter): its date plus the start of its id, e.g. "R-20260925-3F2A". */
export function receiptNumber(entry: LedgerEntry): string {
  return `R-${entry.date.replace(/-/g, "")}-${entry.id.replace(/[^0-9a-z]/gi, "").slice(0, 4).toUpperCase()}`;
}

function ordered(a: LedgerEntry, b: LedgerEntry): number {
  return a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/** Balance in the payment's currency after it (debits - credits of everything up to and
 * including it, in date/creation order). Positive = still owed. */
export function balanceAfterPayment(entries: LedgerEntry[], payment: LedgerEntry): number {
  let balance = 0;
  for (const entry of [...entries].sort(ordered)) {
    if (entry.currency === payment.currency) balance += entry.kind === "debit" ? entry.amount : -entry.amount;
    if (entry.id === payment.id) break;
  }
  return balance;
}

export function buildPaymentReceipt(input: {
  payment: LedgerEntry;
  entries: LedgerEntry[];
  deviceName: string;
  clientName?: string;
  clientPhone?: string;
}): PrintableDocument {
  const { payment } = input;
  const currency = LEDGER_CURRENCY_LABELS[payment.currency] ?? payment.currency;
  const balance = balanceAfterPayment(input.entries, payment);
  return {
    title: "سند قبض",
    partyName: input.clientName || input.deviceName,
    partyPhone: input.clientPhone,
    subtitle: `رقم السند: ${ltr(receiptNumber(payment))} · التاريخ: ${ltr(payment.date)}`,
    summary: [
      { label: "المبلغ المستلم", value: `${formatAmount(payment.amount)} ${currency}`, tone: "clear" },
      {
        label: balance > 0.0001 ? "المتبقي عليه بعد الدفعة" : balance < -0.0001 ? "رصيد له بعد الدفعة" : "الرصيد بعد الدفعة",
        value: `${formatAmount(Math.abs(balance))} ${currency}`,
        tone: balance > 0.0001 ? "due" : "clear",
      },
    ],
    columns: ["البيان", "الجهاز", "طريقة الدفع", "المبلغ"],
    rows: [
      [
        payment.note || "دفعة اشتراك Starlink",
        input.deviceName,
        payment.paymentMethod ? PAYMENT_METHOD_LABELS[payment.paymentMethod] : "-",
        `${formatAmount(payment.amount)} ${currency}`,
      ],
    ],
    footerNote: "استلمنا المبلغ أعلاه، وشكرًا لتعاملكم معنا.",
  };
}
