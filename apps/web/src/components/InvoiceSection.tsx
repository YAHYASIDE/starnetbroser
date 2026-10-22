"use client";

import { DateInput } from "./DateInput";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { PartyAdjustment } from "@/lib/partyBalanceStore";
import { Client, ClientStore, CreateClientInput, getClient } from "@/lib/clientStore";
import { CreateSupplierInput, getSupplier, Supplier, SupplierStore } from "@/lib/supplierStore";
import { CreateRepresentativeInput, getRepresentative, Representative, RepresentativeStore, repFromClientDevice } from "@/lib/repStore";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import { cleanKit, findKitClashes, isStarlinkItem, kitClashMessage, resizeUnits } from "@/lib/saleDevices";
import { itemRepPrice, listStoreItems, StoreItemRegistry, StoreTransactionList } from "@/lib/storeStore";
import {
  computeClientStoreBalance,
  createInvoice,
  Invoice,
  invoicePaymentStatus,
  invoiceTotal,
  InvoiceKind,
  InvoiceList,
  listInvoices,
  type SaleUnit,
  returnedQuantityForLine,
} from "@/lib/invoiceStore";
import { buildInvoiceMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { PdfButton } from "./PdfButton";
import { PartySheet } from "./AccountsSection";
import { InvoiceEditSheet } from "./InvoiceEditSheet";
import { invoiceLockReason, type InvoiceEditInput } from "@/lib/invoiceEdit";
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
  /** 🛰️ A Starlink device line: KIT / name per piece (lib/saleDevices.ts). */
  units?: SaleUnit[];
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
  /** Saves the new invoice with its devices - an error message (nothing saved), or null. `chargeNow`:
   * «⚡ شحن الاشتراك الآن» was chosen for its one device. */
  onChange: (result: { invoices: InvoiceList; transactions: StoreTransactionList; invoice: Invoice; chargeNow?: boolean }) => string | null;
  /** ✎ / 🗑 a past invoice (lib/invoiceEdit.ts) - an error message, or null when saved. */
  onEditInvoice?: (invoiceId: string, input: InvoiceEditInput) => string | null;
  onDeleteInvoice?: (invoiceId: string) => string | null;
  /** «بيع» on an item: opens a new sale invoice with that item already on its first line. */
  saleRequest?: { itemId: string; nonce: number } | null;
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
  saleRequest,
  onEditInvoice,
  onDeleteInvoice,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formItemId, setFormItemId] = useState<string | undefined>(undefined);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!saleRequest) return;
    setExpanded(true);
    setReturningInvoice(null);
    setFormItemId(saleRequest.itemId);
    setShowForm(true);
    window.setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [saleRequest]);
  const [returningInvoice, setReturningInvoice] = useState<Invoice | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  // ✎ a past invoice edited from the list (his Oct 22 2026 ask «زر تعديل الفاتورة الماضية»).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? invoices.find((i) => i.id === editingId) : undefined;

  const itemList = useMemo(() => listStoreItems(items), [items]);
  const sortedInvoices = useMemo(() => listInvoices(invoices), [invoices]);

  function openNewForm() {
    setReturningInvoice(null);
    setFormItemId(undefined);
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

  function submit(result: { invoices: InvoiceList; transactions: StoreTransactionList; invoice: Invoice; chargeNow?: boolean }): string | null {
    const error = onChange(result);
    if (!error) closeForms();
    return error;
  }

  return (
    <section className="section" ref={sectionRef}>
      <button
        type="button"
        className="report-collapse-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        🧾 الفواتير (البيع والشراء) {expanded ? "▲" : "▼"}
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
              key={`${formItemId ?? "new"}-${saleRequest?.nonce ?? 0}`}
              initialItemId={formItemId}
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
              onSubmit={({ chargeNow, ...input }) => {
                const result = createInvoice(invoices, transactions, input);
                if (!result.ok) return result;
                const error = submit({ invoices: result.invoices, transactions: result.transactions, invoice: result.invoice, chargeNow });
                return error ? { ok: false, message: error } : result;
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
                if (!result.ok) return result;
                const error = submit({ invoices: result.invoices, transactions: result.transactions, invoice: result.invoice });
                return error ? { ok: false, message: error } : result;
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
                    <button type="button" className="text-action" onClick={() => setEditingId(invoice.id)}>
                      ✎ تعديل
                    </button>
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

      {editing && onEditInvoice && onDeleteInvoice && (
        <PartySheet title={editing.returnOfInvoiceId ? "مرتجع" : `✎ تعديل فاتورة ${editing.kind === "sale" ? "البيع" : "الشراء"}`} onClose={() => setEditingId(null)}>
          <InvoiceEditSheet
            invoice={editing}
            currencyLabel={currencyLabel(editing.currencyCode)}
            lock={invoiceLockReason(invoices, editing.id)}
            parties={(editing.kind === "sale" ? clients : suppliers).map((p) => ({ id: p.id, name: p.name }))}
            onSave={(input) => {
              const error = onEditInvoice(editing.id, input);
              if (!error) setEditingId(null);
              return error;
            }}
            onDelete={() => {
              const error = onDeleteInvoice(editing.id);
              if (!error) setEditingId(null);
              return error;
            }}
            onCancel={() => setEditingId(null)}
          />
        </PartySheet>
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
  onSubmit: (input: Parameters<typeof createInvoice>[2] & { chargeNow?: boolean }) => ReturnType<typeof createInvoice>;
  /** A sale invoice started from an item's «بيع» button: that item, quantity 1, its sale price. */
  initialItemId?: string;
}

const newUnitId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `unit-${Date.now()}-${Math.random()}`);

/** One titled block of the form (his Oct 22 2026 ask: «الزبون · الجهاز · السعر والدفع · الشحن والتفعيل»). */
function FormSection({ step, title, hint, children }: { step: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="sale-section">
      <header className="sale-section-head">
        <span className="sale-section-step" aria-hidden="true">
          {step}
        </span>
        <div>
          <h3>{title}</h3>
          {hint && <small>{hint}</small>}
        </div>
      </header>
      <div className="sale-section-body">{children}</div>
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`sale-field${wide ? " sale-field-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
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
  initialItemId,
}: InvoiceFormProps) {
  const [kind, setKind] = useState<InvoiceKind>("sale");
  const [priceTier, setPriceTier] = useState<"retail" | "wholesale">("retail");
  const [date, setDate] = useState(todayDateInputValue());
  const [currencyCode, setCurrencyCode] = useState<LedgerCurrency>(() => {
    const saleCurrency = initialItemId ? items.find((i) => i.id === initialItemId)?.defaultSaleCurrencyCode : undefined;
    return saleCurrency && (LEDGER_CURRENCIES as readonly string[]).includes(saleCurrency)
      ? (saleCurrency as LedgerCurrency)
      : defaultInvoiceCurrency();
  });
  // 🛰️ a device line keeps exactly one unit (KIT / name) per piece in its state, so each keeps its id.
  const withUnits = (line: DraftLine, sale: boolean): DraftLine =>
    sale && isStarlinkItem(items.find((i) => i.id === line.itemId))
      ? { ...line, units: resizeUnits(line.units, Number(line.quantity), newUnitId) }
      : { ...line, units: undefined };
  const [lines, setLines] = useState<DraftLine[]>(() => {
    const item = initialItemId ? items.find((i) => i.id === initialItemId) : undefined;
    if (!item) return [{ itemId: "", quantity: "1", unitPrice: "" }];
    return [withUnits({ itemId: item.id, quantity: "1", unitPrice: item.defaultSalePrice !== undefined ? String(item.defaultSalePrice) : "" }, true)];
  });
  const [discount, setDiscount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [note, setNote] = useState("");
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [linkRepresentative, setLinkRepresentative] = useState(false);
  const [representativeId, setRepresentativeId] = useState<string | undefined>(undefined);
  // ⚡ «شحن الاشتراك الآن» (his choice: الشحن = the Starlink subscription): after saving, the device's
  // «شحن / تفعيل» opens on the home page. Off = the device waits as «غير مفعّل».
  const [chargeNow, setChargeNow] = useState(false);
  const saving = useRef(false);
  // Tracks whether the CURRENT representativeId came from repFromClientDevice (the selected
  // client's own linked device) rather than a direct operator pick in RepresentativePicker -
  // undefined means "no auto-fill in effect", so a manual pick is never silently overwritten by a
  // later client change, and an auto-filled value IS refreshed/cleared when the client changes
  // again (see handleClientSelect below).
  const [repAutoFilledForClientId, setRepAutoFilledForClientId] = useState<string | undefined>(undefined);
  const isSale = kind === "sale";

  function handleClientSelect(nextClientId: string | undefined) {
    setClientId(nextClientId);
    if (!isSale) return;
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
  // 🤝 his fixed price for an item (StoreItem.repPrices), in this invoice's currency - locked on the line.
  const activeRepId = isSale && linkRepresentative ? representativeId : undefined;
  const lineRepPrice = (itemId: string) => itemRepPrice(items.find((i) => i.id === itemId), activeRepId, currencyCode);
  // 🛰️ a Starlink device line (the item's own flag): one KIT / name per piece → one device each.
  const isDeviceLine = (line: DraftLine) => isSale && isStarlinkItem(items.find((i) => i.id === line.itemId));
  const unitsFor = (line: DraftLine) => (isDeviceLine(line) ? line.units ?? [] : []);
  const allUnits = lines.flatMap(unitsFor);
  const clashes = findKitClashes(allUnits, accounts);
  const clashFor = (kit: string | undefined) => {
    const clean = cleanKit(kit);
    return clean ? clashes.find((c) => c.kit === clean) : undefined;
  };
  const clientNameOf = (id: string) => clients.find((c) => c.id === id)?.name;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, i) => (i === index ? withUnits({ ...line, ...patch }, isSale) : line)));
  }

  function updateUnit(index: number, unitIndex: number, patch: Partial<SaleUnit>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, units: (line.units ?? []).map((u, k) => (k === unitIndex ? { ...u, ...patch } : u)) } : line)),
    );
  }

  function selectItemForLine(index: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    const defaultPrice = isSale ? (priceTier === "wholesale" ? item?.defaultWholesalePrice : undefined) ?? item?.defaultSalePrice : item?.defaultPurchasePrice;
    updateLine(index, { itemId, unitPrice: defaultPrice !== undefined ? String(defaultPrice) : "" });
  }

  function addLine() {
    setLines((current) => [...current, { itemId: "", quantity: "1", unitPrice: "" }]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  const subtotal = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) + (isSale && l.shipping ? Number(l.shippingCharge) || 0 : 0),
    0,
  );
  const parsedDiscount = Number(discount) || 0;
  const total = Math.max(0, subtotal - parsedDiscount);
  const paid = Number(paidAmount) || 0;
  const remaining = total - paid;
  const cur = currencyLabel(currencyCode);

  // Warns (never blocks) when a credit sale would push this client's own store balance, in THIS
  // invoice's own currency only (never summed/converted across currencies, same rule as every
  // other balance in this app), past their optional Client.creditLimit.
  const selectedClient = isSale ? clients.find((c) => c.id === clientId) : undefined;
  const creditLimitWarning = useMemo(() => {
    if (!selectedClient?.creditLimit) return null;
    const existingBalance = computeClientStoreBalance(invoices, selectedClient.id, partyAdjustments)[currencyCode] ?? 0;
    const thisInvoiceUnpaid = Math.max(0, total - paid);
    const projected = existingBalance + thisInvoiceUnpaid;
    if (projected <= selectedClient.creditLimit) return null;
    return { projected, limit: selectedClient.creditLimit };
  }, [selectedClient, invoices, partyAdjustments, currencyCode, total, paid]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return; // a second tap while saving never makes a second invoice
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setFormError("أضف صنفًا واحدًا على الأقل بكمية صحيحة");
      return;
    }
    if (validLines.some((l) => isDeviceLine(l) && !Number.isInteger(Number(l.quantity)))) {
      setFormError("عدد الأجهزة يجب أن يكون رقمًا صحيحًا (جهاز لكل KIT)");
      return;
    }
    if (clashes.length > 0) {
      setFormError(kitClashMessage(clashes[0]!, clientNameOf));
      return;
    }
    if (allUnits.length > 0 && !clientId && !window.confirm("لم تختر الزبون - تُحفظ الأجهزة بلا زبون. متابعة؟")) return;
    saving.current = true;
    const result = onSubmit({
      chargeNow: chargeNow && allUnits.length === 1,
      kind,
      date,
      currencyCode,
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        shippingCost: isSale && l.shipping && l.shippingCost ? Number(l.shippingCost) : undefined,
        shippingCharge: isSale && l.shipping && l.shippingCharge ? Number(l.shippingCharge) : undefined,
        repUnitPrice: lineRepPrice(l.itemId),
        ...(isDeviceLine(l) ? { units: unitsFor(l).map((u) => ({ ...u, kit: cleanKit(u.kit) || undefined })) } : {}),
      })),
      discount: parsedDiscount,
      paidAmount: paid,
      clientId: isSale ? clientId : undefined,
      supplierId: !isSale ? supplierId : undefined,
      representativeId: isSale && linkRepresentative ? representativeId : undefined,
      representativeCommissionPercent:
        isSale && linkRepresentative && representativeId ? representatives.find((r) => r.id === representativeId)?.commissionPercent : undefined,
      note,
    });
    saving.current = false;
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setFormError(null);
  }

  return (
    <form className="sale-form" onSubmit={submit}>
      <div className="sale-form-top">
        <div className="sale-kind-tabs" role="tablist" aria-label="نوع الفاتورة">
          {(["sale", "purchase"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => {
                setKind(k);
                setClientId(undefined);
                setSupplierId(undefined);
                setLines((current) => current.map((line) => withUnits(line, k === "sale")));
              }}
            >
              {k === "sale" ? "🧾 بيع" : "📥 شراء"}
            </button>
          ))}
        </div>
        <Field label="التاريخ">
          <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <FormSection step="1" title={isSale ? "👤 بيانات الزبون" : "🏭 المورّد"} hint={isSale ? "ابحث بالاسم أو الهاتف، أو أضف زبونًا جديدًا" : undefined}>
        {isSale ? (
          <>
            <ClientPicker clients={clients} selectedClientId={clientId} onSelect={handleClientSelect} onCreateClient={onCreateClient} />
            {creditLimitWarning && (
              <div className="account-card-alert ledger-form-error">
                ⚠️ سيتجاوز دين هذا الزبون سقفه ({formatAmount(creditLimitWarning.limit)} {cur}) - المتوقع بعد هذه الفاتورة:{" "}
                {formatAmount(creditLimitWarning.projected)} {cur}
              </div>
            )}
            <label className="sale-check">
              <input type="checkbox" checked={linkRepresentative} onChange={(e) => setLinkRepresentative(e.target.checked)} />
              <span>🤝 البيع عبر مندوب</span>
            </label>
            {linkRepresentative && (
              <RepresentativePicker
                representatives={representatives}
                selectedRepresentativeId={representativeId}
                onSelect={handleRepresentativeSelect}
                onCreateRepresentative={onCreateRepresentative}
              />
            )}
          </>
        ) : (
          <SupplierPicker suppliers={suppliers} selectedSupplierId={supplierId} onSelect={setSupplierId} onCreateSupplier={onCreateSupplier} />
        )}
      </FormSection>

      <FormSection step="2" title={isSale ? "🛰️ بيانات الجهاز" : "📦 الأصناف"} hint={isSale ? "جهاز Starlink: رقم KIT لكل جهاز، ويُضاف إلى الأجهزة «غير مفعّل»" : undefined}>
        <div className="sale-grid-2">
          <Field label="العملة">
            <select className="search-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value as LedgerCurrency)}>
              {LEDGER_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {LEDGER_CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          {isSale && (
            <Field label="نوع السعر">
              <select className="search-input" value={priceTier} onChange={(e) => setPriceTier(e.target.value as "retail" | "wholesale")}>
                <option value="retail">تجزئة</option>
                <option value="wholesale">جملة</option>
              </select>
            </Field>
          )}
        </div>

        {lines.map((line, index) => {
          const units = unitsFor(line);
          const repPrice = isSale && line.itemId ? lineRepPrice(line.itemId) : undefined;
          return (
            <div key={index} className="sale-line">
              <div className="sale-line-head">
                <Field label={lines.length > 1 ? `الصنف ${index + 1}` : "الصنف (النوع)"} wide>
                  <select className="search-input" value={line.itemId} onChange={(e) => selectItemForLine(index, e.target.value)}>
                    <option value="">اختر صنفًا</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {lines.length > 1 && (
                  <button type="button" className="sale-line-remove" onClick={() => removeLine(index)} aria-label="حذف الصنف">
                    ×
                  </button>
                )}
              </div>
              <div className="sale-grid-2">
                <Field label={isDeviceLine(line) ? "عدد الأجهزة" : "الكمية"}>
                  <input
                    className="search-input"
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                  />
                </Field>
                <Field label={`سعر الواحد (${cur})`}>
                  <input
                    className="search-input"
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="0"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                  />
                </Field>
              </div>
              {repPrice !== undefined && (
                <span className="invoice-line-rep">
                  🤝 سعر {representatives.find((r) => r.id === activeRepId)?.name}: <bdi dir="ltr">{formatAmount(repPrice)}</bdi> - ربحه{" "}
                  <bdi dir="ltr">{formatAmount(((Number(line.unitPrice) || 0) - repPrice) * (Number(line.quantity) || 0))}</bdi> (بلا نسبة)
                </span>
              )}

              {units.length > 0 && (
                <div className="sale-units">
                  {units.map((unit, k) => {
                    const clash = clashFor(unit.kit);
                    return (
                      <div key={unit.id} className="sale-unit">
                        <span className="sale-unit-badge" aria-hidden="true">
                          📡 {units.length > 1 ? k + 1 : ""}
                        </span>
                        <div className="sale-grid-2">
                          <Field label={units.length > 1 ? `رقم KIT للجهاز ${k + 1}` : "رقم KIT للجهاز"}>
                            <input
                              className={`search-input${clash ? " is-invalid" : ""}`}
                              dir="ltr"
                              autoCapitalize="characters"
                              placeholder="KIT… (اختياري)"
                              value={unit.kit ?? ""}
                              onChange={(e) => updateUnit(index, k, { kit: e.target.value })}
                            />
                          </Field>
                          <Field label="اسم الجهاز (اختياري)">
                            <input
                              className="search-input"
                              placeholder={[selectedClient?.name, items.find((i) => i.id === line.itemId)?.name].filter(Boolean).join(" - ")}
                              value={unit.name ?? ""}
                              onChange={(e) => updateUnit(index, k, { name: e.target.value })}
                            />
                          </Field>
                        </div>
                        {clash && <p className="sale-unit-clash">⚠️ {kitClashMessage(clash, clientNameOf)}</p>}
                      </div>
                    );
                  })}
                </div>
              )}

              {isSale && (
                <label className="sale-check">
                  <input
                    type="checkbox"
                    checked={line.shipping ?? false}
                    onChange={(e) => updateLine(index, e.target.checked ? { shipping: true } : { shipping: false, shippingCost: "", shippingCharge: "" })}
                  />
                  <span>🚚 توصيل هذا الصنف (نقل)</span>
                </label>
              )}
              {isSale && line.shipping && (
                <div className="sale-grid-2">
                  <Field label="تكلفة التوصيل علينا">
                    <input
                      className="search-input"
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      placeholder="0"
                      value={line.shippingCost ?? ""}
                      onChange={(e) => updateLine(index, { shippingCost: e.target.value })}
                    />
                  </Field>
                  <Field label="سعره للزبون">
                    <input
                      className="search-input"
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      placeholder="0"
                      value={line.shippingCharge ?? ""}
                      onChange={(e) => updateLine(index, { shippingCharge: e.target.value })}
                    />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" className="sale-add-line" onClick={addLine}>
          + إضافة صنف آخر
        </button>
      </FormSection>

      <FormSection step="3" title="💰 السعر والدفع">
        <div className="sale-grid-2">
          <Field label={`الخصم (${cur})`}>
            <input className="search-input" type="text" inputMode="decimal" dir="ltr" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label={`المدفوع الآن (${cur})`}>
            <input className="search-input" type="text" inputMode="decimal" dir="ltr" placeholder="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </Field>
        </div>
        <div className="sale-pay-quick">
          <button type="button" className={paid === total && total > 0 ? "active" : ""} onClick={() => setPaidAmount(String(total))}>
            💵 دفع كامل
          </button>
          <button type="button" className={paid === 0 ? "active" : ""} onClick={() => setPaidAmount("")}>
            📒 دين كامل
          </button>
        </div>
        <dl className="sale-summary">
          <div>
            <dt>المجموع</dt>
            <dd>
              <bdi dir="ltr">{formatAmount(subtotal)}</bdi> {cur}
            </dd>
          </div>
          {parsedDiscount > 0 && (
            <div>
              <dt>الخصم</dt>
              <dd>
                <bdi dir="ltr">-{formatAmount(parsedDiscount)}</bdi> {cur}
              </dd>
            </div>
          )}
          <div className="sale-summary-total">
            <dt>الإجمالي</dt>
            <dd>
              <bdi dir="ltr">{formatAmount(total)}</bdi> {cur}
            </dd>
          </div>
          <div className={remaining > 0.0001 ? "is-due" : "is-clear"}>
            <dt>{remaining >= 0 ? (isSale ? "الباقي عليه" : "الباقي علينا") : isSale ? "الزائد له" : "الزائد لنا"}</dt>
            <dd>
              <bdi dir="ltr">{formatAmount(Math.abs(remaining))}</bdi> {cur}
            </dd>
          </div>
        </dl>
      </FormSection>

      {allUnits.length > 0 && (
        <FormSection step="4" title="⚡ الشحن والتفعيل" hint="البيع غير التفعيل: الجهاز يُحفظ «غير مفعّل» حتى تشحن اشتراكه">
          <div className="sale-choices" role="radiogroup" aria-label="التفعيل">
            <label className={`sale-choice${!chargeNow ? " active" : ""}`}>
              <input type="radio" name="activation" checked={!chargeNow} onChange={() => setChargeNow(false)} />
              <span>
                <strong>⏳ لم يُفعَّل بعد</strong>
                <small>يُضاف إلى الأجهزة «غير مفعّل» - تشحنه لاحقًا من بطاقته</small>
              </span>
            </label>
            <label className={`sale-choice${chargeNow ? " active" : ""}${allUnits.length > 1 ? " is-disabled" : ""}`}>
              <input type="radio" name="activation" checked={chargeNow} disabled={allUnits.length > 1} onChange={() => setChargeNow(true)} />
              <span>
                <strong>⚡ شحن الاشتراك الآن</strong>
                <small>{allUnits.length > 1 ? "عدة أجهزة: اشحن كل جهاز من بطاقته" : "بعد الحفظ يفتح «شحن / تفعيل»: الحساب ثم الشحن"}</small>
              </span>
            </label>
          </div>
        </FormSection>
      )}

      <Field label="ملاحظة (اختياري)" wide>
        <input className="search-input" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
      <div className="sale-actions">
        <button className="dialog-primary" type="submit">
          حفظ الفاتورة{allUnits.length > 0 ? ` و${allUnits.length === 1 ? "الجهاز" : `${allUnits.length} أجهزة`}` : ""}
        </button>
        <button type="button" className="dialog-secondary" onClick={onCancel}>
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
              type="text" inputMode="decimal"
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
      <DateInput className="search-input"  value={date} onChange={(e) => setDate(e.target.value)} />
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
