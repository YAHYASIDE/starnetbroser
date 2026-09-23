"use client";

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
} from "@/lib/clientStore";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import {
  computeStockByItem,
  createStoreItem,
  deleteStoreTransaction,
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
} from "@/lib/storeStore";
import { formatAmount } from "@/lib/formatAmount";
import { ClientPicker } from "@/components/ClientPicker";

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StorePage() {
  const [items, setItems] = useState<StoreItemRegistry>({});
  const [transactions, setTransactions] = useState<StoreTransactionList>([]);
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("");

  useEffect(() => {
    setItems(loadStoreItems());
    setTransactions(loadStoreTransactions());
    setClientStore(loadClientStore());
  }, []);

  const itemList = useMemo(() => listStoreItems(items), [items]);
  const stockByItem = useMemo(() => computeStockByItem(items, transactions), [items, transactions]);
  const clients = useMemo(() => listClients(clientStore), [clientStore]);

  function handleCreateClient(input: CreateClientInput): Client {
    const result = createClient(clientStore, input);
    setClientStore(result.store);
    saveClientStore(result.store);
    return result.client;
  }

  function submitNewItem(event: FormEvent) {
    event.preventDefault();
    if (!newItemName.trim()) return;
    const result = createStoreItem(items, { name: newItemName, unit: newItemUnit || undefined });
    setItems(result.items);
    saveStoreItems(result.items);
    setNewItemName("");
    setNewItemUnit("");
    setShowAddItem(false);
    setSelectedItemId(result.item.id);
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
        <div className="store-items-header">
          <h2 className="section-title">المواد</h2>
          <button type="button" className="btn-icon" onClick={() => setShowAddItem((v) => !v)}>
            {showAddItem ? "إلغاء" : "+ إضافة مادة"}
          </button>
        </div>

        {showAddItem && (
          <form className="auth-form" onSubmit={submitNewItem}>
            <input
              className="search-input"
              placeholder="اسم المادة *"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              autoFocus
            />
            <input
              className="search-input"
              placeholder="الوحدة (اختياري - افتراضيًا قطعة)"
              value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
            />
            <div className="settings-actions">
              <button className="btn-icon" type="submit" disabled={!newItemName.trim()}>
                حفظ المادة
              </button>
            </div>
          </form>
        )}

        {itemList.length === 0 && !showAddItem && (
          <p className="empty-state">لا توجد مواد بعد - أضف أول مادة لبدء تتبع المخزون.</p>
        )}

        <ul className="store-item-list">
          {itemList.map((item) => {
            const stock = stockByItem[item.id] ?? 0;
            const isOpen = selectedItemId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`store-item-row${isOpen ? " store-item-row-active" : ""}`}
                  onClick={() => setSelectedItemId(isOpen ? null : item.id)}
                  aria-expanded={isOpen}
                >
                  <span className="store-item-name">{item.name}</span>
                  <span className={`store-item-stock${stock <= 0 ? " store-item-stock-empty" : ""}`} dir="ltr">
                    {formatAmount(stock)} {item.unit}
                  </span>
                </button>
                {isOpen && (
                  <StoreItemPanel
                    item={item}
                    stock={stock}
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
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

interface PanelProps {
  item: StoreItem;
  stock: number;
  transactions: StoreTransactionList;
  clients: Client[];
  clientStore: ClientStore;
  onCreateClient: (input: CreateClientInput) => Client;
  onChange: (transactions: StoreTransactionList) => void;
}

/** One item's own buy/sell form plus its transaction history - shown inline under the item row
 * once expanded, never as a separate navigation (a real inventory's whole point is seeing the
 * item, its current stock, and what to do next all in one place). */
function StoreItemPanel({ item, stock, transactions, clients, clientStore, onCreateClient, onChange }: PanelProps) {
  const [kind, setKind] = useState<StoreTransactionKind>("buy");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [currencyCode, setCurrencyCode] = useState<LedgerCurrency>("MRU");
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
                  {formatAmount(t.quantity)} {item.unit} × {formatAmount(t.unitPrice)} {LEDGER_CURRENCY_LABELS[t.currencyCode as LedgerCurrency] ?? t.currencyCode}
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
