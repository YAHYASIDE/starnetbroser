"use client";

import { FormEvent, useMemo, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { CategoryPicker } from "@/components/CategoryPicker";
import { AmountRow, francSource, SourceSelect, sourceOf, sourceToFields, storedAmount, typedAmount } from "@/components/MyMoney";
import {
  addBusinessCategory,
  addBusinessExpense,
  businessCategoryOf,
  deleteBusinessExpense,
  editBusinessExpense,
  myShare,
  removeBusinessCategory,
  saveBusinessExpenses,
  saveBusinessTree,
  splitShares,
  summarizeBusinessExpenses,
  syncBusinessCash,
  syncBusinessRepShares,
  type BusinessExpense,
  type BusinessExpenseInput,
  type BusinessExpenseList,
} from "@/lib/businessExpenses";
import { loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { categoryPath } from "@/lib/categoryTree";
import type { ExpenseCategory } from "@/lib/categoryTree";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { monthLabel } from "@/lib/monthClosing";
import { loadRepSettlements, saveRepSettlements, type Representative } from "@/lib/repStore";
import type { RatesFromUsd } from "@/lib/reportsView";

type Accounts = { id: string; name: string; icon: string; currencyCode?: string; method?: string }[];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function label(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function money(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency)
    .filter(([, v]) => v > 0)
    .map(([code, v]) => `${formatAmount(Math.round(v * 100) / 100)} ${label(code)}`);
  return parts.length ? parts.join(" + ") : "0";
}

/**
 * 📉 «خسائر ومصاريف العمل» (his Oct 30 2026 ask, a tab of «حسابي»): pick the kind (خسائر / مصاريف and their items, his
 * own added by long press), the amount, where the money left from, and who carries it - me and / or the reps chosen,
 * in equal shares (lib/businessExpenses.ts). A rep's share comes off his profit; my share is in the reports' «الصافي».
 */
export function BusinessExpensesTab({
  accounts,
  reps,
  rates,
  expenses,
  tree,
  onChange,
}: {
  accounts: Accounts;
  reps: Representative[];
  rates: RatesFromUsd;
  expenses: BusinessExpenseList;
  tree: ExpenseCategory[];
  onChange: (expenses: BusinessExpenseList, tree: ExpenseCategory[]) => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [form, setForm] = useState<{ categoryId: string; editing?: BusinessExpense } | null>(null);
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((i) => new Date(now.getFullYear(), now.getMonth() - i, 15).toISOString().slice(0, 7));
  }, []);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const sum = summarizeBusinessExpenses(expenses, from, to);
  const rows = expenses
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => (b.date !== a.date ? (b.date < a.date ? -1 : 1) : b.createdAt < a.createdAt ? -1 : 1));
  const repName = (id: string) => reps.find((r) => r.id === id)?.name ?? "مندوب";

  function lockedRates(): Record<string, number> | undefined {
    const out: Record<string, number> = {};
    for (const [code, v] of Object.entries(rates)) if (typeof v === "number" && v > 0) out[code] = v;
    return Object.keys(out).length ? out : undefined;
  }

  /** The record, its cash-out and the reps' shares saved together. */
  function save(list: BusinessExpenseList, expense: BusinessExpense | null, removedId?: string) {
    saveCashEntries(syncBusinessCash(loadCashEntries(), expense, removedId));
    saveRepSettlements(syncBusinessRepShares(loadRepSettlements(), expense, lockedRates(), removedId));
    saveBusinessExpenses(list);
    onChange(list, tree);
    setForm(null);
  }

  return (
    <section className="section report-tab-panel expenses-tab business-expenses" data-tour="business-expenses">
      <div className="expenses-totals">
        <div>
          <small>{monthLabel(month)} - الكل</small>
          <strong>
            <bdi dir="ltr">{money(sum.total)}</bdi>
          </strong>
        </div>
        <div>
          <small>عليك أنت</small>
          <strong>
            <bdi dir="ltr">{money(sum.mine)}</bdi>
          </strong>
        </div>
      </div>
      {Object.keys(sum.byRep).length > 0 && (
        <ul className="business-rep-shares">
          {Object.entries(sum.byRep).map(([id, byCurrency]) => (
            <li key={id}>
              🤝 {repName(id)}: <bdi dir="ltr">{money(byCurrency)}</bdi> <small>من ربحه</small>
            </li>
          ))}
        </ul>
      )}

      <CategoryPicker
        label="سجّل خسارة أو مصروفًا"
        tree={tree}
        onPick={(id) => setForm({ categoryId: id })}
        onAdd={(name, icon, parentId) => {
          const result = addBusinessCategory(tree, name, icon, parentId);
          if (!result.ok) return result.message;
          saveBusinessTree(result.list);
          onChange(expenses, result.list);
          return null;
        }}
        onRemove={(id) => {
          const next = removeBusinessCategory(tree, id);
          saveBusinessTree(next);
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

      {rows.length === 0 ? (
        <p className="party-empty">لا خسائر ولا مصاريف عمل في {monthLabel(month)}. المس نوعًا لتسجّل.</p>
      ) : (
        <ul className="expenses-list">
          {rows.map((e) => {
            const c = businessCategoryOf(e.categoryId, tree);
            const who = [...(myShare(e) > 0 ? ["أنت"] : []), ...e.shares.map((s) => repName(s.repId))].join(" + ");
            return (
              <li key={e.id}>
                <button type="button" className="expenses-row" onClick={() => setForm({ categoryId: e.categoryId, editing: e })}>
                  <span aria-hidden="true">{c.icon}</span>
                  <span className="expenses-row-main">
                    <strong>{e.note || e.categoryName}</strong>
                    <small>
                      <bdi dir="ltr">{e.date.slice(5)}</bdi>
                      {e.fromCash ? " · 💵 الكاش" : ""}
                      {e.accountId ? ` · ${accounts.find((a) => a.id === e.accountId)?.name ?? "🏦"}` : ""}
                      {!e.fromCash && !e.accountId ? " · لم يتحرك مال" : ""}
                      {` · ${who}`}
                    </small>
                  </span>
                  <bdi dir="ltr" className="expenses-row-amount">
                    {formatAmount(e.amount)} {label(e.currencyCode)}
                  </bdi>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <PartySheet title={`${businessCategoryOf(form.categoryId, tree).icon} ${categoryPath(tree, form.categoryId) || businessCategoryOf(form.categoryId, tree).name}`} onClose={() => setForm(null)}>
          <BusinessExpenseForm
            accounts={accounts}
            reps={reps}
            categoryId={form.categoryId}
            categoryName={businessCategoryOf(form.categoryId, tree).name}
            editing={form.editing}
            lastCurrency={expenses[expenses.length - 1]?.currencyCode}
            onSave={(input) => {
              const result = form.editing ? editBusinessExpense(expenses, form.editing.id, input) : addBusinessExpense(expenses, input);
              if (!result.ok) return result.message;
              save(result.list, result.expense);
              return null;
            }}
            onDelete={
              form.editing
                ? () => {
                    if (!window.confirm("حذف هذا المصروف؟ يُحذف معه نصيب المندوبين وما خرج من الكاش.")) return;
                    save(deleteBusinessExpense(expenses, form.editing!.id), null, form.editing!.id);
                  }
                : undefined
            }
          />
        </PartySheet>
      )}
    </section>
  );
}

function BusinessExpenseForm({
  accounts,
  reps,
  categoryId,
  categoryName,
  editing,
  lastCurrency,
  onSave,
  onDelete,
}: {
  accounts: Accounts;
  reps: Representative[];
  categoryId: string;
  categoryName: string;
  editing?: BusinessExpense;
  lastCurrency?: string;
  onSave: (input: BusinessExpenseInput) => string | null;
  onDelete?: () => void;
}) {
  const [source, setSource] = useState(editing ? sourceOf(editing.fromCash, editing.accountId) : "cash");
  const [amount, setAmount] = useState(editing ? typedAmount(francSource(accounts, source), editing.amount) : "");
  const [currency, setCurrency] = useState(editing?.currencyCode ?? lastCurrency ?? "MRU");
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? "");
  const [includeMe, setIncludeMe] = useState(editing?.includeMe ?? true);
  const [repIds, setRepIds] = useState<string[]>(editing?.shares.map((s) => s.repId) ?? []);
  const [error, setError] = useState<string | null>(null);
  const franc = francSource(accounts, source);
  const stored = storedAmount(franc, amount, currency);
  const preview = stored.amount > 0 && (includeMe || repIds.length > 0) ? splitShares(stored.amount, includeMe, repIds) : null;

  function toggleRep(id: string) {
    setRepIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const { viaCash, accountId } = sourceToFields(source);
    setError(
      onSave({
        categoryId: editing?.categoryId ?? categoryId,
        categoryName: editing?.categoryName ?? categoryName,
        ...stored,
        date,
        note,
        fromCash: viaCash,
        accountId,
        includeMe,
        repIds,
      }),
    );
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <AmountRow amount={amount} onAmount={setAmount} currency={currency} onCurrency={setCurrency} franc={franc} autoFocus={!editing} />
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري) - مثلًا اسم الجهاز أو الإعلان" />
      <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      <SourceSelect value={source} onChange={setSource} accounts={accounts} label="من أين خرج المال؟" />

      <fieldset className="business-who" data-tour="business-who">
        <legend>من يتحمّله؟ (بالتساوي)</legend>
        <label className="business-who-chip">
          <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
          <span>👤 أنا</span>
        </label>
        {reps.map((r) => (
          <label key={r.id} className="business-who-chip">
            <input type="checkbox" checked={repIds.includes(r.id)} onChange={() => toggleRep(r.id)} />
            <span>🤝 {r.name}</span>
          </label>
        ))}
        {reps.length > 1 && (
          <button
            type="button"
            className="text-action"
            onClick={() => setRepIds(repIds.length === reps.length ? [] : reps.map((r) => r.id))}
          >
            {repIds.length === reps.length ? "إلغاء كل المندوبين" : "كل المندوبين"}
          </button>
        )}
      </fieldset>
      {preview && (
        <p className="settings-hint business-split">
          {preview.me > 0 && (
            <>
              عليك <bdi dir="ltr">{formatAmount(preview.me)}</bdi> {label(stored.currencyCode)}
            </>
          )}
          {preview.shares.map((s) => (
            <span key={s.repId}>
              {" · "}
              {reps.find((r) => r.id === s.repId)?.name}: <bdi dir="ltr">{formatAmount(s.amount)}</bdi> {label(stored.currencyCode)} من ربحه
            </span>
          ))}
        </p>
      )}
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
