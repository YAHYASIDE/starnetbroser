"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { loadCashEntries, removeLinkedCashEntries, saveCashEntries } from "@/lib/cashStore";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { monthLabel } from "@/lib/monthClosing";
import { CategoryPicker } from "@/components/CategoryPicker";
import { categoryPath, groupIdOf } from "@/lib/categoryTree";
import {
  addCustomCategory,
  addPersonalExpense,
  allCategories,
  categoryOf,
  deletePersonalExpense,
  editPersonalExpense,
  removeCategory,
  saveExpenseTree,
  savePersonalExpenses,
  summarizeExpenses,
  syncExpenseCash,
  type ExpenseCategory,
  type PersonalExpense,
  type PersonalExpenseList,
} from "@/lib/personalExpenses";
import type { RatesFromUsd } from "@/lib/reportsView";
import { francBadge, isFrancAccount } from "@/lib/payCurrency";
import { AmountRow, francSource, SourceSelect, sourceOf, sourceToFields, storedAmount, typedAmount } from "@/components/MyMoney";

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
 * «💵 من الكاش» (on by default) also takes it out of الكاش. Today / this month at the top, the
 * month by category, and the latest expenses (tap one to edit or delete).
 */
export function PersonalExpensesTab({
  accounts = [],
  openNew = false,
  onOpened,
  expenses,
  custom,
  rates,
  onChange,
}: {
  /** My banks / wallets (moneyAccounts.ts) - an expense can be paid from one instead of الكاش. */
  accounts?: { id: string; name: string; icon: string; currencyCode?: string; method?: string }[];
  /** Set by a floating «+» / a shortcut: opens a new expense right away, once (then onOpened). */
  openNew?: boolean;
  onOpened?: () => void;
  expenses: PersonalExpenseList;
  custom: ExpenseCategory[];
  rates: RatesFromUsd;
  onChange: (expenses: PersonalExpenseList, custom: ExpenseCategory[]) => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [form, setForm] = useState<{ categoryId: string; editing?: PersonalExpense } | null>(null);
  const categories = allCategories(custom);
  useEffect(() => {
    if (!openNew) return;
    setForm({ categoryId: allCategories(custom)[0]?.id ?? "other" });
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew]);
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((i) => new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString().slice(0, 7));
  }, []);

  const day = summarizeExpenses(expenses, today(), today(), rates);
  // The month by group (فواتير = الكهرباء + الغاز + …).
  const monthSummary = summarizeExpenses(
    expenses.map((e) => ({ ...e, categoryId: groupIdOf(custom, e.categoryId) })),
    `${month}-01`,
    `${month}-31`,
    rates,
  );
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

      <CategoryPicker
        label="سجّل مصروفاً"
        tree={custom}
        onPick={(id) => setForm({ categoryId: id })}
        onAdd={(name, icon, parentId) => {
          const result = addCustomCategory(custom, name, icon, parentId);
          if (!result.ok) return result.message;
          saveExpenseTree(result.list);
          onChange(expenses, result.list);
          return null;
        }}
        onRemove={(id) => {
          const next = removeCategory(custom, id);
          saveExpenseTree(next);
          onChange(expenses, next);
        }}
      />

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
                    <strong>{e.note || categoryPath(custom, e.categoryId) || c.name}</strong>
                    <small>
                      <bdi dir="ltr">{e.date.slice(5)}</bdi>
                      {e.fromCash ? " · 💵 الكاش" : ""}
                      {e.accountId ? ` · ${accounts.find((a) => a.id === e.accountId)?.name ?? "🏦"}` : ""}
                      {francBadge(e, isFrancAccount(accounts.find((a) => a.id === e.accountId))) && (
                        <span className="franc-badge"> · {francBadge(e, true)}</span>
                      )}
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
        <PartySheet title={`${categoryOf(form.categoryId, custom).icon} ${categoryPath(custom, form.categoryId) || categoryOf(form.categoryId, custom).name}`} onClose={() => setForm(null)}>
          <ExpenseForm
            accounts={accounts}
            categoryId={form.categoryId}
            categories={categories.map((c) => ({ ...c, name: categoryPath(custom, c.id) }))}
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

    </section>
  );
}

function ExpenseForm({
  accounts,
  categoryId,
  categories,
  editing,
  lastCurrency,
  onSave,
  onDelete,
}: {
  accounts: { id: string; name: string; icon: string; currencyCode?: string; method?: string }[];
  categoryId: string;
  categories: ExpenseCategory[];
  editing?: PersonalExpense;
  lastCurrency?: string;
  onSave: (input: { categoryId: string; amount: number; currencyCode: string; date: string; note?: string; fromCash: boolean; accountId?: string }) => string | null;
  onDelete?: () => void;
}) {
  const [category, setCategory] = useState(editing?.categoryId ?? categoryId);
  const [source, setSource] = useState(editing ? sourceOf(editing.fromCash, editing.accountId) : "cash");
  // 🟠 من أورانج / نيتا: typed in فرانك, kept in سيفا ÷5.
  const [amount, setAmount] = useState(editing ? typedAmount(francSource(accounts, source), editing.amount) : "");
  const [currency, setCurrency] = useState(editing?.currencyCode ?? lastCurrency ?? "MRU");
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const franc = francSource(accounts, source);

  function submit(event: FormEvent) {
    event.preventDefault();
    const { viaCash, accountId } = sourceToFields(source);
    setError(onSave({ categoryId: category, ...storedAmount(franc, amount, currency), date, note, fromCash: viaCash, accountId }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <AmountRow amount={amount} onAmount={setAmount} currency={currency} onCurrency={setCurrency} franc={franc} autoFocus={!editing} />
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
      <SourceSelect value={source} onChange={setSource} accounts={accounts} label="دُفع من" />
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
