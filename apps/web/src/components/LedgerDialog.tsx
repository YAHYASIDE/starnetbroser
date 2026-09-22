"use client";

import { FormEvent, useState } from "react";
import {
  computeBalanceByCurrency,
  createLedgerEntry,
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerCurrency,
  LedgerEntry,
  LedgerEntryKind,
  PAYMENT_METHODS,
  PaymentMethod,
  removeEntry,
  sortEntriesNewestFirst,
} from "@/lib/ledgerStore";

interface Props {
  accountName: string;
  entries: LedgerEntry[];
  onClose: () => void;
  onChange: (entries: LedgerEntry[]) => void;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  nita: "نيتا",
  bankily: "بنكيلي",
  sedad: "سداد",
  orange: "أورانج موني",
};

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(amount: number, currency: LedgerCurrency): string {
  return `${amount.toFixed(2)} ${LEDGER_CURRENCY_LABELS[currency]}`;
}

export function LedgerDialog({ accountName, entries, onClose, onChange }: Props) {
  const [kind, setKind] = useState<LedgerEntryKind>("debit");
  const [currency, setCurrency] = useState<LedgerCurrency>("USD");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("nita");
  const [date, setDate] = useState(todayDateInputValue());
  const [formError, setFormError] = useState<string | null>(null);

  const balances = computeBalanceByCurrency(entries);
  const sorted = sortEntriesNewestFirst(entries);
  const balanceRows = LEDGER_CURRENCIES.map((c) => ({ currency: c, balance: balances[c] })).filter(
    (row) => row.balance !== undefined,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    setFormError(null);
    const entry = createLedgerEntry({
      kind,
      amount: parsedAmount,
      currency,
      note,
      email,
      paymentMethod: kind === "credit" ? paymentMethod : undefined,
      date,
    });
    onChange([...entries, entry]);
    setAmount("");
    setNote("");
    setEmail("");
  }

  function deleteEntry(entryId: string) {
    if (!window.confirm("هل تريد حذف هذه الحركة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    onChange(removeEntry(entries, entryId));
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog ledger-dialog" role="dialog" aria-modal="true" aria-labelledby="ledger-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="ledger-dialog-title">حساب الزبون - {accountName}</h2>
            <p>سجل محلي لما يدين به الزبون لك أو له من رصيد - منفصل عن الرصيد المستحق لـ Starlink</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <div className="ledger-balance-rows">
          {balanceRows.length === 0 ? (
            <div className="ledger-balance-row">
              <span>الرصيد الحالي</span>
              <span className="badge badge-green">لا يوجد مستحق</span>
            </div>
          ) : (
            balanceRows.map(({ currency: c, balance }) => (
              <div className="ledger-balance-row" key={c}>
                <span>الرصيد ({LEDGER_CURRENCY_LABELS[c]})</span>
                {balance! > 0 ? (
                  <span className="badge badge-red">عليه {formatMoney(balance!, c)}</span>
                ) : (
                  <span className="badge badge-green">له {formatMoney(-balance!, c)}</span>
                )}
              </div>
            ))
          )}
        </div>

        <form className="ledger-entry-form" onSubmit={submit}>
          <select className="search-input" value={kind} onChange={(e) => setKind(e.target.value as LedgerEntryKind)}>
            <option value="debit">عليه</option>
            <option value="credit">له</option>
          </select>
          <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}>
            {LEDGER_CURRENCIES.map((c) => (
              <option key={c} value={c}>{LEDGER_CURRENCY_LABELS[c]}</option>
            ))}
          </select>
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
          <input
            className="search-input"
            type="date"
            dir="ltr"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {kind === "credit" && (
            <select
              className="search-input ledger-payment-method-input"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          )}
          <input
            className="search-input ledger-note-input"
            type="text"
            placeholder="ملاحظة (اختياري)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <input
            className="search-input ledger-email-input"
            type="email"
            dir="ltr"
            placeholder="البريد الإلكتروني (اختياري)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
          <button className="dialog-primary" type="submit">إضافة حركة</button>
        </form>

        <ul className="ledger-entry-list">
          {sorted.length === 0 && <li className="ledger-entry-empty">لا توجد حركات بعد</li>}
          {sorted.map((entry) => (
            <li key={entry.id} className="ledger-entry-row">
              <div className="ledger-entry-row-top">
                <span className={`badge ${entry.kind === "debit" ? "badge-red" : "badge-green"}`}>
                  {entry.kind === "debit" ? "عليه" : "له"}
                </span>
                <span className="ledger-entry-amount" dir="ltr">{formatMoney(entry.amount, entry.currency)}</span>
                <span className="ledger-entry-date" dir="ltr">{entry.date}</span>
                <button
                  className="ledger-entry-delete"
                  type="button"
                  onClick={() => deleteEntry(entry.id)}
                  aria-label="حذف الحركة"
                  title="حذف الحركة"
                >
                  ×
                </button>
              </div>
              {(entry.note || entry.email || entry.paymentMethod) && (
                <div className="ledger-entry-row-bottom">
                  {entry.paymentMethod && <span className="ledger-entry-method">{PAYMENT_METHOD_LABELS[entry.paymentMethod]}</span>}
                  {entry.note && <span className="ledger-entry-note">{entry.note}</span>}
                  {entry.email && <span className="ledger-entry-email" dir="ltr">{entry.email}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="dialog-actions form-wide">
          <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
        </div>
      </section>
    </div>
  );
}
