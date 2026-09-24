"use client";

import { FormEvent, useMemo, useState } from "react";
import { Client, CreateClientInput } from "@/lib/clientStore";
import { CreateSupplierInput, Supplier } from "@/lib/supplierStore";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import {
  computeClientStoreBalance,
  computeSupplierStoreBalance,
  invoicePaymentStatus,
  invoiceTotal,
  InvoiceList,
  listInvoicesForClient,
  listInvoicesForSupplier,
} from "@/lib/invoiceStore";
import { combinePhoneNumber, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { formatAmount } from "@/lib/formatAmount";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

interface Props {
  clients: Client[];
  suppliers: Supplier[];
  invoices: InvoiceList;
  onCreateClient: (input: CreateClientInput) => void;
  onUpdateClient: (clientId: string, input: CreateClientInput) => void;
  onCreateSupplier: (input: CreateSupplierInput) => void;
  onUpdateSupplier: (supplierId: string, input: CreateSupplierInput) => void;
}

/** حسابات الزبائن والموردين: the one place in المتجر to see AND manage every client/supplier -
 * every registered one (never only those with a store balance, so a brand-new or fully-settled
 * party is still visible to edit), each with its own current store balance computed from
 * invoiceStore.ts, a statement of their invoices on demand, and inline add/edit for name+phone
 * (the registry itself already supported this via clientStore.ts/supplierStore.ts - this section is
 * what actually exposes it to the operator, since the only other edit path (clients) required
 * digging through a linked device's own card, and suppliers had no edit path anywhere at all).
 * Entirely about STORE money - never reads or shows ledgerStore.ts's own per-device Starlink
 * balance, a separate business. */
export function AccountsSection({
  clients,
  suppliers,
  invoices,
  onCreateClient,
  onUpdateClient,
  onCreateSupplier,
  onUpdateSupplier,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  const clientRows = useMemo(
    () => clients.map((client) => ({ party: client, balance: computeClientStoreBalance(invoices, client.id) })),
    [clients, invoices],
  );
  const supplierRows = useMemo(
    () => suppliers.map((supplier) => ({ party: supplier, balance: computeSupplierStoreBalance(invoices, supplier.id) })),
    [suppliers, invoices],
  );

  function startEditing(partyId: string) {
    setOpenPartyId(null);
    setEditingPartyId(partyId);
  }

  return (
    <section className="section">
      <button type="button" className="report-collapse-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        حسابات الزبائن والموردين {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <>
          <div className="store-items-header">
            <h2 className="report-section-title">الزبائن</h2>
            <button type="button" className="btn-icon" onClick={() => setShowAddClient((v) => !v)}>
              {showAddClient ? "إلغاء" : "+ إضافة زبون"}
            </button>
          </div>
          {showAddClient && (
            <PartyForm
              submitLabel="إضافة الزبون"
              namePlaceholder="اسم الزبون *"
              showCreditLimit
              onSubmit={(input) => {
                onCreateClient(input);
                setShowAddClient(false);
              }}
              onCancel={() => setShowAddClient(false)}
            />
          )}
          {clientRows.length === 0 ? (
            <p className="empty-state">لا يوجد زبائن بعد.</p>
          ) : (
            <ul className="ledger-entry-list">
              {clientRows.map(({ party, balance }) =>
                editingPartyId === party.id ? (
                  <li key={party.id} className="ledger-entry-row">
                    <PartyForm
                      initial={party}
                      submitLabel="حفظ"
                      namePlaceholder="اسم الزبون *"
                      showCreditLimit
                      onSubmit={(input) => {
                        onUpdateClient(party.id, input);
                        setEditingPartyId(null);
                      }}
                      onCancel={() => setEditingPartyId(null)}
                    />
                  </li>
                ) : (
                  <PartyRow
                    key={party.id}
                    party={party}
                    balance={balance}
                    positiveLabel="عليه"
                    negativeLabel="له"
                    isOpen={openPartyId === party.id}
                    onToggle={() => setOpenPartyId(openPartyId === party.id ? null : party.id)}
                    onEdit={() => startEditing(party.id)}
                    invoices={listInvoicesForClient(invoices, party.id)}
                    creditLimit={party.creditLimit}
                  />
                ),
              )}
            </ul>
          )}

          <div className="store-items-header">
            <h2 className="report-section-title">الموردون</h2>
            <button type="button" className="btn-icon" onClick={() => setShowAddSupplier((v) => !v)}>
              {showAddSupplier ? "إلغاء" : "+ إضافة مورد"}
            </button>
          </div>
          {showAddSupplier && (
            <PartyForm
              submitLabel="إضافة المورد"
              namePlaceholder="اسم المورد *"
              onSubmit={(input) => {
                onCreateSupplier(input);
                setShowAddSupplier(false);
              }}
              onCancel={() => setShowAddSupplier(false)}
            />
          )}
          {supplierRows.length === 0 ? (
            <p className="empty-state">لا يوجد موردون بعد.</p>
          ) : (
            <ul className="ledger-entry-list">
              {supplierRows.map(({ party, balance }) =>
                editingPartyId === party.id ? (
                  <li key={party.id} className="ledger-entry-row">
                    <PartyForm
                      initial={party}
                      submitLabel="حفظ"
                      namePlaceholder="اسم المورد *"
                      onSubmit={(input) => {
                        onUpdateSupplier(party.id, input);
                        setEditingPartyId(null);
                      }}
                      onCancel={() => setEditingPartyId(null)}
                    />
                  </li>
                ) : (
                  <PartyRow
                    key={party.id}
                    party={party}
                    balance={balance}
                    positiveLabel="نحن مدينون"
                    negativeLabel="له فائض"
                    isOpen={openPartyId === party.id}
                    onToggle={() => setOpenPartyId(openPartyId === party.id ? null : party.id)}
                    onEdit={() => startEditing(party.id)}
                    invoices={listInvoicesForSupplier(invoices, party.id)}
                  />
                ),
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

interface PartyFormProps {
  initial?: { name: string; phone?: string; creditLimit?: number };
  submitLabel: string;
  namePlaceholder: string;
  /** Client-only (see Client.creditLimit's own doc) - never rendered for a supplier form, since a
   * credit ceiling only ever applies to money a client can owe US. */
  showCreditLimit?: boolean;
  onSubmit: (input: CreateClientInput) => void;
  onCancel: () => void;
}

/** Shared add/edit form for both a client and a supplier - identical shape (name + optional
 * phone), reusing the exact same country-code phone picker as every other party form in this
 * app (RepresentativeForm, ClientDialog, ClientPicker, SupplierPicker). */
function PartyForm({ initial, submitLabel, namePlaceholder, showCreditLimit, onSubmit, onCancel }: PartyFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phoneDialCode, setPhoneDialCode] = useState(() => splitPhoneNumber(initial?.phone).dialCode);
  const [phoneLocalNumber, setPhoneLocalNumber] = useState(() => splitPhoneNumber(initial?.phone).localNumber);
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit ? String(initial.creditLimit) : "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name,
      phone: combinePhoneNumber(phoneDialCode, phoneLocalNumber) || undefined,
      creditLimit: showCreditLimit && creditLimit ? Number(creditLimit) : undefined,
    });
  }

  return (
    <form className="auth-form store-item-form" onSubmit={submit}>
      <input className="search-input" placeholder={namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="phone-input-row">
        <select
          className="phone-country-select"
          dir="ltr"
          value={phoneDialCode}
          onChange={(e) => setPhoneDialCode(e.target.value)}
          aria-label="رمز الدولة"
        >
          {PHONE_COUNTRY_CODES.map((c) => (
            <option key={c.dialCode} value={c.dialCode}>{c.country} {c.dialCode}</option>
          ))}
        </select>
        <input
          className="phone-local-input"
          dir="ltr"
          type="tel"
          placeholder="رقم الهاتف (اختياري)"
          value={phoneLocalNumber}
          onChange={(e) => setPhoneLocalNumber(e.target.value)}
        />
      </div>
      {showCreditLimit && (
        <input
          className="search-input"
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          placeholder="سقف الدين (اختياري)"
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
        />
      )}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!name.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

interface PartyRowProps {
  party: { id: string; name: string; phone?: string };
  balance: Record<string, number>;
  positiveLabel: string;
  negativeLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  invoices: InvoiceList;
  /** Client-only - see Client.creditLimit's own doc. Absent for a supplier row. */
  creditLimit?: number;
}

function PartyRow({ party, balance, positiveLabel, negativeLabel, isOpen, onToggle, onEdit, invoices, creditLimit }: PartyRowProps) {
  const currencies = Object.keys(balance);
  return (
    <li className="ledger-entry-row">
      <div className="ledger-entry-row-top">
        <span className="store-item-name">{party.name}</span>
        <div className="store-summary-value-stack">
          {currencies.length === 0 ? (
            <span className="badge badge-green">لا يوجد مستحق</span>
          ) : (
            currencies.map((c) => {
              const amount = balance[c]!;
              const isPositive = amount > 0;
              return (
                <span key={c} className={`badge ${isPositive ? "badge-red" : "badge-green"}`} dir="ltr">
                  {isPositive ? positiveLabel : negativeLabel} {formatAmount(Math.abs(amount))} {currencyLabel(c)}
                </span>
              );
            })
          )}
        </div>
      </div>
      <div className="ledger-entry-row-bottom">
        {party.phone && <span className="settings-hint" dir="ltr">{party.phone}</span>}
        {creditLimit !== undefined && <span className="settings-hint" dir="ltr">سقف الدين: {formatAmount(creditLimit)}</span>}
        <button type="button" className="text-action" onClick={onEdit}>تعديل</button>
        {invoices.length > 0 && (
          <button type="button" className="text-action" onClick={onToggle}>
            {isOpen ? "إخفاء" : "كشف الحساب"}
          </button>
        )}
      </div>
      {isOpen && (
        <ul className="report-line-list">
          {invoices.map((inv) => (
            <li key={inv.id} className="report-line">
              <span dir="ltr">
                {inv.date} {inv.returnOfInvoiceId ? "(مرتجع)" : ""}
              </span>
              <strong
                className={
                  invoicePaymentStatus(inv) === "paid"
                    ? "report-line-positive"
                    : invoicePaymentStatus(inv) === "credit"
                      ? "report-line-negative"
                      : ""
                }
                dir="ltr"
              >
                {formatAmount(invoiceTotal(inv))} {currencyLabel(inv.currencyCode)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
