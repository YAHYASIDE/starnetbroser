"use client";

import type { BalanceFormInput } from "@/components/AccountsSection";
import { saveClientDevicePayment } from "@/lib/clientDevicePaymentSave";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Client,
  ClientStore,
  createClient,
  CreateClientInput,
  getClient,
  listClients,
  loadClientStore,
  saveClientStore,
  updateClient,
} from "@/lib/clientStore";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerByAccount, LedgerCurrency, loadLedgerStore } from "@/lib/ledgerStore";
import {
  computeInventoryValueByCurrency,
  computeStockByItem,
  CreateStoreItemInput,
  createStoreItem,
  deleteStoreTransaction,
  isLowStock,
  lastTransactionForItem,
  listStoreItems,
  listTransactionsForItem,
  loadStoreItems,
  loadStoreTransactions,
  recordStoreTransaction,
  saveStoreItems,
  saveStoreTransactions,
  StoreItem,
  StoreItemRegistry,
  StoreTransactionKind,
  StoreTransactionList,
  updateStoreItem,
} from "@/lib/storeStore";
import { resizeImageToDataUrl } from "@/lib/imageUtils";
import { formatAmount } from "@/lib/formatAmount";
import { ClientPicker } from "@/components/ClientPicker";
import { InvoiceSection } from "@/components/InvoiceSection";
import { AccountsSection } from "@/components/AccountsSection";
import { CashRegisterSection } from "@/components/CashRegisterSection";
import { StoreReportsSection } from "@/components/StoreReportsSection";
import { Invoice, InvoiceList, loadInvoices, saveInvoices } from "@/lib/invoiceStore";
import { buildNewDeviceHref, NewDevicePrefill, saleLooksLikeDevice } from "@/lib/deviceFromSale";
import {
  CashClosingList,
  CashEntryList,
  loadCashClosings,
  loadCashEntries,
  postPartyAdjustmentToCash,
  recordCashEntry,
  removeLinkedCashEntries,
  saveCashClosings,
  saveCashEntries,
} from "@/lib/cashStore";
import {
  createSupplier,
  CreateSupplierInput,
  listSuppliers,
  loadSupplierStore,
  saveSupplierStore,
  Supplier,
  SupplierStore,
  updateSupplier,
} from "@/lib/supplierStore";
import {
  createRepresentative,
  CreateRepresentativeInput,
  listRepresentatives,
  loadRepresentativeStore,
  Representative,
  RepresentativeStore,
  saveRepresentativeStore,
} from "@/lib/repStore";
import { StarlinkAccountSummary } from "@starnet/shared";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listAccounts } from "@/lib/apiClient";
import {
  deletePartyAdjustment,
  loadPartyAdjustments,
  PartyAdjustmentList,
  RecordPartyAdjustmentInput,
  recordPartyAdjustment,
  updatePartyAdjustment,
  savePartyAdjustments,
} from "@/lib/partyBalanceStore";

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

