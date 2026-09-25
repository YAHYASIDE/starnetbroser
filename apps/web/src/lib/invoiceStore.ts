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
  /** Sale only. What shipping this line actually cost us - entered directly per line/invoice
   * (never averaged like an item's own purchase cost), since the shipping price varies shipment
   * to shipment. Stripped to undefined on a purchase invoice, see createInvoice. */
  shippingCost?: number;
  /** Sale only. What we charged the customer to ship this line - added on top of quantity*
   * unitPrice into the invoice's own subtotal/total (see invoiceSubtotal), so payment status and
   * the WhatsApp message always reflect one single "amount owed" figure. */
  shippingCharge?: number;
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
  /** Sale only - the sales representative (repStore.ts) credited with this sale, if any. */
  representativeId?: string;
  /** Sale only, set only alongside representativeId - a LOCKED snapshot of that representative's
   * own commissionPercent at the moment this invoice was created, so changing their rate later
   * never rewrites already-accrued commission (same reasoning as ledgerStore.ts's own locked
   * currency rates). */
  representativeCommissionPercent?: number;
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
  return invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice + (l.shippingCharge ?? 0), 0);
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
  /** Sale only - see Invoice.representativeId. */
  representativeId?: string;
  /** Sale only, required alongside representativeId - the representative's commission percent to
   * lock onto this invoice (the caller reads it from the current Representative record). */
  representativeCommissionPercent?: number;
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
    const shippingCost = input.kind === "sale" ? line.shippingCost : undefined;
    const shippingCharge = input.kind === "sale" ? line.shippingCharge : undefined;
    if (shippingCost !== undefined && (!Number.isFinite(shippingCost) || shippingCost < 0)) {
      return { ok: false, message: "تكلفة الشحن يجب أن تكون صفرًا أو أكبر" };
    }
    if (shippingCharge !== undefined && (!Number.isFinite(shippingCharge) || shippingCharge < 0)) {
      return { ok: false, message: "سعر الشحن يجب أن يكون صفرًا أو أكبر" };
    }

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
    lines.push({
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      shippingCost,
      shippingCharge,
      transactionId: result.transaction.id,
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const discount = input.discount ?? 0;
  if (!Number.isFinite(discount) || discount < 0) {
    return { ok: false, message: "الخصم يجب أن يكون صفرًا أو أكبر" };
  }
  if (discount > subtotal) {
    return { ok: false, message: "الخصم أكبر من إجمالي الفاتورة" };
  }

  // A paidAmount above the total is a real, legitimate case (the customer prepaid more than this
  // invoice's own value) - never rejected. It just makes invoiceBalanceDue negative, which
  // computeClientStoreBalance already reports as a "له" credit owed back to them (see
  // AccountsSection.tsx), exactly like an ordinary underpayment reports as a debt owed by them.
  const paidAmount = Math.max(0, input.paidAmount ?? 0);

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
    representativeId: input.kind === "sale" && !isReturn ? input.representativeId : undefined,
    representativeCommissionPercent:
      input.kind === "sale" && !isReturn && input.representativeId ? input.representativeCommissionPercent : undefined,
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

/** How much a client currently owes from store sales, grouped by currency (positive = they owe
 * us) - every one of their own (non-return) sale invoices' still-unpaid balance, minus the full
 * value of any return filed against one of those invoices (a return forgives that much debt
 * outright; this app doesn't model a separate cash refund for it, so the return's own paidAmount
 * is deliberately never read here). Never mixes currencies - a MRU invoice and a USD invoice for
 * the same client are two separate figures, exactly like ledgerStore.ts's own per-currency
 * balances. Entirely separate from ledgerStore.ts's own per-device Starlink balance too - a
 * different business (retail goods, not the subscription service). */
export function computeClientStoreBalance(invoices: InvoiceList, clientId: string): Record<string, number> {
  const own = invoices.filter((inv) => inv.kind === "sale" && !inv.returnOfInvoiceId && inv.clientId === clientId);
  const balance: Record<string, number> = {};
  for (const inv of own) {
    balance[inv.currencyCode] = (balance[inv.currencyCode] ?? 0) + invoiceBalanceDue(inv);
    for (const ret of listReturnsForInvoice(invoices, inv.id)) {
      balance[ret.currencyCode] = (balance[ret.currencyCode] ?? 0) - invoiceTotal(ret);
    }
  }
  return balance;
}

/** The mirror of computeClientStoreBalance for a supplier - how much WE still owe them (positive
 * = we owe them), grouped by currency, from purchase invoices minus anything returned to them. */
export function computeSupplierStoreBalance(invoices: InvoiceList, supplierId: string): Record<string, number> {
  const own = invoices.filter((inv) => inv.kind === "purchase" && !inv.returnOfInvoiceId && inv.supplierId === supplierId);
  const balance: Record<string, number> = {};
  for (const inv of own) {
    balance[inv.currencyCode] = (balance[inv.currencyCode] ?? 0) + invoiceBalanceDue(inv);
    for (const ret of listReturnsForInvoice(invoices, inv.id)) {
      balance[ret.currencyCode] = (balance[ret.currencyCode] ?? 0) - invoiceTotal(ret);
    }
  }
  return balance;
}

export interface PartyStoreTotals {
  /** Sum of every own (non-return) invoice's total. */
  total: number;
  /** Sum of what was actually paid on those invoices. */
  paid: number;
  /** Full value of every return filed against those invoices. */
  returned: number;
  /** total - paid - returned: same figure computeClientStoreBalance/computeSupplierStoreBalance
   * report (positive = still unpaid, negative = overpaid). */
  remaining: number;
}

function ownPartyInvoices(invoices: InvoiceList, kind: InvoiceKind, partyId: string): InvoiceList {
  return invoices.filter(
    (inv) =>
      inv.kind === kind &&
      !inv.returnOfInvoiceId &&
      (kind === "sale" ? inv.clientId === partyId : inv.supplierId === partyId),
  );
}

/** Per-currency invoiced/paid/returned/remaining breakdown for one client ("sale") or supplier
 * ("purchase") - never mixes currencies, same rule as every balance in this app. */
export function computePartyStoreTotals(
  invoices: InvoiceList,
  kind: InvoiceKind,
  partyId: string,
): Record<string, PartyStoreTotals> {
  const result: Record<string, PartyStoreTotals> = {};
  const bucket = (currency: string) => (result[currency] ??= { total: 0, paid: 0, returned: 0, remaining: 0 });
  for (const inv of ownPartyInvoices(invoices, kind, partyId)) {
    const own = bucket(inv.currencyCode);
    own.total += invoiceTotal(inv);
    own.paid += inv.paidAmount;
    for (const ret of listReturnsForInvoice(invoices, inv.id)) {
      bucket(ret.currencyCode).returned += invoiceTotal(ret);
    }
  }
  for (const totals of Object.values(result)) {
    totals.remaining = totals.total - totals.paid - totals.returned;
  }
  return result;
}

export interface PartyStatementRow {
  invoice: Invoice;
  isReturn: boolean;
  amount: number;
  paid: number;
  /** Running balance in this row's own currency after this row, oldest-first order. */
  balanceAfter: number;
}

/** كشف الحساب: every own invoice plus every return filed against one of them, with a running
 * per-currency balance computed oldest-first. Returned newest-first for display. */
export function buildPartyStatement(invoices: InvoiceList, kind: InvoiceKind, partyId: string): PartyStatementRow[] {
  const own = ownPartyInvoices(invoices, kind, partyId);
  const ownIds = new Set(own.map((inv) => inv.id));
  const returns = invoices.filter((inv) => inv.returnOfInvoiceId !== undefined && ownIds.has(inv.returnOfInvoiceId));
  const chronological = [...own, ...returns].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
  const running: Record<string, number> = {};
  const rows = chronological.map((invoice) => {
    const isReturn = invoice.returnOfInvoiceId !== undefined;
    const amount = invoiceTotal(invoice);
    const paid = isReturn ? 0 : invoice.paidAmount;
    running[invoice.currencyCode] = (running[invoice.currencyCode] ?? 0) + (isReturn ? -amount : amount - paid);
    return { invoice, isReturn, amount, paid, balanceAfter: running[invoice.currencyCode] };
  });
  return rows.reverse();
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
