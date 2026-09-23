/**
 * Sales and purchase invoices for the store - a higher-level wrapper over storeStore.ts's own
 * buy/sell transaction log. Every invoice line still goes through recordStoreTransaction (the one
 * place stock is ever actually moved/validated), so an invoice can never desync stock from what
 * the item's own transaction history says: creating an invoice is really "create N linked
 * transactions, then remember them together as one invoice" - nothing more.
 *
 * A RETURN is its own invoice (returnOfInvoiceId set) whose lines move stock in the OPPOSITE
 * direction of a normal invoice of the same kind: a sale return puts stock back (buy-direction),
 * a purchase return takes stock back out (sell-direction) - which is also why a purchase return
 * is naturally capped at whatever is still in stock (the existing "can't sell what you don't
 * have" check in recordStoreTransaction applies unchanged).
 */

import {
  computeStock,
  CreateStoreTransactionInput,
  recordStoreTransaction,
  StoreTransactionKind,
  StoreTransactionList,
} from "./storeStore";

export type InvoiceKind = "sale" | "purchase";
export type InvoicePaymentStatus = "paid" | "credit" | "partial";

export interface InvoiceLineInput {
  itemId: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceLine extends InvoiceLineInput {
  /** The storeStore.ts transaction this line created - full traceability from invoice to stock
   * movement and back. */
  transactionId: string;
}

export interface Invoice {
  id: string;
  kind: InvoiceKind;
  date: string;
  /** currencyStore.ts registry code - one currency per invoice, matching every line's own
   * transaction currency. */
  currencyCode: string;
  lines: InvoiceLine[];
  /** Absolute amount off the invoice's subtotal (never a percentage, so it's never ambiguous what
   * base it applies to). */
  discount: number;
  /** How much was actually collected (sale) or paid (purchase) at invoice time - 0 for pure
   * credit, equal to the total for "paid", anything in between for "partial". */
  paidAmount: number;
  /** Sale only. */
  clientId?: string;
  /** Purchase only. */
  supplierId?: string;
  note?: string;
  /** Set only on a return invoice - the id of the original invoice it reverses. */
  returnOfInvoiceId?: string;
  createdAt: string;
}

export type InvoiceList = Invoice[];

const INVOICES_KEY = "starnet_store_invoices_v1";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

export function loadInvoices(): InvoiceList {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INVOICES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InvoiceList) : [];
  } catch {
    return [];
  }
}

export function saveInvoices(invoices: InvoiceList): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
}

// ---- Pure logic below - independent of localStorage, so this is what is actually unit-tested. ----

