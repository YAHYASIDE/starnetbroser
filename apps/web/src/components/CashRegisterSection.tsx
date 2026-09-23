"use client";

import { FormEvent, useMemo, useState } from "react";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import {
  CashEntryKind,
  CashEntryList,
  computeCashBalanceByCurrency,
  deleteCashEntry,
  listCashEntries,
  recordCashEntry,
} from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

interface Props {
  entries: CashEntryList;
  onChange: (entries: CashEntryList) => void;
}

/** الصندوق والمصاريف: every manually-recorded amount in or out, plus every amount auto-posted
 * from an invoice's own paidAmount (see store/page.tsx's onChange wiring) - and the running
 * balance that log implies, per currency. An invoice-linked entry is shown the same as any other
 * here (it really did move cash), but is excluded from "مصاريف" when computing net profit
 * elsewhere (cashStore.ts's listStandaloneCashEntries), since it's already reflected in cost of
 * goods / receivables. */
export function CashRegisterSection({ entries, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<CashEntryKind>("in");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState<LedgerCurrency>("MRU");
  const [date, setDate] = useState(todayDateInputValue());
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const balance = useMemo(() => computeCashBalanceByCurrency(entries), [entries]);
  const balanceCurrencies = Object.keys(balance);
  const sorted = useMemo(() => listCashEntries(entries), [entries]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = recordCashEntry(entries, { kind, amount: Number(amount), currencyCode, date, category, note });
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setFormError(null);
    onChange(result.entries);
    setAmount("");
    setCategory("");
    setNote("");
    setShowForm(false);
  }

  function remove(entryId: string) {
    if (!window.confirm("هل تريد حذف هذه الحركة من الصندوق؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    onChange(deleteCashEntry(entries, entryId));
  }

  return (
    <section className="section">
      <button type="button" className="report-collapse-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        الصندوق والمصاريف {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <>
          {balanceCurrencies.length > 0 && (
            <div className="store-summary-row">
              <div className="store-summary-tile">
                <span className="store-summary-label">الرصيد المتوفر</span>
                <div className="store-summary-value-stack">
                  {balanceCurrencies.map((c) => (
                    <strong key={c} dir="ltr">
                      {formatAmount(balance[c]!)} {currencyLabel(c)}
                    </strong>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="store-items-header">
            <span />
            <button type="button" className="btn-icon" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "إلغاء" : "+ حركة جديدة"}
            </button>
          </div>

          {showForm && (
            <form className="auth-form store-item-form" onSubmit={submit}>
              <div className="store-item-form-row">
                <select className="search-input" value={kind} onChange={(e) => setKind(e.target.value as CashEntryKind)}>
                  <option value="in">دخول (إيراد)</option>
                  <option value="out">خروج (مصروف)</option>
                </select>
                <input className="search-input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="store-item-form-row">
                <input
                  className="search-input"
                  type="number"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  placeholder="المبلغ"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <select className="search-input" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value as LedgerCurrency)}>
                  {LEDGER_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {LEDGER_CURRENCY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className="search-input"
                placeholder="التصنيف (مثال: إيجار، كهرباء)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <input
                className="search-input ledger-note-input"
                placeholder="ملاحظة (اختياري)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
              <button className="dialog-primary" type="submit">
                حفظ الحركة
              </button>
            </form>
          )}

          {sorted.length === 0 && !showForm && <p className="empty-state">لا توجد حركات في الصندوق بعد.</p>}

          <ul className="ledger-entry-list">
            {sorted.map((entry) => (
              <li key={entry.id} className="ledger-entry-row">
                <div className="ledger-entry-row-top">
                  <span className={`badge ${entry.kind === "in" ? "badge-green" : "badge-red"}`}>
                    {entry.kind === "in" ? "دخول" : "خروج"}
                  </span>
                  <span className="ledger-entry-amount" dir="ltr">
                    {formatAmount(entry.amount)} {currencyLabel(entry.currencyCode)}
                  </span>
                  <span className="ledger-entry-date" dir="ltr">
                    {entry.date}
                  </span>
                  {!entry.invoiceId && (
                    <button
                      className="ledger-entry-delete"
                      type="button"
                      onClick={() => remove(entry.id)}
                      aria-label="حذف الحركة"
                      title="حذف الحركة"
                    >
                      ×
                    </button>
                  )}
                </div>
                {(entry.category || entry.note || entry.invoiceId) && (
                  <div className="ledger-entry-row-bottom">
                    {entry.category && <span className="ledger-entry-method">{entry.category}</span>}
                    {entry.note && <span className="ledger-entry-note">{entry.note}</span>}
                    {entry.invoiceId && <span className="badge badge-gray">من فاتورة</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
