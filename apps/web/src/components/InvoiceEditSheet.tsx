"use client";

import { FormEvent, useMemo, useState } from "react";
import { DateInput } from "./DateInput";
import { formatAmount } from "@/lib/formatAmount";
import { invoiceTotal, type Invoice } from "@/lib/invoiceStore";
import type { InvoiceEditInput } from "@/lib/invoiceEdit";
import { loadStoreItems } from "@/lib/storeStore";

/**
 * ✎ A store invoice edited from a customer's statement (lib/invoiceEdit.ts): each line's quantity and
 * price, the discount, what was paid, the date and the note - and 🗑 delete. A return can only be
 * deleted; an invoice with a return is locked (`lock` says why).
 */
export function InvoiceEditSheet({
  invoice,
  currencyLabel,
  lock,
  onSave,
  onDelete,
  onCancel,
}: {
  invoice: Invoice;
  currencyLabel: string;
  lock: string | null;
  onSave: (input: InvoiceEditInput) => string | null;
  onDelete: () => string | null;
  onCancel: () => void;
}) {
  const items = useMemo(() => loadStoreItems(), []);
  const isReturn = invoice.returnOfInvoiceId !== undefined;
  const [date, setDate] = useState(invoice.date);
  const [lines, setLines] = useState(invoice.lines.map((l) => ({ quantity: String(l.quantity), unitPrice: String(l.unitPrice) })));
  const [discount, setDiscount] = useState(invoice.discount ? String(invoice.discount) : "");
  const [paid, setPaid] = useState(invoice.paidAmount ? String(invoice.paidAmount) : "");
  const [note, setNote] = useState(invoice.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const num = (v: string) => Number(v.replace(/,/g, "").trim() || "0");
  const subtotal = lines.reduce((sum, l) => sum + num(l.quantity) * num(l.unitPrice), 0);
  const total = subtotal - num(discount);
  const remaining = total - num(paid);
  const editable = !lock && !isReturn;

  function save(event: FormEvent) {
    event.preventDefault();
    const message = onSave({
      date,
      lines: lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice) })),
      discount: num(discount),
      paidAmount: num(paid),
      note,
    });
    setError(message);
  }

  function remove() {
    const what = isReturn ? "هذا المرتجع" : "هذه الفاتورة";
    if (!window.confirm(`حذف ${what} نهائيًا؟ يرجع المخزون، ويُحذف ما دخل الكاش منها. لا يمكن التراجع.`)) return;
    setError(onDelete());
  }

  return (
    <form className="auth-form invoice-edit-form" onSubmit={save}>
      {lock && <p className="ledger-form-error">🔒 {lock}</p>}
      {isReturn && <p className="settings-hint">↩ هذا مرتجع - يُحذف فقط (ثم سجّل مرتجعًا جديدًا من المتجر إن لزم).</p>}
      <label className="form-field">
        <span>التاريخ</span>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} disabled={!editable} />
      </label>
      <div className="invoice-edit-lines">
        {invoice.lines.map((line, i) => (
          <div key={line.transactionId} className="invoice-edit-line">
            <strong>{items[line.itemId]?.name ?? "مادة"}</strong>
            <label className="form-field">
              <span>الكمية</span>
              <input
                className="search-input"
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={lines[i]!.quantity}
                disabled={!editable}
                onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)))}
              />
            </label>
            <label className="form-field">
              <span>السعر ({currencyLabel})</span>
              <input
                className="search-input"
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={lines[i]!.unitPrice}
                disabled={!editable}
                onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))}
              />
            </label>
          </div>
        ))}
      </div>
      <div className="invoice-edit-pair">
        <label className="form-field">
          <span>الخصم</span>
          <input className="search-input" type="text" inputMode="decimal" dir="ltr" placeholder="0" value={discount} disabled={!editable} onChange={(e) => setDiscount(e.target.value)} />
        </label>
        <label className="form-field">
          <span>المدفوع</span>
          <input className="search-input" type="text" inputMode="decimal" dir="ltr" placeholder="0" value={paid} disabled={!editable} onChange={(e) => setPaid(e.target.value)} />
        </label>
      </div>
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} disabled={!editable} onChange={(e) => setNote(e.target.value)} />
      <div className="invoice-edit-total">
        <span>
          الإجمالي <bdi dir="ltr">{formatAmount(editable ? total : invoiceTotal(invoice))}</bdi> {currencyLabel}
        </span>
        {editable && (
          <span className={remaining > 0 ? "is-due" : "is-clear"}>
            المتبقي <bdi dir="ltr">{formatAmount(remaining)}</bdi>
          </span>
        )}
      </div>
      {error && <p className="ledger-form-error">{error}</p>}
      <div className="invoice-edit-actions">
        {editable && (
          <button type="submit" className="dialog-primary">
            حفظ التعديل
          </button>
        )}
        {(!lock || isReturn) && (
          <button type="button" className="dialog-danger" onClick={remove}>
            🗑 {isReturn ? "حذف المرتجع" : "حذف الفاتورة"}
          </button>
        )}
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
