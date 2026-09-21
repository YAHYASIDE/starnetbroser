"use client";

import { FormEvent, useState } from "react";
import {
  computeBalance,
  createLedgerEntry,
  LedgerEntry,
  LedgerEntryKind,
  removeEntry,
  sortEntriesNewestFirst,
} from "@/lib/ledgerStore";

interface Props {
  accountName: string;
  currency: string;
  entries: LedgerEntry[];
  onClose: () => void;
  onChange: (entries: LedgerEntry[]) => void;
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(amount: number, currency: string): string {
  return `${currency}${amount.toFixed(2)}`;
}

export function LedgerDialog({ accountName, currency, entries, onClose, onChange }: Props) {
  const [kind, setKind] = useState<LedgerEntryKind>("debit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayDateInputValue());
  const [formError, setFormError] = useState<string | null>(null);

  const balance = computeBalance(entries);
  const sorted = sortEntriesNewestFirst(entries);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    setFormError(null);
    const entry = createLedgerEntry(kind, parsedAmount, note, date);
    onChange([...entries, entry]);
    setAmount("");
    setNote("");
  }

  function deleteEntry(entryId: string) {
    if (!window.confirm("هل تريد حذف هذه الحركة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    onChange(removeEntry(entries, entryId));
  }

  const balanceLabel =
    balance > 0
      ? { text: `عليه ${formatMoney(balance, currency)}`, className: "badge-red" }
      : balance < 0
        ? { text: `له ${formatMoney(-balance, currency)}`, className: "badge-green" }
        : { text: "لا يوجد مستحق", className: "badge-green" };

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

        <div className="ledger-balance-row">
          <span>الرصيد الحالي</span>
          <span className={`badge ${balanceLabel.className}`}>{balanceLabel.text}</span>
        </div>

        <form className="ledger-entry-form" onSubmit={submit}>
          <select className="search-input" value={kind} onChange={(e) => setKind(e.target.value as LedgerEntryKind)}>
            <option value="debit">عليه (دين جديد)</option>
            <option value="credit">دفعة منه</option>
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
          <input
            className="search-input ledger-note-input"
            type="text"
            placeholder="ملاحظة (اختياري)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {formError && <div className="account-card-alert ledger-form-error">{formError}</div>}
          <button className="dialog-primary" type="submit">إضافة حركة</button>
        </form>

        <ul className="ledger-entry-list">
          {sorted.length === 0 && <li className="ledger-entry-empty">لا توجد حركات بعد</li>}
          {sorted.map((entry) => (
            <li key={entry.id} className="ledger-entry-row">
              <span className={`badge ${entry.kind === "debit" ? "badge-red" : "badge-green"}`}>
                {entry.kind === "debit" ? "عليه" : "دفعة"}
              </span>
              <span className="ledger-entry-amount" dir="ltr">{formatMoney(entry.amount, currency)}</span>
              <span className="ledger-entry-date" dir="ltr">{entry.date}</span>
              <span className="ledger-entry-note">{entry.note}</span>
              <button
                className="ledger-entry-delete"
                type="button"
                onClick={() => deleteEntry(entry.id)}
                aria-label="حذف الحركة"
                title="حذف الحركة"
              >
                ×
              </button>
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
