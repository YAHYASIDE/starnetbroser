/**
 * 🧾 «وصل حوالة» - what the customer receives for a transfer (his Oct 10 2026 request: «الحوالات اريد
 * لها وصل فاتورة وفاتورة بصورة»), as a PrintableDocument (pdfDocument.ts): the same branded layout as
 * every PDF, and the same page as a picture. Never shows his profit or the «العملات» rate - only what
 * was agreed with the customer. Pure.
 */

import { formatAmount } from "./formatAmount";
import { ltr, type PrintableDocument } from "./pdfDocument";
import { quoteFromRate, rateQuote, remittanceRemaining, type Remittance } from "./remittances";

const NAMES: Record<string, string> = { MRU: "أوقية", SIFA: "سيفا", USD: "دولار" };
const FRANC_PER_SIFA = 5;

/** A place money was in or out: its name, and whether it's shown in فرانك (أورانج / نيتا). */
export interface ReceiptPlace {
  name: string;
  franc?: boolean;
}

/** A stable number from the transfer itself (never a counter): «H-20261010-3F2A». */
export function remittanceNumber(r: Pick<Remittance, "id" | "date">): string {
  return `H-${r.date.replace(/-/g, "")}-${r.id.replace(/^rmt-/, "").replace(/[^0-9a-z]/gi, "").slice(0, 4).toUpperCase()}`;
}

function amount(value: number, currency: string, place?: ReceiptPlace): string {
  return place?.franc ? `${formatAmount(value * FRANC_PER_SIFA)} فرانك` : `${formatAmount(value)} ${NAMES[currency] ?? currency}`;
}

/** The agreed rate in his words («1,000 سيفا = 3,600 أوقية»), or "" for one currency. */
export function rateLine(r: Pick<Remittance, "rate" | "inCurrency" | "outCurrency">): string {
  if (r.inCurrency === r.outCurrency) return "";
  const q = rateQuote(r.inCurrency, r.outCurrency);
  if (q) {
    const price = quoteFromRate(r.rate, r.inCurrency, r.outCurrency);
    if (price === undefined) return "";
    return `${formatAmount(q.block)} ${NAMES[q.foreign] ?? q.foreign} = ${formatAmount(Math.round(price * 100) / 100)} أوقية`;
  }
  return `1 ${NAMES[r.inCurrency] ?? r.inCurrency} = ${formatAmount(Math.round(r.rate * 10000) / 10000)} ${NAMES[r.outCurrency] ?? r.outCurrency}`;
}

export function buildRemittanceReceipt(r: Remittance, places: { in?: ReceiptPlace; out?: ReceiptPlace; of: (id: string) => ReceiptPlace | undefined }): PrintableDocument {
  const left = remittanceRemaining(r);
  const paid = r.owed - left;
  const rate = rateLine(r);
  const rows: string[][] = [
    ["المبلغ المحوَّل", amount(r.amount, r.inCurrency, places.in)],
    ...(r.commission > 0 ? [[r.commissionWho === "onTop" ? "العمولة (فوق المبلغ)" : "العمولة (مخصومة من المرسَل)", amount(r.commission, r.inCurrency, places.in)]] : []),
    ["المطلوب من الزبون", amount(r.owed, r.inCurrency, places.in)],
    ...(rate ? [["السعر", rate]] : []),
    ["يصل للمستفيد", amount(r.sent, r.outCurrency, places.out)],
    ["استلمنا عبر", places.in?.name ?? "-"],
    ["أُرسلت عبر", places.out?.name ?? "-"],
    ...(r.beneficiary || r.beneficiaryNumber ? [["المستفيد", [r.beneficiary, r.beneficiaryNumber ? ltr(r.beneficiaryNumber) : ""].filter(Boolean).join(" · ")]] : []),
    ...r.payments.map((p) => [`دفعة ${ltr(p.date)}`, `${amount(p.amount, r.inCurrency, places.in)} (${places.of(p.accountId)?.name ?? "-"})`]),
  ];
  return {
    title: "وصل حوالة",
    partyName: r.client,
    partyPhone: r.clientPhone,
    subtitle: `رقم الوصل: ${ltr(remittanceNumber(r))} · التاريخ: ${ltr(r.date)}`,
    summary: [
      { label: "يصل للمستفيد", value: amount(r.sent, r.outCurrency, places.out), tone: "clear" },
      { label: "دفع الزبون", value: amount(paid, r.inCurrency, places.in), tone: "clear" },
      { label: left > 0 ? "الباقي عليه" : "الحالة", value: left > 0 ? amount(left, r.inCurrency, places.in) : "مدفوعة بالكامل ✓", tone: left > 0 ? "due" : "clear" },
    ],
    columns: ["البيان", "القيمة"],
    rows,
    ...(r.note ? { footerNote: r.note } : {}),
  };
}
