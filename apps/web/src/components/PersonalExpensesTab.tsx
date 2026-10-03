"use client";

import { FormEvent, useMemo, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { loadCashEntries, removeLinkedCashEntries, saveCashEntries } from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { monthLabel } from "@/lib/monthClosing";
import {
  addCustomCategory,
  addPersonalExpense,
  allCategories,
  categoryOf,
  deletePersonalExpense,
  editPersonalExpense,
  saveCustomCategories,
  savePersonalExpenses,
  summarizeExpenses,
  syncExpenseCash,
  type ExpenseCategory,
  type PersonalExpense,
  type PersonalExpenseList,
} from "@/lib/personalExpenses";
import type { RatesFromUsd } from "@/lib/reportsView";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency)
    .filter(([, v]) => v > 0)
    .map(([code, v]) => `${formatAmount(Math.round(v * 100) / 100)} ${LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code}`);
  return parts.length ? parts.join(" + ") : "0";
}

/**
 * 🧾 «المصروفات» (Reports tab): the operator's own spending. Tap a category, type the amount, save -
 * «💵 من الصندوق» (on by default) also takes it out of الصندوق. Today / this month at the top, the
 * month by category, and the latest expenses (tap one to edit or delete).
 */
export function PersonalExpensesTab({
  expenses,
  custom,
  rates,
  onChange,
}: {
  expenses: PersonalExpenseList;
  custom: ExpenseCategory[];
  rates: RatesFromUsd;
  onChange: (expenses: PersonalExpenseList, custom: ExpenseCategory[]) => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [form, setForm] = useState<{ categoryId: string; editing?: PersonalExpense } | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const categories = allCategories(custom);
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((i) => new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString().slice(0, 7));
  }, []);

  const day = summarizeExpenses(expenses, today(), today(), rates);
  const monthSummary = summarizeExpenses(expenses, `${month}-01`, `${month}-31`, rates);
  const recent = expenses
    .filter((e) => e.date.slice(0, 7) === month)
    .sort((a, b) => (b.date !== a.date ? (b.date < a.date ? -1 : 1) : b.createdAt < a.createdAt ? -1 : 1));
  const maxMru = Math.max(1, ...monthSummary.byCategory.map((c) => c.mru ?? 0));

  function save(list: PersonalExpenseList, expense: PersonalExpense | null, removedId?: string) {
    let cash = loadCashEntries();
    if (removedId) cash = removeLinkedCashEntries(cash, removedId);
    if (expense) cash = syncExpenseCash(cash, expense, custom);
    saveCashEntries(cash);
    savePersonalExpenses(list);
    onChange(list, custom);
    setForm(null);
  }

  return (
    <section className="section report-tab-panel expenses-tab">
      <div className="expenses-totals">
        <div>
          <small>اليوم</small>
          <strong>
            <bdi dir="ltr">{money(day.byCurrency)}</bdi>
          </strong>
        </div>
        <div>
          <small>{monthLabel(month)}</small>
          <strong>
            <bdi dir="ltr">{money(monthSummary.byCurrency)}</bdi>
          </strong>
        </div>
      </div>

      <div className="expenses-cats" role="group" aria-label="سجّل مصروفاً">
        {categories.map((c) => (
          <button key={c.id} type="button" className="expenses-cat" onClick={() => setForm({ categoryId: c.id })}>
            <span aria-hidden="true">{c.icon}</span>
            <small>{c.name}</small>
          </button>
        ))}
        <button type="button" className="expenses-cat expenses-cat-new" onClick={() => setAddingCategory(true)}>
          <span aria-hidden="true">🏷️</span>
          <small>فئة جديدة</small>
        </button>
      </div>

      <div className="report-period-row">
        {months.map((m) => (
          <button key={m} type="button" className={`report-period-btn${m === month ? " report-period-btn-active" : ""}`} onClick={() => setMonth(m)}>
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {monthSummary.byCategory.length > 0 && (
        <ul className="expenses-bars">
          {monthSummary.byCategory.map((g) => {
            const c = categoryOf(g.categoryId, custom);
            return (
              <li key={g.categoryId}>
                <span className="expenses-bar-name">
                  {c.icon} {c.name} <small>×{g.count}</small>
                </span>
                <bdi dir="ltr">{money(g.byCurrency)}</bdi>
                <span className="expenses-bar" style={{ width: `${Math.round(((g.mru ?? 0) / maxMru) * 100)}%` }} />
              </li>
            );
          })}
        </ul>
      )}

      {recent.length === 0 ? (
        <p className="party-empty">لا مصروفات في {monthLabel(month)}. المس فئة لتسجّل.</p>
      ) : (
        <ul className="expenses-list">
          {recent.map((e) => {
            const c = categoryOf(e.categoryId, custom);
            return (
              <li key={e.id}>
                <button type="button" className="expenses-row" onClick={() => setForm({ categoryId: e.categoryId, editing: e })}>
                  <span aria-hidden="true">{c.icon}</span>
                  <span className="expenses-row-main">
                    <strong>{e.note || c.name}</strong>
                    <small>
                      <bdi dir="ltr">{e.date.slice(5)}</bdi>
                      {e.fromCash ? " · 💵 الصندوق" : ""}
                    </small>
                  </span>
                  <bdi dir="ltr" className="expenses-row-amount">
                    {formatAmount(e.amount)} {LEDGER_CURRENCY_LABELS[e.currencyCode as LedgerCurrency] ?? e.currencyCode}
                  </bdi>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <PartySheet title={`${categoryOf(form.categoryId, custom).icon} ${categoryOf(form.categoryId, custom).name}`} onClose={() => setForm(null)}>
          <ExpenseForm
            categoryId={form.categoryId}
            categories={categories}
            editing={form.editing}
            lastCurrency={expenses[expenses.length - 1]?.currencyCode}
            onSave={(input) => {
              const result = form.editing ? editPersonalExpense(expenses, form.editing.id, input) : addPersonalExpense(expenses, input);
              if (!result.ok) return result.message;
              save(result.list, result.expense);
              return null;
            }}
            onDelete={
              form.editing
                ? () => {
                    if (!window.confirm("حذف هذا المصروف؟")) return;
                    save(deletePersonalExpense(expenses, form.editing!.id), null, form.editing!.id);
                  }
                : undefined
            }
          />
        </PartySheet>
      )}

      {addingCategory && (
        <PartySheet title="🏷️ فئة جديدة" onClose={() => setAddingCategory(false)}>
          <CategoryForm
            onSave={(name, icon) => {
              const result = addCustomCategory(custom, name, icon);
              if (!result.ok) return result.message;
              saveCustomCategories(result.list);
              onChange(expenses, result.list);
              setAddingCategory(false);
              return null;
            }}
          />
        </PartySheet>
      )}
    </section>
  );
}

function ExpenseForm({
  categoryId,
  categories,
  editing,
  lastCurrency,
  onSave,
  onDelete,
}: {
  categoryId: string;
  categories: ExpenseCategory[];
  editing?: PersonalExpense;
  lastCurrency?: string;
  onSave: (input: { categoryId: string; amount: number; currencyCode: string; date: string; note?: string; fromCash: boolean }) => string | null;
  onDelete?: () => void;
}) {
  const [category, setCategory] = useState(editing?.categoryId ?? categoryId);
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [currency, setCurrency] = useState(editing?.currencyCode ?? lastCurrency ?? "MRU");
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? "");
  const [fromCash, setFromCash] = useState(editing?.fromCash ?? true);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSave({ categoryId: category, amount: Number(amount.replace(",", ".")), currencyCode: currency, date, note, fromCash }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <div className="expenses-amount-row">
        <input
          className="search-input"
          type="text"
          lang="en"
          dir="ltr"
          inputMode="decimal"
          placeholder="المبلغ"
          autoFocus={!editing}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="العملة">
          {LEDGER_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {LEDGER_CURRENCY_LABELS[code as LedgerCurrency]}
            </option>
          ))}
        </select>
      </div>
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
      <div className="expenses-amount-row">
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
        {editing && (
          <select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="الفئة">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} />
        <span>💵 من الصندوق</span>
      </label>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!amount}>
          {editing ? "حفظ" : "سجّل"}
        </button>
        {onDelete && (
          <button type="button" className="dialog-danger" onClick={onDelete}>
            حذف
          </button>
        )}
      </div>
    </form>
  );
}

function CategoryForm({ onSave }: { onSave: (name: string, icon: string) => string | null }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="party-balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave(name, icon));
      }}
    >
      <div className="expenses-amount-row">
        <input className="search-input expenses-icon-input" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="الرمز" maxLength={4} />
        <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الفئة (مثلاً: مدرسة)" autoFocus />
      </div>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit" disabled={!name.trim()}>
        إضافة
      </button>
    </form>
  );
}
