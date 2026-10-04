"use client";

import { FormEvent, useEffect, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { monthLabel } from "@/lib/monthClosing";
import {
  allIncomeCategories,
  debtRemaining,
  firstRecurringMonth,
  incomeCategoryOf,
  type DebtBook,
  type DebtInput,
  type IncomeInput,
  type IncomeList,
  type IncomeRecord,
  type PersonalDebt,
  type RecurringInput,
  type RecurringList,
} from "@/lib/myMoney";
import { allCategories, categoryOf, summarizeExpenses, type ExpenseCategory } from "@/lib/personalExpenses";
import type { RatesFromUsd } from "@/lib/reportsView";

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

export function money(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency)
    .filter(([, v]) => v > 0)
    .map(([code, v]) => `${formatAmount(Math.round(v * 100) / 100)} ${currencyLabel(code)}`);
  return parts.length ? parts.join(" + ") : "0";
}

function CurrencySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <select className="search-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="العملة">
      {LEDGER_CURRENCIES.map((code) => (
        <option key={code} value={code}>
          {currencyLabel(code)}
        </option>
      ))}
    </select>
  );
}

function AmountInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input
      className="search-input"
      type="text"
      lang="en"
      dir="ltr"
      inputMode="decimal"
      placeholder="المبلغ"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const toNumber = (v: string) => Number(v.replace(",", "."));

// ---- 💵 الدخل ----

