"use client";

import { FormEvent, useMemo, useState } from "react";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import {
  CashClosingList,
  CashEntry,
  CashEntryKind,
  CashEntryList,
  CashSourceKind,
  computeCashBalanceByCurrency,
  computeCashDaySummary,
  deleteCashClosing,
  deleteCashEntry,
  listCashEntries,
  recordCashClosing,
  recordCashEntry,
} from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

const SOURCE_LABELS: Record<CashSourceKind, string> = {
  "device-payment": "دفعة جهاز",
  "party-balance": "رصيد زبون/مورد",
  "rep-settlement": "تسوية مندوب",
  closing: "إغلاق يومي",
};

function sourceBadge(entry: CashEntry): string | null {
  if (entry.invoiceId) return "من فاتورة";
  return entry.sourceKind ? SOURCE_LABELS[entry.sourceKind] : null;
}

interface Props {
  entries: CashEntryList;
  onChange: (entries: CashEntryList) => void;
  closings: CashClosingList;
  /** A closing both records itself and (for any difference) posts to the log - saved together. */
  onChangeClosings: (entries: CashEntryList, closings: CashClosingList) => void;
}

/** الصندوق والمصاريف: every manually-recorded amount in or out, plus every amount auto-posted
 * from an invoice's own paidAmount (see store/page.tsx's onChange wiring) - and the running
 * balance that log implies, per currency. An invoice-linked entry is shown the same as any other
 * here (it really did move cash), but is excluded from "مصاريف" when computing net profit
 * elsewhere (cashStore.ts's listStandaloneCashEntries), since it's already reflected in cost of
 * goods / receivables. */