export function invoiceSubtotal(invoice: Invoice): number {
  return invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

export function invoiceTotal(invoice: Invoice): number {
  return Math.max(0, invoiceSubtotal(invoice) - invoice.discount);
}

export function invoiceBalanceDue(invoice: Invoice): number {
  return invoiceTotal(invoice) - invoice.paidAmount;
}

export function invoicePaymentStatus(invoice: Invoice): InvoicePaymentStatus {
  const due = invoiceBalanceDue(invoice);
  if (due <= 0.0001) return "paid";
  if (invoice.paidAmount <= 0.0001) return "credit";
  return "partial";
}

export interface CreateInvoiceInput {
  kind: InvoiceKind;
  date: string;
  currencyCode: string;
  lines: InvoiceLineInput[];
  discount?: number;
  paidAmount?: number;
  clientId?: string;
  supplierId?: string;
  note?: string;
  /** Only for a return invoice - the original invoice this one reverses. */
  returnOfInvoiceId?: string;
}

export type CreateInvoiceResult =
  | { ok: true; invoices: InvoiceList; transactions: StoreTransactionList; invoice: Invoice }
  | { ok: false; message: string };

/** The only way an invoice is ever created - one recordStoreTransaction call per line (so every
 * existing quantity/price/stock validation still applies unchanged), then the invoice record
 * itself. Any line failing aborts the whole invoice: transactions/invoices are returned unchanged,
 * never a partially-applied invoice. */
export function createInvoice(
  invoices: InvoiceList,
  transactions: StoreTransactionList,
  input: CreateInvoiceInput,
): CreateInvoiceResult {
  if (input.lines.length === 0) {
    return { ok: false, message: "أضف مادة واحدة على الأقل للفاتورة" };
  }

  const isReturn = input.returnOfInvoiceId !== undefined;
  const normalTxnKind: StoreTransactionKind = input.kind === "sale" ? "sell" : "buy";
  const txnKind: StoreTransactionKind = isReturn ? (normalTxnKind === "sell" ? "buy" : "sell") : normalTxnKind;

  const invoiceId = newId("invoice");
  let workingTransactions = transactions;
  const lines: InvoiceLine[] = [];

  for (const line of input.lines) {
    const txnInput: CreateStoreTransactionInput = {
      itemId: line.itemId,
      kind: txnKind,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      currencyCode: input.currencyCode,
      clientId: input.kind === "sale" && !isReturn ? input.clientId : undefined,
      date: input.date,
      invoiceId,
    };
    const result = recordStoreTransaction(workingTransactions, txnInput);
    if (!result.ok) return { ok: false, message: result.message };
    workingTransactions = result.transactions;
    lines.push({ itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice, transactionId: result.transaction.id });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discount = input.discount ?? 0;
  if (!Number.isFinite(discount) || discount < 0) {
    return { ok: false, message: "الخصم يجب أن يكون صفرًا أو أكبر" };
  }
  const total = Math.max(0, subtotal - discount);
  if (discount > subtotal) {
    return { ok: false, message: "الخصم أكبر من إجمالي الفاتورة" };
  }

  const paidAmount = Math.max(0, input.paidAmount ?? 0);
  if (paidAmount > total + 0.0001) {
    return { ok: false, message: "المبلغ المدفوع أكبر من إجمالي الفاتورة" };
  }

  const invoice: Invoice = {
    id: invoiceId,
    kind: input.kind,
    date: input.date,
    currencyCode: input.currencyCode,
    lines,
    discount,
    paidAmount,
    clientId: input.kind === "sale" && !isReturn ? input.clientId : undefined,
    supplierId: input.kind === "purchase" && !isReturn ? input.supplierId : undefined,
    note: input.note?.trim() || undefined,
    returnOfInvoiceId: input.returnOfInvoiceId,
    createdAt: nowIso(),
  };

  return { ok: true, invoices: [...invoices, invoice], transactions: workingTransactions, invoice };
}

export function getInvoice(invoices: InvoiceList, invoiceId: string): Invoice | undefined {
  return invoices.find((inv) => inv.id === invoiceId);
}

/** Every invoice, newest first. */
export function listInvoices(invoices: InvoiceList): InvoiceList {
  return [...invoices].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
}

export function listInvoicesForClient(invoices: InvoiceList, clientId: string): InvoiceList {
  return listInvoices(invoices.filter((inv) => inv.clientId === clientId));
}

export function listInvoicesForSupplier(invoices: InvoiceList, supplierId: string): InvoiceList {
  return listInvoices(invoices.filter((inv) => inv.supplierId === supplierId));
}

/** Every return already recorded against one invoice, newest first - shown on the original
 * invoice so it's obvious some of it was already reversed. */
export function listReturnsForInvoice(invoices: InvoiceList, invoiceId: string): InvoiceList {
  return listInvoices(invoices.filter((inv) => inv.returnOfInvoiceId === invoiceId));
}

/** Total quantity of one item already returned against an invoice - used to cap how much more of
 * that line can still be returned. */
export function returnedQuantityForLine(invoices: InvoiceList, invoiceId: string, itemId: string): number {
  return listReturnsForInvoice(invoices, invoiceId)
    .flatMap((inv) => inv.lines)
    .filter((l) => l.itemId === itemId)
    .reduce((sum, l) => sum + l.quantity, 0);
}

/** Current stock, exposed here too (re-exported thinly from storeStore.ts) so callers building an
 * invoice form don't need a second import just to check sell-line quantities against it. */
export { computeStock };
