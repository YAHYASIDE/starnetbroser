"use client";

import { useMemo, useState } from "react";
import { Client } from "@/lib/clientStore";
import { Supplier } from "@/lib/supplierStore";
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
import { formatAmount } from "@/lib/formatAmount";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

interface Props {
  clients: Client[];
  suppliers: Supplier[];
  invoices: InvoiceList;
}

/** حسابات الزبائن والموردين: for every client/supplier who has at least one store invoice, their
 * current balance (what they owe, or what we owe a supplier) computed from invoiceStore.ts, plus
 * a chronological statement of their invoices on demand. Entirely about STORE money - never reads
 * or shows ledgerStore.ts's own per-device Starlink balance, a separate business. */
export function AccountsSection({ clients, suppliers, invoices }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);

  const clientRows = useMemo(
    () =>
      clients
        .map((client) => ({ party: client, balance: computeClientStoreBalance(invoices, client.id) }))
        .filter((row) => Object.keys(row.balance).length > 0),
    [clients, invoices],
  );
  const supplierRows = useMemo(
    () =>
      suppliers
        .map((supplier) => ({ party: supplier, balance: computeSupplierStoreBalance(invoices, supplier.id) }))
        .filter((row) => Object.keys(row.balance).length > 0),
    [suppliers, invoices],
  );

  if (clientRows.length === 0 && supplierRows.length === 0) return null;

  return (
    <section className="section">
      <button type="button" className="report-collapse-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        حسابات الزبائن والموردين {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <>
          {clientRows.length > 0 && (
            <>
              <h2 className="report-section-title">الزبائن</h2>
              <ul className="ledger-entry-list">
                {clientRows.map(({ party, balance }) => (
                  <PartyRow
                    key={party.id}
                    name={party.name}
                    balance={balance}
                    positiveLabel="عليه"
                    negativeLabel="له"
                    isOpen={openPartyId === party.id}
                    onToggle={() => setOpenPartyId(openPartyId === party.id ? null : party.id)}
                    invoices={listInvoicesForClient(invoices, party.id)}
                  />
                ))}
              </ul>
            </>
          )}

          {supplierRows.length > 0 && (
            <>
              <h2 className="report-section-title">الموردون</h2>
              <ul className="ledger-entry-list">
                {supplierRows.map(({ party, balance }) => (
                  <PartyRow
                    key={party.id}
                    name={party.name}
                    balance={balance}
                    positiveLabel="نحن مدينون"
                    negativeLabel="له فائض"
                    isOpen={openPartyId === party.id}
                    onToggle={() => setOpenPartyId(openPartyId === party.id ? null : party.id)}
                    invoices={listInvoicesForSupplier(invoices, party.id)}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

interface PartyRowProps {
  name: string;
  balance: Record<string, number>;
  positiveLabel: string;
  negativeLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  invoices: InvoiceList;
}

function PartyRow({ name, balance, positiveLabel, negativeLabel, isOpen, onToggle, invoices }: PartyRowProps) {
  const currencies = Object.keys(balance);
  return (
    <li className="ledger-entry-row">
      <div className="ledger-entry-row-top">
        <span className="store-item-name">{name}</span>
        <div className="store-summary-value-stack">
          {currencies.map((c) => {
            const amount = balance[c]!;
            const isPositive = amount > 0;
            return (
              <span key={c} className={`badge ${isPositive ? "badge-red" : "badge-green"}`} dir="ltr">
                {isPositive ? positiveLabel : negativeLabel} {formatAmount(Math.abs(amount))} {currencyLabel(c)}
              </span>
            );
          })}
        </div>
        <button type="button" className="text-action" onClick={onToggle}>
          {isOpen ? "إخفاء" : "كشف الحساب"}
        </button>
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