export function CashRegisterSection({ entries, onChange, closings, onChangeClosings }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<CashEntryKind>("in");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState<LedgerCurrency>("MRU");
  const [date, setDate] = useState(todayDateInputValue());
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showClosing, setShowClosing] = useState(false);

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

  function closeDay(date: string, counted: Record<string, number>, closingNote: string): string | null {
    const result = recordCashClosing(entries, closings, date, counted, closingNote);
    if (!result.ok) return result.message;
    onChangeClosings(result.cash, result.closings);
    setShowClosing(false);
    return null;
  }

  function undoClosing(closingId: string) {
    if (!window.confirm("هل تريد إلغاء هذا الإغلاق؟ ستُحذف معه حركة العجز/الزيادة التي سجّلها.")) return;
    const result = deleteCashClosing(entries, closings, closingId);
    onChangeClosings(result.cash, result.closings);
  }

  const recentClosings = useMemo(
    () => [...closings].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1)).slice(0, 7),
    [closings],
  );

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
            <button type="button" className="btn-icon cash-close-btn" onClick={() => setShowClosing((v) => !v)}>
              {showClosing ? "إلغاء" : "🔒 إغلاق اليوم"}
            </button>
            <button type="button" className="btn-icon" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "إلغاء" : "+ حركة جديدة"}
            </button>
          </div>

          {showClosing && <ClosingForm entries={entries} onSubmit={closeDay} />}

          {recentClosings.length > 0 && (
            <ul className="cash-closing-list">
              {recentClosings.map((closing) => (
                <li key={closing.id} className="cash-closing-row">
                  <div className="cash-closing-head">
                    <strong>🔒 إغلاق {closing.date}</strong>
                    <button type="button" className="ledger-entry-delete" onClick={() => undoClosing(closing.id)} aria-label="إلغاء الإغلاق" title="إلغاء الإغلاق">
                      ×
                    </button>
                  </div>
                  {closing.lines.map((line) => {
                    const matched = Math.abs(line.difference) < 0.005;
                    return (
                      <div key={line.currencyCode} className={`cash-closing-line ${matched ? "cash-closing-ok" : line.difference > 0 ? "cash-closing-plus" : "cash-closing-minus"}`}>
                        <span>{currencyLabel(line.currencyCode)}</span>
                        <span dir="ltr">
                          {formatAmount(line.counted)} / {formatAmount(line.expected)}
                        </span>
                        <strong>
                          {matched ? "✅ مطابق" : line.difference > 0 ? "زيادة " : "عجز "}
                          {!matched && <bdi dir="ltr">{formatAmount(Math.abs(line.difference))}</bdi>}
                        </strong>
                      </div>
                    );
                  })}
                  {closing.note && <div className="ledger-entry-note">{closing.note}</div>}
                </li>
              ))}
            </ul>
          )}

          {showForm && (
            <form className="auth-form store-item-form" onSubmit={submit}>
              <div className="store-item-form-row">
                <select className="search-input" value={kind} onChange={(e) => setKind(e.target.value as CashEntryKind)}>
                  <option value="in">دخول (إيراد)</option>
                  <option value="out">خروج (مصروف)</option>
                </select>
                <input className="search-input" type="date" lang="en-GB" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="store-item-form-row">
                <input
                  className="search-input"
                  type="number" lang="en"
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
                  {!entry.invoiceId && !entry.sourceId && (
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
                {(entry.category || entry.note || sourceBadge(entry)) && (
                  <div className="ledger-entry-row-bottom">
                    {entry.category && <span className="ledger-entry-method">{entry.category}</span>}
                    {entry.note && <span className="ledger-entry-note">{entry.note}</span>}
                    {sourceBadge(entry) && <span className="badge badge-gray">{sourceBadge(entry)}</span>}
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

interface ClosingFormProps {
  entries: CashEntryList;
  onSubmit: (date: string, counted: Record<string, number>, note: string) => string | null;
}

/** إغلاق اليوم: per currency, the day's opening/in/out and the balance the log expects, next to
 * an input for what was actually counted in the till. */
function ClosingForm({ entries, onSubmit }: ClosingFormProps) {
  const [date, setDate] = useState(todayDateInputValue());
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => computeCashDaySummary(entries, date), [entries, date]);
  const codes = Object.keys(summary).length > 0 ? Object.keys(summary) : ["MRU"];

  function submit(event: FormEvent) {
    event.preventDefault();
    const values: Record<string, number> = {};
    for (const code of codes) {
      const raw = counted[code];
      if (raw === undefined || raw === "") continue;
      values[code] = Number(raw);
    }
    setError(onSubmit(date, values, note));
  }

  return (
    <form className="auth-form cash-closing-form" onSubmit={submit}>
      <label className="form-field">
        <span>اليوم</span>
        <input className="search-input" type="date" lang="en-GB" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {codes.map((code) => {
        const s = summary[code] ?? { opening: 0, in: 0, out: 0, expected: 0 };
        const raw = counted[code] ?? "";
        const diff = raw === "" ? null : Number(raw) - s.expected;
        return (
          <div key={code} className="cash-closing-card">
            <div className="cash-closing-card-title">{currencyLabel(code)}</div>
            <div className="cash-closing-grid">
              <span>رصيد أول اليوم</span>
              <bdi dir="ltr">{formatAmount(s.opening)}</bdi>
              <span>دخل اليوم</span>
              <bdi dir="ltr">+{formatAmount(s.in)}</bdi>
              <span>خرج اليوم</span>
              <bdi dir="ltr">-{formatAmount(s.out)}</bdi>
              <strong>المفروض في الصندوق</strong>
              <strong dir="ltr">{formatAmount(s.expected)}</strong>
            </div>
            <input
              className="search-input"
              type="number" lang="en"
              min="0"
              step="0.01"
              dir="ltr"
              inputMode="decimal"
              placeholder="المبلغ الفعلي بعد العدّ"
              aria-label={`المبلغ الفعلي ${currencyLabel(code)}`}
              value={raw}
              onChange={(e) => setCounted((c) => ({ ...c, [code]: e.target.value }))}
            />
            {diff !== null && Number.isFinite(diff) && (
              <div className={`cash-closing-line ${Math.abs(diff) < 0.005 ? "cash-closing-ok" : diff > 0 ? "cash-closing-plus" : "cash-closing-minus"}`}>
                <strong>
                  {Math.abs(diff) < 0.005 ? "✅ مطابق" : diff > 0 ? "زيادة " : "عجز "}
                  {Math.abs(diff) >= 0.005 && <bdi dir="ltr">{formatAmount(Math.abs(diff))}</bdi>}
                </strong>
              </div>
            )}
          </div>
        );
      })}
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit">
        حفظ الإغلاق
      </button>
    </form>
  );
}
