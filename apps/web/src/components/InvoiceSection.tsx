"use client";

import { FormEvent, useMemo, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { PartyAdjustment } from "@/lib/partyBalanceStore";
import { Client, ClientStore, CreateClientInput, getClient } from "@/lib/clientStore";
import { CreateSupplierInput, getSupplier, Supplier, SupplierStore } from "@/lib/supplierStore";
import { CreateRepresentativeInput, getRepresentative, Representative, RepresentativeStore, repFromClientDevice } from "@/lib/repStore";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import { listStoreItems, StoreItemRegistry, StoreTransactionList } from "@/lib/storeStore";
import {
  computeClientStoreBalance,
  createInvoice,
  Invoice,
  invoicePaymentStatus,
  invoiceTotal,
  InvoiceKind,
  InvoiceList,
  listInvoices,
  returnedQuantityForLine,
} from "@/lib/invoiceStore";
import { buildInvoiceMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { PdfButton } from "./PdfButton";
import { ltr, PrintableDocument } from "@/lib/pdfDocument";
import { formatAmount } from "@/lib/formatAmount";
import { getDefaultInvoiceCurrency } from "@/lib/settingsStore";
import { ClientPicker } from "./ClientPicker";
import { SupplierPicker } from "./SupplierPicker";
import { RepresentativePicker } from "./RepresentativePicker";

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

/** getDefaultInvoiceCurrency() is never validated against LEDGER_CURRENCIES on write (see its own
 * doc comment) - an unrecognized/stale saved value falls back to "MRU" here, same as never having
 * set one, rather than putting an invalid value into this form's own typed state. */
function defaultInvoiceCurrency(): LedgerCurrency {
  const saved = getDefaultInvoiceCurrency();
  return (LEDGER_CURRENCIES as string[]).includes(saved) ? (saved as LedgerCurrency) : "MRU";
}

interface DraftLine {
  itemId: string;
  quantity: string;
  unitPrice: string;
  /** Sale only - whether this line's shipping cost/charge inputs are shown at all (most lines
   * have no shipping, so they stay collapsed until toggled on). */
  shipping?: boolean;
  shippingCost?: string;
  shippingCharge?: string;
  /** Set only in return mode - caps how much of this line can still be returned. */
  maxReturnable?: number;
}

interface Props {
  items: StoreItemRegistry;
  transactions: StoreTransactionList;
  invoices: InvoiceList;
  clients: Client[];
  clientStore: ClientStore;
  suppliers: Supplier[];
  supplierStore: SupplierStore;
  representatives: Representative[];
  representativeStore: RepresentativeStore;
  accounts: StarlinkAccountSummary[];
  /** Manual balance entries - counted in the credit-limit warning's existing-balance figure. */
  partyAdjustments?: PartyAdjustment[];
  onCreateClient: (input: CreateClientInput) => Client;
  onCreateSupplier: (input: CreateSupplierInput) => Supplier;
  onCreateRepresentative: (input: CreateRepresentativeInput) => Representative;
  onChange: (result: { invoices: InvoiceList; transactions: StoreTransactionList; invoice: Invoice }) => void;
}

/** بطاقة المنتج والفواتير's own "الفواتير" half - sale/purchase invoices built on top of
 * storeStore.ts's buy/sell log (see invoiceStore.ts), supporting cash/credit/partial payment,
 * an invoice-level discount, returns, and sending a sale invoice to the customer over WhatsApp. */
export function InvoiceSection({
  items,
  transactions,
  invoices,
  clients,
  clientStore,
  suppliers,
  supplierStore,
  representatives,
  representativeStore,
  accounts,
  partyAdjustments = [],
  onCreateClient,
  onCreateSupplier,
  onCreateRepresentative,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [returningInvoice, setReturningInvoice] = useState<Invoice | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  const itemList = useMemo(() => listStoreItems(items), [items]);
  const sortedInvoices = useMemo(() => listInvoices(invoices), [invoices]);

  function openNewForm() {
    setReturningInvoice(null);
    setShowForm(true);
  }

  function openReturnForm(invoice: Invoice) {
    setShowForm(false);
    setReturningInvoice(invoice);
  }

  function closeForms() {
    setShowForm(false);
    setReturningInvoice(null);
  }

  function submit(result: { invoices: InvoiceList; transactions: StoreTransactionList; invoice: Invoice }) {
    onChange(result);
    closeForms();
  }

  return (
    <section className="section">
      <button
        type="button"
        className="report-collapse-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        الفواتير {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <>
          <div className="store-items-header">
            <span />
            <button type="button" className="btn-icon" onClick={() => (showForm ? closeForms() : openNewForm())}>
              {showForm ? "إلغاء" : "+ فاتورة جديدة"}
            </button>
          </div>

          {showForm && (
            <InvoiceForm
              items={itemList}
              invoices={invoices}
              clients={clients}
              suppliers={suppliers}
              representatives={representatives}
              accounts={accounts}
              partyAdjustments={partyAdjustments}
              onCreateClient={onCreateClient}
              onCreateSupplier={onCreateSupplier}
              onCreateRepresentative={onCreateRepresentative}
              onCancel={closeForms}
              onSubmit={(input) => {
                const result = createInvoice(invoices, transactions, input);
                if (result.ok) submit({ invoices: result.invoices, transactions: result.transactions, invoice: result.invoice });
                return result;
              }}
            />
          )}

          {returningInvoice && (
            <ReturnForm
              original={returningInvoice}
              items={items}
              invoices={invoices}
              onCancel={closeForms}
              onSubmit={(input) => {
                const result = createInvoice(invoices, transactions, input);
                if (result.ok) submit({ invoices: result.invoices, transactions: result.transactions, invoice: result.invoice });
                return result;
              }}
            />
          )}

          {sortedInvoices.length === 0 && !showForm && !returningInvoice && (
            <p className="empty-state">لا توجد فواتير بعد.</p>
          )}

          <ul className="ledger-entry-list">
            {sortedInvoices.map((invoice) => {
              const isOpen = expandedInvoiceId === invoice.id;
              const total = invoiceTotal(invoice);
              const status = invoicePaymentStatus(invoice);
              const client = getClient(clientStore, invoice.clientId);
              const supplier = getSupplier(supplierStore, invoice.supplierId);
              const representative = getRepresentative(representativeStore, invoice.representativeId);
              const counterpartyName = client?.name ?? supplier?.name;
              const kindLabel = invoice.kind === "sale" ? "بيع" : "شراء";
              const waLink = client?.phone
                ? buildWhatsAppLink(client.phone, buildInvoiceMessage(invoice, items, client.name))
                : null;

              return (
                <li key={invoice.id} className="ledger-entry-row">
                  <div className="ledger-entry-row-top">
                    <span className={`badge ${invoice.kind === "sale" ? "badge-green" : "badge-yellow"}`}>
                      {invoice.returnOfInvoiceId ? `مرتجع ${kindLabel}` : kindLabel}
                    </span>
                    <span className="ledger-entry-amount" dir="ltr">
                      {formatAmount(total)} {currencyLabel(invoice.currencyCode)}
                    </span>
                    <span className="ledger-entry-date" dir="ltr">
                      {invoice.date}
                    </span>
                    <button type="button" className="text-action" onClick={() => setExpandedInvoiceId(isOpen ? null : invoice.id)}>
                      {isOpen ? "إخفاء" : "التفاصيل"}
                    </button>
                  </div>
                  <div className="ledger-entry-row-bottom">
                    {counterpartyName && <span className="ledger-entry-method">{counterpartyName}</span>}
                    {representative && <span className="ledger-entry-method">🤝 {representative.name}</span>}
                    <span
                      className={`badge ${status === "paid" ? "badge-green" : status === "partial" ? "badge-yellow" : "badge-red"}`}
                    >
                      {status === "paid" ? "مدفوعة" : status === "partial" ? "جزئيًا" : "دين"}
                    </span>
                    {!invoice.returnOfInvoiceId && (
                      <button type="button" className="text-action" onClick={() => openReturnForm(invoice)}>
                        إرجاع
                      </button>
                    )}
                    {invoice.kind === "sale" && waLink && (
                      <a className="text-action" href={waLink} target="_blank" rel="noreferrer">
                        إرسال عبر واتساب
                      </a>
                    )}
                    <PdfButton
                      className="text-action"
                      label="🖨️ PDF"
                      build={() => buildInvoicePdf(invoice, items, counterpartyName, client?.phone ?? supplier?.phone, representative?.name)}
                    />
                  </div>
                  {isOpen && (
                    <ul className="report-line-list">
                      {invoice.lines.map((line, i) => {
                        const item = items[line.itemId];
                        return (
                          <li key={i} className="report-line">
                            <span>{item?.name ?? "مادة محذوفة"}</span>
                            <strong dir="ltr">
                              {formatAmount(line.quantity)} {item?.unit ?? ""} × {formatAmount(line.unitPrice)}{" "}
                              {currencyLabel(invoice.currencyCode)}
                            </strong>
                          </li>
                        );
                      })}
                      {invoice.lines.map(
                        (line, i) =>
                          line.shippingCharge !== undefined && (
                            <li key={`ship-${i}`} className="report-line">
                              <span>🚚 شحن {items[line.itemId]?.name ?? ""}</span>
                              <strong dir="ltr">
                                {formatAmount(line.shippingCharge)} {currencyLabel(invoice.currencyCode)}
                                {line.shippingCost !== undefined &&
                                  ` (التكلفة: ${formatAmount(line.shippingCost)} ${currencyLabel(invoice.currencyCode)})`}
                              </strong>
                            </li>
                          ),
                      )}
                      {invoice.discount > 0 && (
                        <li className="report-line">
                          <span>الخصم</span>
                          <strong dir="ltr">
                            -{formatAmount(invoice.discount)} {currencyLabel(invoice.currencyCode)}
                          </strong>
                        </li>
                      )}
                      {invoice.note && (
                        <li className="report-line">
                          <span>ملاحظة</span>
                          <strong>{invoice.note}</strong>
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

interface InvoiceFormProps {
  items: ReturnType<typeof listStoreItems>;
  invoices: InvoiceList;
  clients: Client[];
  suppliers: Supplier[];
  representatives: Representative[];
  accounts: StarlinkAccountSummary[];
  partyAdjustments: PartyAdjustment[];
  onCreateClient: (input: CreateClientInput) => Client;
  onCreateSupplier: (input: CreateSupplierInput) => Supplier;
  onCreateRepresentative: (input: CreateRepresentativeInput) => Representative;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof createInvoice>[2]) => ReturnType<typeof createInvoice>;
}

function InvoiceForm({
  items,
  invoices,
  clients,
  suppliers,
  representatives,
  accounts,
  partyAdjustments,
  onCreateClient,
  onCreateSupplier,
  onCreateRepresentative,
  onCancel,
  onSubmit,
}: InvoiceFormProps) {
  const [kind, setKind] = useState<InvoiceKind>("sale");
  const [priceTier, setPriceTier] = useState<"retail" | "wholesale">("retail");
  const [date, setDate] = useState(todayDateInputValue());
  const [currencyCode, setCurrencyCode] = useState<LedgerCurrency>(defaultInvoiceCurrency);
  const [lines, setLines] = useState<DraftLine[]>([{ itemId: "", quantity: "", unitPrice: "" }]);
  const [discount, setDiscount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [note, setNote] = useState("");
  const [linkClient, setLinkClient] = useState(false);
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [linkSupplier, setLinkSupplier] = useState(false);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [linkRepresentative, setLinkRepresentative] = useState(false);
  const [representativeId, setRepresentativeId] = useState<string | undefined>(undefined);
  // Tracks whether the CURRENT representativeId came from repFromClientDevice (the selected
  // client's own linked device) rather than a direct operator pick in RepresentativePicker -
  // undefined means "no auto-fill in effect", so a manual pick is never silently overwritten by a
  // later client change, and an auto-filled value IS refreshed/cleared when the client changes
  // again (see handleClientSelect below).
  const [repAutoFilledForClientId, setRepAutoFilledForClientId] = useState<string | undefined>(undefined);

  function handleClientSelect(nextClientId: string | undefined) {
    setClientId(nextClientId);
    if (kind !== "sale") return;
    if (representativeId !== undefined && repAutoFilledForClientId === undefined) return; // manual pick - never override
    const autoRepId = repFromClientDevice(accounts, nextClientId);
    if (autoRepId) {
      setLinkRepresentative(true);
      setRepresentativeId(autoRepId);
      setRepAutoFilledForClientId(nextClientId);
    } else if (repAutoFilledForClientId !== undefined) {
      setRepresentativeId(undefined);
      setRepAutoFilledForClientId(undefined);
    }
  }

  function handleRepresentativeSelect(nextRepresentativeId: string | undefined) {
    setRepresentativeId(nextRepresentativeId);
    setRepAutoFilledForClientId(undefined); // any direct picker interaction counts as a manual pick
  }

  const [formError, setFormError] = useState<string | null>(null);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function selectItemForLine(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    const defaultPrice =
      kind === "sale"
        ? (priceTier === "wholesale" ? item?.defaultWholesalePrice : undefined) ?? item?.defaultSalePrice
        : item?.defaultPurchasePrice;
    updateLine(index, { itemId, unitPrice: defaultPrice !== undefined ? String(defaultPrice) : "" });
  }

  function addLine() {
    setLines((current) => [...current, { itemId: "", quantity: "", unitPrice: "" }]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  const subtotal = lines.reduce(
    (sum, l) =>
      sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) + (kind === "sale" && l.shipping ? Number(l.shippingCharge) || 0 : 0),
    0,
  );
  const parsedDiscount = Number(discount) || 0;
  const total = Math.max(0, subtotal - parsedDiscount);

  // Warns (never blocks) when a credit sale would push this client's own store balance, in THIS
  // invoice's own currency only (never summed/converted across currencies, same rule as every
  // other balance in this app), past their optional Client.creditLimit.
  const selectedClient = kind === "sale" && linkClient ? clients.find((c) => c.id === clientId) : undefined;
  const creditLimitWarning = useMemo(() => {
    if (!selectedClient?.creditLimit) return null;
    const existingBalance = computeClientStoreBalance(invoices, selectedClient.id, partyAdjustments)[currencyCode] ?? 0;
    const thisInvoiceUnpaid = Math.max(0, total - (Number(paidAmount) || 0));
    const projected = existingBalance + thisInvoiceUnpaid;
    if (projected <= selectedClient.creditLimit) return null;
    return { projected, limit: selectedClient.creditLimit };
  }, [selectedClient, invoices, partyAdjustments, currencyCode, total, paidAmount]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setFormError("أضف مادة واحدة على الأقل بكمية صحيحة");
      return;
    }
    const result = onSubmit({
      kind,
      date,
      currencyCode,
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        shippingCost: kind === "sale" && l.shipping && l.shippingCost ? Number(l.shippingCost) : undefined,
        shippingCharge: kind === "sale" && l.shipping && l.shippingCharge ? Number(l.shippingCharge) : undefined,
      })),
      discount: parsedDiscount,
      paidAmount: Number(paidAmount) || 0,
      clientId: kind === "sale" && linkClient ? clientId : undefined,
      supplierId: kind === "purchase" && linkSupplier ? supplierId : undefined,
      representativeId: kind === "sale" && linkRepresentative ? representativeId : undefined,
      representativeCommissionPercent:
        kind === "sale" && linkRepresentative && representativeId
          ? representatives.find((r) => r.id === representativeId)?.commissionPercent
          : undefined,
      note,
    });
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setFormError(null);
  }

  return (
    <form className="auth-form store-item-form" onSubmit={submit}>
      <div className="store-item-form-row">
        <select
          className="search-input"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as InvoiceKind);
            setLinkClient(false);
            setLinkSupplier(false);
          }}
        >
          <option value="sale">فاتورة بيع</option>
          <option value="purchase">فاتورة شراء</option>
        </select>
        <input className="search-input" type="date" lang="en-GB" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <select className="search-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value as LedgerCurrency)}>
        {LEDGER_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {LEDGER_CURRENCY_LABELS[c]}
          </option>
        ))}
      </select>

      {kind === "sale" && (
        <select
          className="search-input"
          value={priceTier}
          onChange={(e) => setPriceTier(e.target.value as "retail" | "wholesale")}
        >
          <option value="retail">سعر التجزئة</option>
          <option value="wholesale">سعر الجملة</option>
        </select>
      )}

      {lines.map((line, index) => (
        <div key={index} className="invoice-line-group">
          <div className="invoice-line-row">
            <select className="search-input" value={line.itemId} onChange={(e) => selectItemForLine(index, e.target.value)}>
              <option value="">اختر مادة</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              className="search-input"
              type="number" lang="en"
              min="0"
              step="0.01"
              dir="ltr"
              placeholder="الكمية"
              value={line.quantity}
              onChange={(e) => updateLine(index, { quantity: e.target.value })}
            />
            <input
              className="search-input"
              type="number" lang="en"
              min="0"
              step="0.01"
              dir="ltr"
              placeholder="السعر"
              value={line.unitPrice}
              onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
            />
            {lines.length > 1 && (
              <button type="button" className="ledger-entry-delete" onClick={() => removeLine(index)} aria-label="حذف السطر">
                ×
              </button>
            )}
          </div>
          {kind === "sale" && (
            <label className="ledger-d-toggle invoice-line-shipping-toggle">
              <input
                type="checkbox"
                checked={line.shipping ?? false}
                onChange={(e) =>
                  updateLine(index, e.target.checked ? { shipping: true } : { shipping: false, shippingCost: "", shippingCharge: "" })
                }
              />
              🚚 شحن هذه المادة
            </label>
          )}
          {kind === "sale" && line.shipping && (
            <div className="invoice-line-row">
              <input
                className="search-input"
                type="number" lang="en"
                min="0"
                step="0.01"
                dir="ltr"
                placeholder="تكلفة الشحن الفعلية"
                value={line.shippingCost ?? ""}
                onChange={(e) => updateLine(index, { shippingCost: e.target.value })}
              />
              <input
                className="search-input"
                type="number" lang="en"
                min="0"
                step="0.01"
                dir="ltr"
                placeholder="سعر الشحن للزبون"
                value={line.shippingCharge ?? ""}
                onChange={(e) => updateLine(index, { shippingCharge: e.target.value })}
              />
            </div>
          )}
        </div>
      ))}
      <button type="button" className="text-action" onClick={addLine}>
        + إضافة سطر
      </button>

      <div className="store-item-form-row">
        <input
          className="search-input"
          type="number" lang="en"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="الخصم (اختياري)"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
        <input
          className="search-input"
          type="number" lang="en"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="المبلغ المدفوع الآن"
          value={paidAmount}
          onChange={(e) => setPaidAmount(e.target.value)}
        />
      </div>

      {kind === "sale" && (
        <div className="form-field form-wide">
          <label className="ledger-d-toggle">
            <input type="checkbox" checked={linkClient} onChange={(e) => setLinkClient(e.target.checked)} />
            ربط الفاتورة بزبون
          </label>
          {linkClient && (
            <ClientPicker clients={clients} selectedClientId={clientId} onSelect={handleClientSelect} onCreateClient={onCreateClient} />
          )}
          {creditLimitWarning && (
            <div className="account-card-alert ledger-form-error">
              ⚠️ سيتجاوز دين هذا الزبون سقفه المحدد ({formatAmount(creditLimitWarning.limit)} {currencyLabel(currencyCode)}) - الدين
              المتوقع بعد هذه الفاتورة: {formatAmount(creditLimitWarning.projected)} {currencyLabel(currencyCode)}
            </div>
          )}
        </div>
      )}
      {kind === "sale" && (
        <div className="form-field form-wide">
          <label className="ledger-d-toggle">
            <input
              type="checkbox"
              checked={linkRepresentative}
              onChange={(e) => setLinkRepresentative(e.target.checked)}
            />
            ربط الفاتورة بمندوب
          </label>
          {linkRepresentative && (
            <RepresentativePicker
              representatives={representatives}
              selectedRepresentativeId={representativeId}
              onSelect={handleRepresentativeSelect}
              onCreateRepresentative={onCreateRepresentative}
            />
          )}
        </div>
      )}
      {kind === "purchase" && (
        <div className="form-field form-wide">
          <label className="ledger-d-toggle">
            <input type="checkbox" checked={linkSupplier} onChange={(e) => setLinkSupplier(e.target.checked)} />
            ربط الفاتورة بمورّد
          </label>
          {linkSupplier && (
            <SupplierPicker
              suppliers={suppliers}
              selectedSupplierId={supplierId}
              onSelect={setSupplierId}
              onCreateSupplier={onCreateSupplier}
            />
          )}
        </div>
      )}

      <input
        className="search-input ledger-note-input"
        type="text"
        placeholder="ملاحظة (اختياري)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="settings-hint" dir="ltr">
        الإجمالي: {formatAmount(total)} {currencyLabel(currencyCode)}
        {paidAmount &&
          (() => {
            const remaining = total - (Number(paidAmount) || 0);
            return remaining >= 0
              ? ` - المتبقي عليه: ${formatAmount(remaining)} ${currencyLabel(currencyCode)}`
              : ` - الباقي له: ${formatAmount(-remaining)} ${currencyLabel(currencyCode)}`;
          })()}
      </div>

      {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit">
          حفظ الفاتورة
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

interface ReturnFormProps {
  original: Invoice;
  items: StoreItemRegistry;
  invoices: InvoiceList;
  onCancel: () => void;
  onSubmit: (input: Parameters<typeof createInvoice>[2]) => ReturnType<typeof createInvoice>;
}

function ReturnForm({ original, items, invoices, onCancel, onSubmit }: ReturnFormProps) {
  const initialLines: DraftLine[] = original.lines.map((l) => {
    const alreadyReturned = returnedQuantityForLine(invoices, original.id, l.itemId);
    const remaining = Math.max(0, l.quantity - alreadyReturned);
    return { itemId: l.itemId, quantity: "", unitPrice: String(l.unitPrice), maxReturnable: remaining };
  });
  const [lines, setLines] = useState<DraftLine[]>(initialLines);
  const [date, setDate] = useState(todayDateInputValue());
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function updateQuantity(index: number, quantity: string) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, quantity } : line)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    for (const line of lines) {
      const qty = Number(line.quantity);
      if (qty > 0 && line.maxReturnable !== undefined && qty > line.maxReturnable) {
        setFormError(`الكمية المرتجعة لـ "${items[line.itemId]?.name ?? line.itemId}" أكبر مما تبقى قابلاً للإرجاع (${formatAmount(line.maxReturnable)})`);
        return;
      }
    }
    const validLines = lines.filter((l) => Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setFormError("أدخل كمية مرتجعة لمادة واحدة على الأقل");
      return;
    }
    const result = onSubmit({
      kind: original.kind,
      date,
      currencyCode: original.currencyCode,
      lines: validLines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      returnOfInvoiceId: original.id,
      note,
    });
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setFormError(null);
  }

  return (
    <form className="auth-form store-item-form" onSubmit={submit}>
      <p className="settings-hint">إرجاع من فاتورة {original.date} - أدخل الكمية المرتجعة لكل مادة (اتركها فارغة لعدم إرجاعها).</p>
      {lines.map((line, index) => {
        const item = items[line.itemId];
        return (
          <div key={index} className="invoice-line-row">
            <span className="store-item-name">{item?.name ?? "مادة"}</span>
            <input
              className="search-input"
              type="number" lang="en"
              min="0"
              step="0.01"
              dir="ltr"
              placeholder={`المرتجع (${formatAmount(line.maxReturnable ?? 0)} متاح)`}
              value={line.quantity}
              onChange={(e) => updateQuantity(index, e.target.value)}
            />
            <span className="store-item-price" dir="ltr">
              {formatAmount(Number(line.unitPrice))} {currencyLabel(original.currencyCode)}
            </span>
          </div>
        );
      })}
      <input className="search-input" type="date" lang="en-GB" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
      <input
        className="search-input ledger-note-input"
        type="text"
        placeholder="ملاحظة (اختياري)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit">
          حفظ المرتجع
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

function buildInvoicePdf(
  invoice: Invoice,
  items: StoreItemRegistry,
  counterpartyName: string | undefined,
  phone: string | undefined,
  representativeName: string | undefined,
): PrintableDocument {
  const currency = currencyLabel(invoice.currencyCode);
  const total = invoiceTotal(invoice);
  const remaining = total - invoice.paidAmount;
  const rows = invoice.lines.map((line) => {
    const item = items[line.itemId];
    return [
      item?.name ?? "مادة محذوفة",
      `${formatAmount(line.quantity)} ${item?.unit ?? ""}`,
      `${formatAmount(line.unitPrice)} ${currency}`,
      `${formatAmount(line.quantity * line.unitPrice)} ${currency}`,
    ];
  });
  for (const line of invoice.lines) {
    if (line.shippingCharge !== undefined) {
      rows.push([`🚚 شحن ${items[line.itemId]?.name ?? ""}`, "", "", `${formatAmount(line.shippingCharge)} ${currency}`]);
    }
  }
  if (invoice.discount > 0) rows.push(["الخصم", "", "", `-${formatAmount(invoice.discount)} ${currency}`]);
  const kind = invoice.kind === "sale" ? "بيع" : "شراء";
  return {
    title: invoice.returnOfInvoiceId ? `مرتجع ${kind}` : `فاتورة ${kind}`,
    partyName: counterpartyName ?? "بدون اسم",
    partyPhone: phone,
    subtitle: [`التاريخ: ${ltr(invoice.date)}`, `رقم: ${ltr(invoice.id.slice(0, 8))}`, representativeName ? `المندوب: ${representativeName}` : ""]
      .filter(Boolean)
      .join(" · "),
    summary: [
      { label: "الإجمالي", value: `${formatAmount(total)} ${currency}` },
      { label: "المدفوع", value: `${formatAmount(invoice.paidAmount)} ${currency}`, tone: "clear" },
      { label: "المتبقي", value: `${formatAmount(remaining)} ${currency}`, tone: remaining > 0.0001 ? "due" : "clear" },
    ],
    columns: ["المادة", "الكمية", "السعر", "المجموع"],
    rows,
    footerNote: invoice.note,
  };
}
