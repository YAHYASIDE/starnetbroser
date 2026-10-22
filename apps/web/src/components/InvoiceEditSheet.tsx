"use client";

import { FormEvent, useMemo, useState } from "react";
import { DateInput } from "./DateInput";
import { formatAmount } from "@/lib/formatAmount";
import { invoiceTotal, type Invoice } from "@/lib/invoiceStore";
import type { InvoiceEditInput } from "@/lib/invoiceEdit";
import { loadStoreItems } from "@/lib/storeStore";
import type { SaleUnit } from "@/lib/invoiceStore";
import { isStarlinkItem, resizeUnits } from "@/lib/saleDevices";

const unitId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `unit-${Date.now()}-${Math.random()}`);

/**
 * ✎ A store invoice edited from a customer's statement (lib/invoiceEdit.ts): each line's quantity and
 * price and shipping, the discount, what was paid, the date, the note and (from the store's list) the
 * customer / supplier - and 🗑 delete. A return can only be
 * deleted; an invoice with a return is locked (`lock` says why).
 */
export function InvoiceEditSheet({
  invoice,
  currencyLabel,
  lock,
  onSave,
  onDelete,
  onCancel,
  parties,
}: {
  /** The store's list (his Oct 22 2026 «كل شيء»): the customer (sale) / supplier (purchase) can change. */
  parties?: { id: string; name: string }[];
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
  const isSale = invoice.kind === "sale";
  const [lines, setLines] = useState(
    invoice.lines.map((l) => ({
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      shipping: l.shippingCharge !== undefined || l.shippingCost !== undefined,
      shippingCost: l.shippingCost !== undefined ? String(l.shippingCost) : "",
      shippingCharge: l.shippingCharge !== undefined ? String(l.shippingCharge) : "",
    })),
  );
  // 📦 a device line's KIT / name per piece - the linked devices follow (lib/saleDevices.ts).
  const deviceLine = (i: number) => isSale && !isReturn && (Boolean(invoice.lines[i]!.units) || isStarlinkItem(items[invoice.lines[i]!.itemId]));
  const [units, setUnits] = useState<SaleUnit[][]>(() => invoice.lines.map((l) => l.units ?? []));
  const unitsFor = (i: number) => resizeUnits(units[i], num(lines[i]!.quantity), unitId);
  function setUnit(i: number, k: number, patch: Partial<SaleUnit>) {
    setUnits((all) => all.map((list, j) => (j === i ? unitsFor(i).map((u, m) => (m === k ? { ...u, ...patch } : u)) : list)));
  }
  const [partyId, setPartyId] = useState((isSale ? invoice.clientId : invoice.supplierId) ?? "");
  const [discount, setDiscount] = useState(invoice.discount ? String(invoice.discount) : "");
  const [paid, setPaid] = useState(invoice.paidAmount ? String(invoice.paidAmount) : "");
  const [note, setNote] = useState(invoice.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const num = (v: string) => Number(v.replace(/,/g, "").trim() || "0");
  const subtotal = lines.reduce((sum, l) => sum + num(l.quantity) * num(l.unitPrice) + (isSale && l.shipping ? num(l.shippingCharge) : 0), 0);
  const total = subtotal - num(discount);
  const remaining = total - num(paid);
  const editable = !lock && !isReturn;

  function save(event: FormEvent) {
    event.preventDefault();
    const message = onSave({
      date,
      lines: lines.map((l, i) => ({
        ...(deviceLine(i) ? { units: unitsFor(i) } : {}),
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        ...(isSale
          ? {
              shipping: l.shipping
                ? { ...(l.shippingCost.trim() ? { cost: num(l.shippingCost) } : {}), ...(l.shippingCharge.trim() ? { charge: num(l.shippingCharge) } : {}) }
                : (false as const),
            }
          : {}),
      })),
      ...(parties ? (isSale ? { clientId: partyId } : { supplierId: partyId }) : {}),
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
            {isSale && (
              <label className="ledger-d-toggle invoice-edit-ship-toggle">
                <input
                  type="checkbox"
                  checked={lines[i]!.shipping}
                  disabled={!editable}
                  onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, shipping: e.target.checked } : l)))}
                />
                🚚 شحن
              </label>
            )}
            {isSale && lines[i]!.shipping && (
              <div className="invoice-edit-pair invoice-edit-ship">
                <label className="form-field">
                  <span>تكلفة الشحن</span>
                  <input
                    className="search-input"
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="0"
                    value={lines[i]!.shippingCost}
                    disabled={!editable}
                    onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, shippingCost: e.target.value } : l)))}
                  />
                </label>
                <label className="form-field">
                  <span>سعره للزبون</span>
                  <input
                    className="search-input"
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="0"
                    value={lines[i]!.shippingCharge}
                    disabled={!editable}
                    onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, shippingCharge: e.target.value } : l)))}
                  />
                </label>
              </div>
            )}
            {deviceLine(i) && unitsFor(i).length > 0 && (
              <div className="invoice-edit-units">
                {unitsFor(i).map((unit, k) => (
                  <div key={unit.id} className="invoice-edit-pair">
                    <label className="form-field">
                      <span>رقم KIT {unitsFor(i).length > 1 ? `(${k + 1})` : ""}</span>
                      <input className="search-input" dir="ltr" value={unit.kit ?? ""} disabled={!editable} placeholder="KIT…" onChange={(e) => setUnit(i, k, { kit: e.target.value })} />
                    </label>
                    <label className="form-field">
                      <span>اسم الجهاز</span>
                      <input className="search-input" value={unit.name ?? ""} disabled={!editable} placeholder="اختياري" onChange={(e) => setUnit(i, k, { name: e.target.value })} />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {parties && (
        <label className="form-field">
          <span>{isSale ? "الزبون" : "المورد"}</span>
          <select className="search-input" value={partyId} disabled={!editable} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">{isSale ? "بدون زبون" : "بدون مورد"}</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
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
