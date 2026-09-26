/**
 * «قراءة من صورة» in the device operation form: Claude reads a payment receipt (Bankily, Masrvi,
 * Sedad, Orange Money, a bank transfer, a handwritten note) and returns these fields, which only
 * PRE-FILL the form - the operator reviews and saves as usual. Nothing here writes any record.
 */

import { LEDGER_CURRENCIES, LedgerCurrency, LedgerEntryKind, PAYMENT_METHODS, PaymentMethod } from "./ledgerStore";

/** JSON schema for Claude's structured output (output_config.format). */
const nullable = (schema: Record<string, unknown>, description: string) => ({ anyOf: [schema, { type: "null" }], description });

export const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    kind: nullable({ type: "string", enum: ["payment", "charge"] }, "payment = the customer paid us; charge = an amount owed by the customer"),
    amount: nullable({ type: "number" }, "The main amount, as a plain number"),
    currency: nullable({ type: "string" }, "Currency code or name exactly as seen (USD, MRU, UM, أوقية, CFA...)"),
    date: nullable({ type: "string", format: "date" }, "YYYY-MM-DD"),
    method: nullable({ type: "string", enum: ["bankily", "masrvi", "sedad", "orange", "nita", "cash"] }, "Payment app/channel if visible"),
    note: nullable({ type: "string" }, "Short Arabic note: payer name, reference number"),
    oldOuguiya: { type: "boolean", description: "true if the amount is in OLD ouguiya (MRO), which is 10x MRU" },
  },
  required: ["kind", "amount", "currency", "date", "method", "note", "oldOuguiya"],
  additionalProperties: false,
};

export const RECEIPT_PROMPT = `هذه صورة إيصال دفع أو فاتورة من زبون في موريتانيا. استخرج منها: المبلغ الرئيسي، العملة كما هي مكتوبة، التاريخ (YYYY-MM-DD)، طريقة الدفع إن ظهرت (بنكيلي bankily، مصرفي masrvi، سداد sedad، أورانج موني orange، نيتا nita، نقدًا cash)، وملاحظة قصيرة بالعربية (اسم الدافع ورقم العملية إن وُجدا). إيصال تحويل من الزبون = payment. إذا كان المبلغ بالأوقية القديمة (MRO) فضع oldOuguiya=true. أي حقل لا تراه بوضوح اجعله null، ولا تخمّن.`;

export interface ReceiptFields {
  kind?: LedgerEntryKind;
  amount?: number;
  currency?: LedgerCurrency;
  date?: string;
  paymentMethod?: PaymentMethod;
  note?: string;
  /** Something the operator must check (e.g. converted old ouguiya, unknown currency). */
  warning?: string;
}

function toCurrency(raw: string): LedgerCurrency | undefined {
  const value = raw.trim().toUpperCase();
  if (["USD", "$", "US$", "DOLLAR", "دولار"].includes(value) || value.includes("دولار")) return "USD";
  if (["MRU", "UM", "MRO", "OUGUIYA"].includes(value) || raw.includes("أوقية") || raw.includes("اوقية")) return "MRU";
  if (["SIFA", "XOF", "CFA", "FCFA"].includes(value) || raw.includes("سيفا")) return "SIFA";
  return undefined;
}

/** Turns Claude's raw answer into safe form values: unknown or malformed fields are dropped. */
export function normalizeReceipt(raw: unknown): ReceiptFields {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: ReceiptFields = {};
  const warnings: string[] = [];
  if (r.kind === "payment") out.kind = "credit";
  else if (r.kind === "charge") out.kind = "debit";
  if (typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount > 0) out.amount = r.amount;
  if (typeof r.currency === "string" && r.currency.trim()) {
    const currency = toCurrency(r.currency);
    if (currency) out.currency = currency;
    else warnings.push(`عملة غير معروفة في الصورة (${r.currency}) - اختر العملة بنفسك`);
  }
  if (r.oldOuguiya === true && out.amount !== undefined) {
    out.amount = Math.round((out.amount / 10) * 100) / 100;
    out.currency = "MRU";
    warnings.push("المبلغ كان بالأوقية القديمة وحُوّل إلى الجديدة (÷10)");
  }
  if (typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date))) out.date = r.date;
  if (typeof r.method === "string" && (PAYMENT_METHODS as string[]).includes(r.method)) out.paymentMethod = r.method as PaymentMethod;
  if (typeof r.note === "string" && r.note.trim()) out.note = r.note.trim().slice(0, 200);
  if (warnings.length) out.warning = warnings.join(" - ");
  return out;
}

export function isLedgerCurrency(value: string): value is LedgerCurrency {
  return (LEDGER_CURRENCIES as string[]).includes(value);
}