export function IncomeTab({
  month,
  incomes,
  custom,
  rates,
  openNew,
  onOpened,
  onSave,
  onDelete,
  onAddCategory,
}: {
  month: string;
  incomes: IncomeList;
  custom: ExpenseCategory[];
  rates: RatesFromUsd;
  /** Set by the floating "+": a new income right away, once (then onOpened). */
  openNew: boolean;
  onOpened: () => void;
  onSave: (input: IncomeInput, editingId?: string) => string | null;
  onDelete: (income: IncomeRecord) => void;
  onAddCategory: (name: string, icon: string) => string | null;
}) {
  const [form, setForm] = useState<{ categoryId: string; editing?: IncomeRecord } | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const categories = allIncomeCategories(custom);
  useEffect(() => {
    if (!openNew) return;
    setForm({ categoryId: categories[0]?.id ?? "other" });
    onOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew]);
  const summary = summarizeExpenses(incomes, `${month}-01`, `${month}-31`, rates);
  const list = incomes
    .filter((e) => e.date.slice(0, 7) === month)
    .sort((a, b) => (b.date !== a.date ? (b.date < a.date ? -1 : 1) : b.createdAt < a.createdAt ? -1 : 1));

  return (
    <section className="section report-tab-panel expenses-tab">
      <div className="expenses-totals money-income-total">
        <div className="money-box-in">
          <small>دخل {monthLabel(month)}</small>
          <strong>
            <bdi dir="ltr">{money(summary.byCurrency)}</bdi>
          </strong>
        </div>
      </div>

      <div className="expenses-cats" role="group" aria-label="سجّل دخلاً">
        {categories.map((c) => (
          <button key={c.id} type="button" className="expenses-cat" onClick={() => setForm({ categoryId: c.id })}>
            <span aria-hidden="true">{c.icon}</span>
            <small>{c.name}</small>
          </button>
        ))}
        <button type="button" className="expenses-cat expenses-cat-new" onClick={() => setAddingCategory(true)}>
          <span aria-hidden="true">🏷️</span>
          <small>قسم جديد</small>
        </button>
      </div>

      {list.length === 0 ? (
        <p className="party-empty">لا دخل في {monthLabel(month)}. المس قسماً لتسجّل.</p>
      ) : (
        <ul className="expenses-list">
          {list.map((e) => {
            const c = incomeCategoryOf(e.categoryId, custom);
            return (
              <li key={e.id}>
                <button type="button" className="expenses-row" onClick={() => setForm({ categoryId: e.categoryId, editing: e })}>
                  <span aria-hidden="true">{c.icon}</span>
                  <span className="expenses-row-main">
                    <strong>{e.note || c.name}</strong>
                    <small>
                      <bdi dir="ltr">{e.date.slice(5)}</bdi>
                      {e.toCash ? " · 💵 الصندوق" : ""}
                      {e.recurringId ? " · 🔁 شهري" : ""}
                    </small>
                  </span>
                  <bdi dir="ltr" className="expenses-row-amount money-in">
                    +{formatAmount(e.amount)} {currencyLabel(e.currencyCode)}
                  </bdi>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <PartySheet title={`${incomeCategoryOf(form.categoryId, custom).icon} ${incomeCategoryOf(form.categoryId, custom).name}`} onClose={() => setForm(null)}>
          <IncomeForm
            categoryId={form.categoryId}
            categories={categories}
            editing={form.editing}
            lastCurrency={incomes[incomes.length - 1]?.currencyCode}
            onSave={(input) => {
              const message = onSave(input, form.editing?.id);
              if (!message) setForm(null);
              return message;
            }}
            onDelete={
              form.editing
                ? () => {
                    if (!window.confirm("حذف هذا الدخل؟")) return;
                    onDelete(form.editing!);
                    setForm(null);
                  }
                : undefined
            }
          />
        </PartySheet>
      )}

      {addingCategory && (
        <PartySheet title="🏷️ قسم دخل جديد" onClose={() => setAddingCategory(false)}>
          <CategoryForm
            onSave={(name, icon) => {
              const message = onAddCategory(name, icon);
              if (!message) setAddingCategory(false);
              return message;
            }}
          />
        </PartySheet>
      )}
    </section>
  );
}

function IncomeForm({
  categoryId,
  categories,
  editing,
  lastCurrency,
  onSave,
  onDelete,
}: {
  categoryId: string;
  categories: ExpenseCategory[];
  editing?: IncomeRecord;
  lastCurrency?: string;
  onSave: (input: IncomeInput) => string | null;
  onDelete?: () => void;
}) {
  const [category, setCategory] = useState(editing?.categoryId ?? categoryId);
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [currency, setCurrency] = useState(editing?.currencyCode ?? lastCurrency ?? "MRU");
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? "");
  const [toCash, setToCash] = useState(editing?.toCash ?? true);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onSave({ categoryId: category, amount: toNumber(amount), currencyCode: currency, date, note, toCash }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <div className="expenses-amount-row">
        <AmountInput value={amount} onChange={setAmount} autoFocus={!editing} />
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
      <div className="expenses-amount-row">
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="القسم">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={toCash} onChange={(e) => setToCash(e.target.checked)} />
        <span>💵 دخل إلى الصندوق</span>
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

export function CategoryForm({ onSave }: { onSave: (name: string, icon: string) => string | null }) {
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
        <input className="search-input expenses-icon-input" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="الأيقونة" />
        <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم القسم" autoFocus />
      </div>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit" disabled={!name.trim()}>
        إضافة
      </button>
    </form>
  );
}

// ---- 🔁 الشهري ----

export function RecurringSection({
  kind,
  rules,
  incomeCustom,
  expenseCustom,
  onAdd,
  onDelete,
}: {
  kind: "income" | "expense";
  rules: RecurringList;
  incomeCustom: ExpenseCategory[];
  expenseCustom: ExpenseCategory[];
  onAdd: (input: RecurringInput) => string | null;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const mine = rules.filter((r) => r.kind === kind);
  const categoryName = (id: string) => (kind === "income" ? incomeCategoryOf(id, incomeCustom) : categoryOf(id, expenseCustom));
  return (
    <div className="report-card money-recurring">
      <div className="report-card-head">
        <h3>🔁 {kind === "income" ? "دخل شهري (الراتب…)" : "مصروف شهري (الإيجار…)"}</h3>
        <button type="button" className="party-action money-recurring-add" onClick={() => setAdding(true)}>
          ➕ أضف
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="settings-hint">
          {kind === "income" ? "سجّل راتبك مرة واحدة فيُضاف وحده كل شهر في يومه." : "سجّل الإيجار أو أي مصروف ثابت فيُضاف وحده كل شهر."}
        </p>
      ) : (
        <ul className="money-recurring-list">
          {mine.map((r) => {
            const c = categoryName(r.categoryId);
            return (
              <li key={r.id}>
                <span>
                  {c.icon} {r.note || c.name} · يوم <bdi dir="ltr">{r.day}</bdi>
                </span>
                <bdi dir="ltr">{`${formatAmount(r.amount)} ${currencyLabel(r.currencyCode)}`}</bdi>
                <button
                  type="button"
                  className="dialog-close"
                  aria-label="إيقاف"
                  onClick={() => {
                    if (window.confirm("إيقاف هذا الشهري؟ ما سُجّل منه يبقى.")) onDelete(r.id);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <PartySheet title={kind === "income" ? "🔁 دخل شهري" : "🔁 مصروف شهري"} onClose={() => setAdding(false)}>
          <RecurringForm
            kind={kind}
            categories={kind === "income" ? allIncomeCategories(incomeCustom) : allCategories(expenseCustom)}
            onSave={(input) => {
              const message = onAdd(input);
              if (!message) setAdding(false);
              return message;
            }}
          />
        </PartySheet>
      )}
    </div>
  );
}

function RecurringForm({
  kind,
  categories,
  onSave,
}: {
  kind: "income" | "expense";
  categories: ExpenseCategory[];
  onSave: (input: RecurringInput) => string | null;
}) {
  const [category, setCategory] = useState(categories[0]?.id ?? "other");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MRU");
  const [day, setDay] = useState(Math.min(28, Number(today().slice(8, 10))));
  const [note, setNote] = useState("");
  const [viaCash, setViaCash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const first = `${firstRecurringMonth(today(), day)}-${String(day).padStart(2, "0")}`;
  return (
    <form
      className="party-balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ kind, categoryId: category, amount: toNumber(amount), currencyCode: currency, day, note, viaCash }));
      }}
    >
      <select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="القسم">
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>
      <div className="expenses-amount-row">
        <AmountInput value={amount} onChange={setAmount} autoFocus />
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>
      <label className="tool-field">
        <span>يوم الشهر</span>
        <select className="search-input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={viaCash} onChange={(e) => setViaCash(e.target.checked)} />
        <span>{kind === "income" ? "💵 يدخل الصندوق" : "💵 من الصندوق"}</span>
      </label>
      <p className="settings-hint">
        يُسجَّل وحده يوم <bdi dir="ltr">{day}</bdi> من كل شهر - أول مرة <bdi dir="ltr">{first}</bdi>. تستطيع تعديل أو حذف أي شهر.
      </p>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit" disabled={!amount}>
        حفظ
      </button>
    </form>
  );
}

// ---- 🤝 الديون ----

export function DebtsTab({
  book,
  totals,
  openNew,
  onOpened,
  onAdd,
  onPay,
  onDeleteDebt,
  onDeletePayment,
}: {
  book: DebtBook;
  totals: { lent: Record<string, number>; borrowed: Record<string, number> };
  openNew: boolean;
  onOpened: () => void;
  onAdd: (input: DebtInput) => string | null;
  onPay: (debt: PersonalDebt, amount: number, date: string, viaCash: boolean) => string | null;
  onDeleteDebt: (debt: PersonalDebt) => void;
  onDeletePayment: (paymentId: string) => void;
}) {
  const [adding, setAdding] = useState<"lent" | "borrowed" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!openNew) return;
    setAdding("lent");
    onOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew]);
  const open = book.debts.find((d) => d.id === openId) ?? null;
  const sorted = [...book.debts].sort((a, b) => {
    const left = (d: PersonalDebt) => (debtRemaining(book, d.id) > 0 ? 0 : 1);
    return left(a) - left(b) || (b.date < a.date ? -1 : b.date > a.date ? 1 : 0);
  });

  return (
    <section className="section report-tab-panel expenses-tab">
      <div className="expenses-totals">
        <div className="money-box-in">
          <small>🤝 لك عند الناس</small>
          <strong className="money-in">
            <bdi dir="ltr">{money(totals.lent)}</bdi>
          </strong>
        </div>
        <div>
          <small>↩ عليك للناس</small>
          <strong className="money-out">
            <bdi dir="ltr">{money(totals.borrowed)}</bdi>
          </strong>
        </div>
      </div>
      <div className="settings-actions money-debt-actions">
        <button type="button" className="dialog-primary" onClick={() => setAdding("lent")}>
          ➕ سلّفت شخصاً
        </button>
        <button type="button" className="btn-icon" onClick={() => setAdding("borrowed")}>
          ➖ استلفت من شخص
        </button>
      </div>
      <p className="settings-hint">ديون الزبائن في حساباتهم (تُحسب في «كل ما تملك»). هنا ديونك أنت مع الناس.</p>

      {sorted.length === 0 ? (
        <p className="party-empty">لا ديون مسجّلة.</p>
      ) : (
        <ul className="expenses-list">
          {sorted.map((d) => {
            const left = debtRemaining(book, d.id);
            return (
              <li key={d.id}>
                <button type="button" className={`expenses-row${left <= 0 ? " money-debt-done" : ""}`} onClick={() => setOpenId(d.id)}>
                  <span aria-hidden="true">{d.kind === "lent" ? "🤝" : "↩"}</span>
                  <span className="expenses-row-main">
                    <strong>{d.person}</strong>
                    <small>
                      {d.kind === "lent" ? "سلّفته" : "استلفت منه"} · <bdi dir="ltr">{d.date}</bdi>
                      {left <= 0 ? " · ✓ مسدَّد" : ""}
                    </small>
                  </span>
                  <bdi dir="ltr" className={`expenses-row-amount ${d.kind === "lent" ? "money-in" : "money-out"}`}>
                    {`${formatAmount(left)} ${currencyLabel(d.currencyCode)}`}
                  </bdi>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <PartySheet title={adding === "lent" ? "🤝 سلّفت شخصاً" : "↩ استلفت من شخص"} onClose={() => setAdding(null)}>
          <DebtForm
            kind={adding}
            onSave={(input) => {
              const message = onAdd(input);
              if (!message) setAdding(null);
              return message;
            }}
          />
        </PartySheet>
      )}

      {open && (
        <PartySheet title={`${open.kind === "lent" ? "🤝" : "↩"} ${open.person}`} onClose={() => setOpenId(null)}>
          <DebtDetail
            book={book}
            debt={open}
            onPay={(amount, date, viaCash) => onPay(open, amount, date, viaCash)}
            onDeletePayment={onDeletePayment}
            onDelete={() => {
              if (!window.confirm(`حذف دين ${open.person} وكل ما رُدّ منه؟`)) return;
              onDeleteDebt(open);
              setOpenId(null);
            }}
          />
        </PartySheet>
      )}
    </section>
  );
}

function DebtForm({ kind, onSave }: { kind: "lent" | "borrowed"; onSave: (input: DebtInput) => string | null }) {
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MRU");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [viaCash, setViaCash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="party-balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ kind, person, amount: toNumber(amount), currencyCode: currency, date, note, viaCash }));
      }}
    >
      <input className="search-input" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="الاسم" autoFocus />
      <div className="expenses-amount-row">
        <AmountInput value={amount} onChange={setAmount} />
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>
      <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={viaCash} onChange={(e) => setViaCash(e.target.checked)} />
        <span>{kind === "lent" ? "💵 خرج من الصندوق" : "💵 دخل الصندوق"}</span>
      </label>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit" disabled={!amount || !person.trim()}>
        سجّل
      </button>
    </form>
  );
}

function DebtDetail({
  book,
  debt,
  onPay,
  onDeletePayment,
  onDelete,
}: {
  book: DebtBook;
  debt: PersonalDebt;
  onPay: (amount: number, date: string, viaCash: boolean) => string | null;
  onDeletePayment: (paymentId: string) => void;
  onDelete: () => void;
}) {
  const left = debtRemaining(book, debt.id);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [viaCash, setViaCash] = useState(debt.viaCash);
  const [error, setError] = useState<string | null>(null);
  const payments = book.payments.filter((p) => p.debtId === debt.id);
  return (
    <div className="party-balance-form">
      <div className="expenses-totals">
        <div>
          <small>{debt.kind === "lent" ? "سلّفته" : "استلفت"}</small>
          <strong>
            <bdi dir="ltr">{`${formatAmount(debt.amount)} ${currencyLabel(debt.currencyCode)}`}</bdi>
          </strong>
        </div>
        <div>
          <small>الباقي</small>
          <strong className={debt.kind === "lent" ? "money-in" : "money-out"}>
            <bdi dir="ltr">{`${formatAmount(left)} ${currencyLabel(debt.currencyCode)}`}</bdi>
          </strong>
        </div>
      </div>
      {debt.note && <p className="settings-hint">{debt.note}</p>}
      {payments.length > 0 && (
        <ul className="money-recurring-list">
          {payments.map((p) => (
            <li key={p.id}>
              <span>
                ✓ رُدّ <bdi dir="ltr">{p.date}</bdi>
              </span>
              <bdi dir="ltr">{`${formatAmount(p.amount)} ${currencyLabel(debt.currencyCode)}`}</bdi>
              <button
                type="button"
                className="dialog-close"
                aria-label="حذف"
                onClick={() => {
                  if (window.confirm("حذف هذا الردّ؟")) onDeletePayment(p.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {left > 0 && (
        <form
          className="party-balance-form"
          onSubmit={(e) => {
            e.preventDefault();
            const message = onPay(toNumber(amount), date, viaCash);
            setError(message);
            if (!message) setAmount("");
          }}
        >
          <div className="expenses-amount-row">
            <AmountInput value={amount} onChange={setAmount} />
            <button type="button" className="btn-icon" onClick={() => setAmount(String(left))}>
              الكل
            </button>
          </div>
          <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="ledger-d-toggle party-cash-toggle">
            <input type="checkbox" checked={viaCash} onChange={(e) => setViaCash(e.target.checked)} />
            <span>{debt.kind === "lent" ? "💵 دخل الصندوق" : "💵 خرج من الصندوق"}</span>
          </label>
          {error && <div className="account-card-alert ledger-form-error">{error}</div>}
          <button className="dialog-primary" type="submit" disabled={!amount}>
            {debt.kind === "lent" ? "✓ ردّ لي" : "✓ رددت له"}
          </button>
        </form>
      )}
      <button type="button" className="dialog-danger" onClick={onDelete}>
        حذف الدين
      </button>
    </div>
  );
}