export default function StorePage() {
  const [items, setItems] = useState<StoreItemRegistry>({});
  const [transactions, setTransactions] = useState<StoreTransactionList>([]);
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [invoices, setInvoices] = useState<InvoiceList>([]);
  const [supplierStore, setSupplierStore] = useState<SupplierStore>({});
  const [representativeStore, setRepresentativeStore] = useState<RepresentativeStore>({});
  const [cashEntries, setCashEntries] = useState<CashEntryList>([]);
  const [cashClosings, setCashClosings] = useState<CashClosingList>([]);
  const [deviceOffer, setDeviceOffer] = useState<NewDevicePrefill | null>(null);
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [partyAdjustments, setPartyAdjustments] = useState<PartyAdjustmentList>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<StoreTransactionKind>("buy");
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    setItems(loadStoreItems());
    setTransactions(loadStoreTransactions());
    setClientStore(loadClientStore());
    setInvoices(loadInvoices());
    setSupplierStore(loadSupplierStore());
    setRepresentativeStore(loadRepresentativeStore());
    setCashEntries(loadCashEntries());
    setCashClosings(loadCashClosings());
    setLedgerStore(loadLedgerStore());
    setPartyAdjustments(loadPartyAdjustments());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const itemList = useMemo(() => listStoreItems(items), [items]);
  const stockByItem = useMemo(() => computeStockByItem(items, transactions), [items, transactions]);
  const clients = useMemo(() => listClients(clientStore), [clientStore]);
  const inventoryValue = useMemo(() => computeInventoryValueByCurrency(items, transactions), [items, transactions]);
  const inventoryValueCurrencies = Object.keys(inventoryValue);
  const lowStockCount = useMemo(
    () => itemList.filter((item) => isLowStock(item, stockByItem[item.id] ?? 0)).length,
    [itemList, stockByItem],
  );

  const suppliers = useMemo(() => listSuppliers(supplierStore), [supplierStore]);
  const representatives = useMemo(() => listRepresentatives(representativeStore), [representativeStore]);

  function handleCreateClient(input: CreateClientInput): Client {
    const result = createClient(clientStore, input);
    setClientStore(result.store);
    saveClientStore(result.store);
    return result.client;
  }

  function handleCreateSupplier(input: CreateSupplierInput): Supplier {
    const result = createSupplier(supplierStore, input);
    setSupplierStore(result.store);
    saveSupplierStore(result.store);
    return result.supplier;
  }

  function handleUpdateClient(clientId: string, input: CreateClientInput) {
    const next = updateClient(clientStore, clientId, input);
    setClientStore(next);
    saveClientStore(next);
  }

  function handleUpdateSupplier(supplierId: string, input: CreateSupplierInput) {
    const next = updateSupplier(supplierStore, supplierId, input);
    setSupplierStore(next);
    saveSupplierStore(next);
  }

  function handleAddAdjustment(input: RecordPartyAdjustmentInput): string | null {
    const result = recordPartyAdjustment(partyAdjustments, input);
    if (!result.ok) return result.message;
    setPartyAdjustments(result.list);
    savePartyAdjustments(result.list);
    if (result.adjustment.cashMoved) {
      const partyName =
        (input.partyKind === "client" ? clientStore[input.partyId]?.name : supplierStore[input.partyId]?.name) ?? "";
      const cash = postPartyAdjustmentToCash(loadCashEntries(), result.adjustment, partyName);
      setCashEntries(cash);
    saveCashEntries(cash);
    }
    return null;
  }

  /** Edits a balance entry; its linked cash entry (if any) is replaced to match. */
  function handleUpdateAdjustment(adjustmentId: string, input: Omit<BalanceFormInput, "deviceId">): string | null {
    const result = updatePartyAdjustment(partyAdjustments, adjustmentId, input);
    if (!result.ok) return result.message;
    setPartyAdjustments(result.list);
    savePartyAdjustments(result.list);
    const party = result.adjustment.partyKind === "client" ? clientStore[result.adjustment.partyId] : supplierStore[result.adjustment.partyId];
    const cash = postPartyAdjustmentToCash(removeLinkedCashEntries(loadCashEntries(), adjustmentId), result.adjustment, party?.name ?? "");
    saveCashEntries(cash);
    setCashEntries(cash);
    return null;
  }

  /** Turns a general "له" entry into a payment on one of the client's devices. */
  function handleMoveAdjustmentToDevice(adjustmentId: string, deviceId: string, input: Omit<BalanceFormInput, "deviceId">): string | null {
    const device = accounts.find((a) => a.id === deviceId);
    if (!device) return "الجهاز غير موجود";
    if (input.direction !== "weOwe") return "يمكن نقل الدفعات (له) فقط إلى جهاز";
    const original = partyAdjustments.find((a) => a.id === adjustmentId);
    // The general entry's own cash posting goes first - the device payment re-posts it if cash.
    saveCashEntries(removeLinkedCashEntries(loadCashEntries(), adjustmentId));
    const result = saveClientDevicePayment(
      ledgerStore,
      { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined },
      input,
    );
    if (!result.ok) {
      // Put the removed cash entry back so nothing changed.
      if (original) saveCashEntries(postPartyAdjustmentToCash(loadCashEntries(), original, clientStore[original.partyId]?.name ?? ""));
      return result.message;
    }
    setLedgerStore(result.ledgerStore);
    const next = deletePartyAdjustment(partyAdjustments, adjustmentId);
    setPartyAdjustments(next);
    savePartyAdjustments(next);
    setCashEntries(loadCashEntries());
    return null;
  }

  /** "الدفعة عن جهاز" from a client card - recorded in that device's own ledger. */
  function handleAddDevicePayment(deviceId: string, input: Omit<BalanceFormInput, "deviceId">): string | null {
    const device = accounts.find((a) => a.id === deviceId);
    if (!device) return "الجهاز غير موجود";
    const result = saveClientDevicePayment(
      ledgerStore,
      { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined },
      input,
    );
    if (!result.ok) return result.message;
    setLedgerStore(result.ledgerStore);
    return null;
  }

  function handleDeleteAdjustment(adjustmentId: string) {
    const next = deletePartyAdjustment(partyAdjustments, adjustmentId);
    setPartyAdjustments(next);
    savePartyAdjustments(next);
    const cash = removeLinkedCashEntries(loadCashEntries(), adjustmentId);
    setCashEntries(cash);
    saveCashEntries(cash);
  }

  function handleCreateRepresentative(input: CreateRepresentativeInput): Representative {
    const result = createRepresentative(representativeStore, input);
    setRepresentativeStore(result.store);
    saveRepresentativeStore(result.store);
    return result.representative;
  }

  function submitNewItem(input: CreateStoreItemInput) {
    const result = createStoreItem(items, input);
    setItems(result.items);
    saveStoreItems(result.items);
    setShowAddItem(false);
    openItem(result.item.id, "buy");
  }

  function submitEditItem(itemId: string, input: CreateStoreItemInput) {
    const next = updateStoreItem(items, itemId, input);
    setItems(next);
    saveStoreItems(next);
    setEditingItemId(null);
  }

  /** Opens (or re-opens with a different preset kind) one item's buy/sell panel - used both by
   * tapping the row itself (defaults to "buy") and by the row's own quick شراء/بيع buttons. */
  function openItem(itemId: string, kind: StoreTransactionKind) {
    setEditingItemId(null);
    setSelectedItemId(itemId);
    setPendingKind(kind);
  }

  function toggleItem(itemId: string) {
    if (selectedItemId === itemId) {
      setSelectedItemId(null);
      return;
    }
    openItem(itemId, "buy");
  }

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">المتجر</h1>
      </div>

      <section className="section">
        {itemList.length > 0 && (
          <div className="store-summary-row">
            <div className="store-summary-tile">
              <span className="store-summary-label">عدد المواد</span>
              <strong className="store-summary-value">{itemList.length}</strong>
            </div>
            <div className="store-summary-tile">
              <span className="store-summary-label">قيمة المخزون التقريبية</span>
              {inventoryValueCurrencies.length === 0 ? (
                <strong className="store-summary-value">—</strong>
              ) : (
                <div className="store-summary-value-stack">
                  {inventoryValueCurrencies.map((c) => (
                    <strong key={c} dir="ltr">
                      {formatAmount(inventoryValue[c])} {currencyLabel(c)}
                    </strong>
                  ))}
                </div>
              )}
            </div>
            {lowStockCount > 0 && (
              <div className="store-summary-tile store-summary-tile-warning">
                <span className="store-summary-label">تنبيه نفاد</span>
                <strong className="store-summary-value">{lowStockCount}</strong>
              </div>
            )}
          </div>
        )}

        <div className="store-items-header">
          <h2 className="section-title">المواد</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={() => {
              setEditingItemId(null);
              setShowAddItem((v) => !v);
            }}
          >
            {showAddItem ? "إلغاء" : "+ إضافة مادة"}
          </button>
        </div>

        {showAddItem && (
          <ItemForm onSubmit={submitNewItem} onCancel={() => setShowAddItem(false)} />
        )}

        {itemList.length === 0 && !showAddItem && (
          <p className="empty-state">لا توجد مواد بعد - أضف أول مادة لبدء تتبع المخزون.</p>
        )}

        <ul className="store-item-list">
          {itemList.map((item) => {
            const stock = stockByItem[item.id] ?? 0;
            const isOpen = selectedItemId === item.id;
            const isEditing = editingItemId === item.id;
            const lastTxn = lastTransactionForItem(transactions, item.id);
            const value = lastTxn ? stock * lastTxn.unitPrice : undefined;
            const lowStock = isLowStock(item, stock);
            return (
              <li key={item.id}>
                <div className={`store-item-card${isOpen || isEditing ? " store-item-card-active" : ""}`}>
                  <button
                    type="button"
                    className="store-item-row"
                    onClick={() => toggleItem(item.id)}
                    aria-expanded={isOpen}
                  >
                    {item.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageDataUrl} alt="" className="store-item-image" />
                    ) : (
                      <span className="store-item-icon" aria-hidden="true">📦</span>
                    )}
                    <span className="store-item-main">
                      <span className="store-item-name">
                        {item.name}
                        {item.code && (
                          <span className="store-item-code" dir="ltr">
                            {item.code}
                          </span>
                        )}
                      </span>
                      {lastTxn ? (
                        <span className="store-item-price" dir="ltr">
                          آخر سعر: {formatAmount(lastTxn.unitPrice)} {currencyLabel(lastTxn.currencyCode)}
                        </span>
                      ) : item.defaultSalePrice !== undefined ? (
                        <span className="store-item-price" dir="ltr">
                          سعر مقترح: {formatAmount(item.defaultSalePrice)} {currencyLabel(item.defaultSaleCurrencyCode ?? "MRU")}
                        </span>
                      ) : (
                        <span className="store-item-price">لا توجد حركات بعد</span>
                      )}
                    </span>
                    <span className="store-item-end">
                      <span className={`store-item-stock${stock <= 0 ? " store-item-stock-empty" : ""}`} dir="ltr">
                        {formatAmount(stock)} {item.unit}
                      </span>
                      {lowStock && <span className="store-item-low-badge">⚠️ قارب على النفاد</span>}
                      {value !== undefined && value > 0 && (
                        <span className="store-item-value" dir="ltr">
                          {formatAmount(value)} {currencyLabel(lastTxn!.currencyCode)}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="store-item-quick-actions">
                    <button
                      type="button"
                      className="store-quick-btn store-quick-buy"
                      onClick={() => openItem(item.id, "buy")}
                    >
                      + شراء
                    </button>
                    <button
                      type="button"
                      className="store-quick-btn store-quick-sell"
                      onClick={() => openItem(item.id, "sell")}
                      disabled={stock <= 0}
                    >
                      + بيع
                    </button>
                    <button
                      type="button"
                      className="store-quick-btn store-quick-edit"
                      onClick={() => {
                        setSelectedItemId(null);
                        setEditingItemId(isEditing ? null : item.id);
                      }}
                    >
                      {isEditing ? "إلغاء" : "تعديل"}
                    </button>
                  </div>
                  {isEditing && (
                    <div className="store-item-panel">
                      <ItemForm
                        initial={item}
                        onSubmit={(input) => submitEditItem(item.id, input)}
                        onCancel={() => setEditingItemId(null)}
                      />
                    </div>
                  )}
                  {isOpen && (
                    <StoreItemPanel
                      key={`${item.id}-${pendingKind}`}
                      item={item}
                      stock={stock}
                      initialKind={pendingKind}
                      transactions={transactions}
                      clients={clients}
                      clientStore={clientStore}
                      onCreateClient={handleCreateClient}
                      onChange={(next) => {
                        setTransactions(next);
                        saveStoreTransactions(next);
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <InvoiceSection
        items={items}
        transactions={transactions}
        invoices={invoices}
        clients={clients}
        clientStore={clientStore}
        suppliers={suppliers}
        supplierStore={supplierStore}
        representatives={representatives}
        representativeStore={representativeStore}
        accounts={accounts}
        partyAdjustments={partyAdjustments}
        onCreateClient={handleCreateClient}
        onCreateRepresentative={handleCreateRepresentative}
        onCreateSupplier={handleCreateSupplier}
        onChange={(result) => {
          setInvoices(result.invoices);
          saveInvoices(result.invoices);
          setTransactions(result.transactions);
          saveStoreTransactions(result.transactions);
          postInvoiceCashEntry(result.invoice);
          const sold = result.invoice.lines.map((line) => items[line.itemId]?.name ?? "");
          if (result.invoice.kind === "sale" && result.invoice.clientId && saleLooksLikeDevice(sold)) {
            setDeviceOffer({
              clientId: result.invoice.clientId,
              representativeId: result.invoice.representativeId,
              name: clientStore[result.invoice.clientId]?.name,
            });
          }
        }}
      />

      {deviceOffer && (
        <div className="device-offer" role="status">
          <span aria-hidden="true">📡</span>
          <div>
            <strong>بعت جهاز Starlink لـ {deviceOffer.name ?? "الزبون"}؟</strong>
            <small>أنشئ حساب الجهاز الآن مربوطًا بالزبون{deviceOffer.representativeId ? " والمندوب" : ""} لمتابعة التجديد والديون.</small>
            <div className="device-offer-actions">
              <Link href={buildNewDeviceHref(deviceOffer)} className="dialog-primary">
                إنشاء حساب الجهاز
              </Link>
              <button type="button" className="text-action" onClick={() => setDeviceOffer(null)}>
                لاحقًا
              </button>
            </div>
          </div>
        </div>
      )}

      <AccountsSection
        clients={clients}
        suppliers={suppliers}
        invoices={invoices}
        accounts={accounts}
        ledgerStore={ledgerStore}
        adjustments={partyAdjustments}
        onAddAdjustment={handleAddAdjustment}
        onDeleteAdjustment={handleDeleteAdjustment}
        onAddDevicePayment={handleAddDevicePayment}
        onUpdateAdjustment={handleUpdateAdjustment}
        onMoveAdjustmentToDevice={handleMoveAdjustmentToDevice}
        onCreateClient={handleCreateClient}
        onUpdateClient={handleUpdateClient}
        onCreateSupplier={handleCreateSupplier}
        onUpdateSupplier={handleUpdateSupplier}
      />

      <CashRegisterSection
        entries={cashEntries}
        onChange={(next) => {
          setCashEntries(next);
          saveCashEntries(next);
        }}
        closings={cashClosings}
        onChangeClosings={(nextCash, nextClosings) => {
          setCashEntries(nextCash);
          saveCashEntries(nextCash);
          setCashClosings(nextClosings);
          saveCashClosings(nextClosings);
        }}
      />

      <StoreReportsSection transactions={transactions} invoices={invoices} cashEntries={cashEntries} />
    </main>
  );

  /** Every invoice with a positive paidAmount also moves real cash, so it's mirrored into
   * الصندوق automatically (invoiceId set, so it's never double-counted as a standalone expense -
   * see cashStore.ts's listStandaloneCashEntries) rather than making the operator re-enter the
   * same amount by hand in two places. */
  function postInvoiceCashEntry(invoice: Invoice) {
    if (invoice.paidAmount <= 0) return;
    const result = recordCashEntry(cashEntries, {
      kind: invoice.kind === "sale" ? "in" : "out",
      amount: invoice.paidAmount,
      currencyCode: invoice.currencyCode,
      date: invoice.date,
      category: invoice.kind === "sale" ? "فاتورة بيع" : "فاتورة شراء",
      invoiceId: invoice.id,
    });
    if (!result.ok) return;
    setCashEntries(result.entries);
    saveCashEntries(result.entries);
  }
}

interface ItemFormProps {
  initial?: StoreItem;
  onSubmit: (input: CreateStoreItemInput) => void;
  onCancel: () => void;
}

/** The add/edit form for one item's own record - name, code, photo, default buy/sell prices, and
 * a low-stock threshold. Shared between "+ إضافة مادة" and an item's own "تعديل" action, since both
 * edit the exact same fields. */
function ItemForm({ initial, onSubmit, onCancel }: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(initial?.imageDataUrl);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState(
    initial?.defaultPurchasePrice !== undefined ? String(initial.defaultPurchasePrice) : "",
  );
  const [purchaseCurrency, setPurchaseCurrency] = useState<LedgerCurrency>(
    (initial?.defaultPurchaseCurrencyCode as LedgerCurrency | undefined) ?? "MRU",
  );
  const [salePrice, setSalePrice] = useState(
    initial?.defaultSalePrice !== undefined ? String(initial.defaultSalePrice) : "",
  );
  const [saleCurrency, setSaleCurrency] = useState<LedgerCurrency>(
    (initial?.defaultSaleCurrencyCode as LedgerCurrency | undefined) ?? "MRU",
  );
  const [wholesalePrice, setWholesalePrice] = useState(
    initial?.defaultWholesalePrice !== undefined ? String(initial.defaultWholesalePrice) : "",
  );
  const [threshold, setThreshold] = useState(
    initial?.lowStockThreshold !== undefined ? String(initial.lowStockThreshold) : "",
  );

  async function handleImagePick(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    setImageBusy(true);
    try {
      setImageDataUrl(await resizeImageToDataUrl(file));
    } catch {
      setImageError("تعذر معالجة الصورة - جرّب صورة أخرى");
    } finally {
      setImageBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name,
      unit: unit || undefined,
      code: code || undefined,
      imageDataUrl,
      defaultPurchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
      defaultPurchaseCurrencyCode: purchasePrice ? purchaseCurrency : undefined,
      defaultSalePrice: salePrice ? Number(salePrice) : undefined,
      defaultSaleCurrencyCode: salePrice ? saleCurrency : undefined,
      defaultWholesalePrice: wholesalePrice ? Number(wholesalePrice) : undefined,
      lowStockThreshold: threshold ? Number(threshold) : undefined,
    });
  }

  return (
    <form className="auth-form store-item-form" onSubmit={submit}>
      <div className="store-item-form-image-row">
        {imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageDataUrl} alt="" className="store-item-form-image-preview" />
        ) : (
          <span className="store-item-form-image-placeholder" aria-hidden="true">📦</span>
        )}
        <label className="btn-icon store-item-form-image-btn">
          {imageBusy ? "جارِ المعالجة…" : imageDataUrl ? "تغيير الصورة" : "إضافة صورة"}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handleImagePick(e.target.files?.[0])}
          />
        </label>
        {imageDataUrl && (
          <button type="button" className="text-action" onClick={() => setImageDataUrl(undefined)}>
            إزالة
          </button>
        )}
      </div>
      {imageError && <div className="account-card-alert">{imageError}</div>}

      <input
        className="search-input"
        placeholder="اسم المادة *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="store-item-form-row">
        <input
          className="search-input"
          placeholder="الوحدة (افتراضيًا قطعة)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          className="search-input"
          placeholder="الكود (اختياري)"
          dir="ltr"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div className="store-item-form-row">
        <input
          className="search-input"
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="سعر الشراء الافتراضي"
          value={purchasePrice}
          onChange={(e) => setPurchasePrice(e.target.value)}
        />
        <select className="search-input" value={purchaseCurrency} onChange={(e) => setPurchaseCurrency(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="store-item-form-row">
        <input
          className="search-input"
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="سعر البيع الافتراضي (تجزئة)"
          value={salePrice}
          onChange={(e) => setSalePrice(e.target.value)}
        />
        <select className="search-input" value={saleCurrency} onChange={(e) => setSaleCurrency(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <input
        className="search-input"
        type="number"
        min="0"
        step="0.01"
        dir="ltr"
        placeholder="سعر الجملة (اختياري، بنفس عملة البيع أعلاه)"
        value={wholesalePrice}
        onChange={(e) => setWholesalePrice(e.target.value)}
      />

      <input
        className="search-input"
        type="number"
        min="0"
        step="1"
        dir="ltr"
        placeholder="تنبيه عند اقتراب النفاد (الكمية)"
        value={threshold}
        onChange={(e) => setThreshold(e.target.value)}
      />

      <div className="settings-actions">
        <button className="btn-icon" type="submit" disabled={!name.trim() || imageBusy}>
          حفظ المادة
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

interface PanelProps {
  item: StoreItem;
  stock: number;
  initialKind: StoreTransactionKind;
  transactions: StoreTransactionList;
  clients: Client[];
  clientStore: ClientStore;
  onCreateClient: (input: CreateClientInput) => Client;
  onChange: (transactions: StoreTransactionList) => void;
}

/** One item's own buy/sell form plus its transaction history - shown inline under the item row
 * once expanded, never as a separate navigation (a real inventory's whole point is seeing the
 * item, its current stock, and what to do next all in one place). */
function StoreItemPanel({ item, stock, initialKind, transactions, clients, clientStore, onCreateClient, onChange }: PanelProps) {
  const [kind, setKind] = useState<StoreTransactionKind>(initialKind);
  // Pre-filled from the item's own default buy/sell price when it has one - still a plain form
  // field the operator can freely change before saving; the transaction never reads the item's
  // default again once submitted.
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState(() => {
    const def = initialKind === "buy" ? item.defaultPurchasePrice : item.defaultSalePrice;
    return def !== undefined ? String(def) : "";
  });
  const [currencyCode, setCurrencyCode] = useState<LedgerCurrency>(() => {
    const def = initialKind === "buy" ? item.defaultPurchaseCurrencyCode : item.defaultSaleCurrencyCode;
    return (def as LedgerCurrency | undefined) ?? "MRU";
  });
  const [date, setDate] = useState(todayDateInputValue());
  const [note, setNote] = useState("");
  const [linkClient, setLinkClient] = useState(false);
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);

  const itemTransactions = listTransactionsForItem(transactions, item.id);

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = recordStoreTransaction(transactions, {
      itemId: item.id,
      kind,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      currencyCode,
      clientId: kind === "sell" && linkClient ? clientId : undefined,
      note,
      date,
    });
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setFormError(null);
    onChange(result.transactions);
    setQuantity("");
    setUnitPrice("");
    setNote("");
    setLinkClient(false);
    setClientId(undefined);
  }

  function deleteTransaction(transactionId: string) {
    if (!window.confirm("هل تريد حذف هذه الحركة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    onChange(deleteStoreTransaction(transactions, transactionId));
  }

  return (
    <div className="store-item-panel">
      <form className="ledger-entry-form" onSubmit={submit}>
        <select
          className="search-input"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as StoreTransactionKind);
            setLinkClient(false);
            setClientId(undefined);
          }}
        >
          <option value="buy">شراء (وارد للمخزون)</option>
          <option value="sell">بيع (من المخزون)</option>
        </select>
        <input
          className="search-input"
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder={`الكمية (${item.unit})`}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <input
          className="search-input"
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="سعر الوحدة"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
        <select className="search-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value as LedgerCurrency)}>
          {LEDGER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {LEDGER_CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
        <input className="search-input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />

        {kind === "sell" && (
          <div className="form-field form-wide">
            <label className="ledger-d-toggle">
              <input type="checkbox" checked={linkClient} onChange={(e) => setLinkClient(e.target.checked)} />
              ربط هذه العملية بزبون
            </label>
            {linkClient && (
              <ClientPicker clients={clients} selectedClientId={clientId} onSelect={setClientId} onCreateClient={onCreateClient} />
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

        {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
        <button className="dialog-primary" type="submit">
          حفظ الحركة
        </button>
      </form>

      <p className="settings-hint" dir="ltr">
        المخزون الحالي: {formatAmount(stock)} {item.unit}
      </p>

      <ul className="ledger-entry-list">
        {itemTransactions.length === 0 && <li className="ledger-entry-empty">لا توجد حركات بعد لهذه المادة</li>}
        {itemTransactions.map((t) => {
          const client = getClient(clientStore, t.clientId);
          return (
            <li key={t.id} className="ledger-entry-row">
              <div className="ledger-entry-row-top">
                <span className={`badge ${t.kind === "buy" ? "badge-yellow" : "badge-green"}`}>
                  {t.kind === "buy" ? "شراء" : "بيع"}
                </span>
                <span className="ledger-entry-amount" dir="ltr">
                  {formatAmount(t.quantity)} {item.unit} × {formatAmount(t.unitPrice)} {currencyLabel(t.currencyCode)}
                </span>
                <span className="ledger-entry-date" dir="ltr">
                  {t.date}
                </span>
                <button
                  className="ledger-entry-delete"
                  type="button"
                  onClick={() => deleteTransaction(t.id)}
                  aria-label="حذف الحركة"
                  title="حذف الحركة"
                >
                  ×
                </button>
              </div>
              {(t.note || client) && (
                <div className="ledger-entry-row-bottom">
                  {client && <span className="ledger-entry-method">الزبون: {client.name}</span>}
                  {t.note && <span className="ledger-entry-note">{t.note}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
