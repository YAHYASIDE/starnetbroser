/**
 * ✎ Editing / deleting a store invoice from a customer's statement (his Oct 20 2026 ask «أضف إمكانية
 * تعديل العمليات»): quantities, prices, discount, what was paid, date and note. Derive, don't store: the
 * invoice's stock movements are rebuilt from its new lines (same path as a new invoice, same id), and
 * the cash it brought into الكاش follows its new paid amount. An invoice with a return filed against it
 * is left alone (the return counts its lines) - the return is deleted first.
 */

import { recordCashEntry, type CashEntryList } from "./cashStore";
import { createInvoice, type Invoice, type InvoiceList, type SaleUnit } from "./invoiceStore";
import { resizeUnits } from "./saleDevices";
import type { StoreTransactionList } from "./storeStore";

export interface InvoiceEditInput {
  date: string;
  /** Per line, in the invoice's order. A line's shipping (sale): given = its new cost / charge,
   * `shipping: false` = none any more, absent = kept as it was. */
  lines: { quantity: number; unitPrice: number; shipping?: false | { cost?: number; charge?: number }; units?: SaleUnit[] }[];
  /** Sale: the customer (from the store's invoice list, his Oct 22 2026 «تعديل كل شيء»). Absent = kept. */
  clientId?: string;
  /** Purchase: the supplier. Absent = kept. */
  supplierId?: string;
  discount: number;
  paidAmount: number;
  note?: string;
}

export type InvoiceEditResult =
  | { ok: true; invoices: InvoiceList; transactions: StoreTransactionList; cash: CashEntryList; invoice?: Invoice }
  | { ok: false; message: string };

/** Why this invoice can't be changed here, or null. */
export function invoiceLockReason(invoices: InvoiceList, invoiceId: string): string | null {
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) return "الفاتورة غير موجودة";
  if (invoices.some((i) => i.returnOfInvoiceId === invoiceId)) return "عليها مرتجع - احذف المرتجع أولًا من المتجر";
  return null;
}

/** The cash an invoice brought (or paid): exactly its paid amount, on its date. */
export function syncInvoiceCash(cash: CashEntryList, invoice: Invoice | undefined, invoiceId: string): CashEntryList {
  const old = cash.find((e) => e.invoiceId === invoiceId);
  const rest = cash.filter((e) => e.invoiceId !== invoiceId);
  if (!invoice || invoice.returnOfInvoiceId !== undefined || !(invoice.paidAmount > 0)) return rest;
  const result = recordCashEntry(rest, {
    kind: invoice.kind === "sale" ? "in" : "out",
    amount: invoice.paidAmount,
    currencyCode: invoice.currencyCode,
    date: invoice.date,
    category: old?.category ?? (invoice.kind === "sale" ? "فاتورة بيع" : "فاتورة شراء"),
    ...(old?.note ? { note: old.note } : {}),
    invoiceId,
  });
  return result.ok ? result.entries : rest;
}

export function updateInvoice(
  invoices: InvoiceList,
  transactions: StoreTransactionList,
  cash: CashEntryList,
  invoiceId: string,
  input: InvoiceEditInput,
): InvoiceEditResult {
  const lock = invoiceLockReason(invoices, invoiceId);
  if (lock) return { ok: false, message: lock };
  const original = invoices.find((i) => i.id === invoiceId)!;
  if (input.lines.length !== original.lines.length) return { ok: false, message: "عدد المواد تغيّر - أعد فتح الفاتورة" };
  if (!input.date) return { ok: false, message: "أدخل التاريخ" };
  if (!Number.isFinite(input.paidAmount) || input.paidAmount < 0) return { ok: false, message: "المدفوع يجب أن يكون صفرًا أو أكبر" };
  const without = invoices.filter((i) => i.id !== invoiceId);
  const freed = transactions.filter((t) => t.invoiceId !== invoiceId);
  const created = createInvoice(
    without,
    freed,
    {
      kind: original.kind,
      date: input.date,
      currencyCode: original.currencyCode,
      lines: original.lines.map((l, i) => {
        const edit = input.lines[i]!;
        const shipping = edit.shipping === undefined ? { cost: l.shippingCost, charge: l.shippingCharge } : edit.shipping === false ? {} : edit.shipping;
        return {
          itemId: l.itemId,
          quantity: edit.quantity,
          unitPrice: edit.unitPrice,
          ...(shipping.cost !== undefined ? { shippingCost: shipping.cost } : {}),
          ...(shipping.charge !== undefined ? { shippingCharge: shipping.charge } : {}),
          ...(l.repUnitPrice !== undefined ? { repUnitPrice: l.repUnitPrice } : {}),
          // 📦 its devices (KIT / name per piece): as edited, else kept and fitted to the new quantity.
          ...(edit.units || l.units ? { units: edit.units ?? resizeUnits(l.units, edit.quantity, () => `${invoiceId}-u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`) } : {}),
        };
      }),
      discount: input.discount,
      paidAmount: input.paidAmount,
      clientId: "clientId" in input ? input.clientId || undefined : original.clientId,
      supplierId: "supplierId" in input ? input.supplierId || undefined : original.supplierId,
      representativeId: original.representativeId,
      representativeCommissionPercent: original.representativeCommissionPercent,
      note: input.note,
      returnOfInvoiceId: original.returnOfInvoiceId,
    },
    { id: original.id, createdAt: original.createdAt },
  );
  if (!created.ok) return created;
  // Same place in the list as before.
  const ordered = invoices.map((i) => (i.id === invoiceId ? created.invoice : i));
  return { ok: true, invoices: ordered, transactions: created.transactions, cash: syncInvoiceCash(cash, created.invoice, invoiceId), invoice: created.invoice };
}

/** 🗑 The invoice, its stock movements and its cash go together. */
export function deleteInvoice(invoices: InvoiceList, transactions: StoreTransactionList, cash: CashEntryList, invoiceId: string): InvoiceEditResult {
  const lock = invoiceLockReason(invoices, invoiceId);
  if (lock) return { ok: false, message: lock };
  return {
    ok: true,
    invoices: invoices.filter((i) => i.id !== invoiceId),
    transactions: transactions.filter((t) => t.invoiceId !== invoiceId),
    cash: syncInvoiceCash(cash, undefined, invoiceId),
  };
}
