"use client";

import { FormEvent, useEffect, useState } from "react";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { CategoryPicker } from "@/components/CategoryPicker";
import { categoryPath, groupIdOf } from "@/lib/categoryTree";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, PAYMENT_METHOD_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { FrancHint, FrancUnit } from "./FrancHint";
import { francBadge, francToSifa, isFrancAccount, sifaToFranc } from "@/lib/payCurrency";
import { accountDisplayUnit, toAccountAmount, toDisplayAmount, type AccountInput, type AccountsBook, type MoneyAccount } from "@/lib/moneyAccounts";
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
  type Wealth,
  type WealthLine,
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

/** Where the money went / came from: الكاش, one of my banks / wallets, or neither. */
export type MoneySourceValue = string;

export function sourceOf(viaCash: boolean, accountId?: string): MoneySourceValue {
  return accountId ?? (viaCash ? "cash" : "none");
}

export function sourceToFields(value: MoneySourceValue): { viaCash: boolean; accountId?: string } {
  if (value === "cash") return { viaCash: true };
  if (value === "none") return { viaCash: false };
  return { viaCash: false, accountId: value };
}

export function SourceSelect({
  value,
  onChange,
  accounts,
  label,
}: {
  value: MoneySourceValue;
  onChange: (value: MoneySourceValue) => void;
  accounts: { id: string; name: string; icon: string; currencyCode?: string; method?: string }[];
  label: string;
}) {
  return (
    <label className="tool-field money-source">
      <span>{label}</span>
      <select className="search-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="cash">💵 كاش</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.icon} {a.name}
            {isFrancAccount(a) ? " · بالفرانك" : ""}
          </option>
        ))}
        <option value="none">— لا هذا ولا ذاك</option>
      </select>
    </label>
  );
}

type SourceAccounts = { id: string; name: string; icon: string; currencyCode?: string; method?: string }[];

/** 🟠 Money in or out of أورانج / نيتا is typed in فرانك and kept in سيفا ÷5 (payCurrency.ts). */
export function francSource(accounts: SourceAccounts, source: MoneySourceValue): boolean {
  return isFrancAccount(accounts.find((a) => a.id === source));
}

/** The amount typed for a record: فرانك ÷5 → سيفا when it goes through أورانج / نيتا. */
export function storedAmount(franc: boolean, typed: string, currency: string): { amount: number; currencyCode: string } {
  const value = toNumber(typed);
  return franc ? { amount: francToSifa(value), currencyCode: "SIFA" } : { amount: value, currencyCode: currency };
}

/** A saved amount as it is typed again (×5 فرانك for أورانج / نيتا). */
export function typedAmount(franc: boolean, amount: number): string {
  return String(franc ? sifaToFranc(amount) : amount);
}

/** Amount + currency, or amount + «🟠 فرانك» and its note when the money goes through أورانج / نيتا. */
export function AmountRow({
  amount,
  onAmount,
  currency,
  onCurrency,
  franc,
  autoFocus,
}: {
  amount: string;
  onAmount: (v: string) => void;
  currency: string;
  onCurrency: (code: string) => void;
  franc: boolean;
  autoFocus?: boolean;
}) {
  return (
    <>
      <div className="expenses-amount-row">
        <AmountInput value={amount} onChange={onAmount} autoFocus={autoFocus} />
        {franc ? <FrancUnit /> : <CurrencySelect value={currency} onChange={onCurrency} />}
      </div>
      {franc && <FrancHint amount={amount} />}
    </>
  );
}

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
  onRemoveCategory,
  accounts = [],
}: {
  accounts?: SourceAccounts;
  month: string;
  incomes: IncomeList;
  custom: ExpenseCategory[];
  rates: RatesFromUsd;
  /** Set by the floating "+": a new income right away, once (then onOpened). */
  openNew: boolean;
  onOpened: () => void;
  onSave: (input: IncomeInput, editingId?: string) => string | null;
  onDelete: (income: IncomeRecord) => void;
  onAddCategory: (name: string, icon: string, parentId?: string) => string | null;
  onRemoveCategory: (id: string) => void;
}) {
  const [form, setForm] = useState<{ categoryId: string; editing?: IncomeRecord } | null>(null);
  const categories = allIncomeCategories(custom);
  useEffect(() => {
    if (!openNew) return;
    setForm({ categoryId: categories[0]?.id ?? "other" });
    onOpened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew]);
  const summary = summarizeExpenses(
    incomes.map((e) => ({ ...e, categoryId: groupIdOf(custom, e.categoryId) })),
    `${month}-01`,
    `${month}-31`,
    rates,
  );
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

      <CategoryPicker label="سجّل دخلاً" tree={custom} onPick={(id) => setForm({ categoryId: id })} onAdd={onAddCategory} onRemove={onRemoveCategory} />

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
                    <strong>{e.note || categoryPath(custom, e.categoryId) || c.name}</strong>
                    <small>
                      <bdi dir="ltr">{e.date.slice(5)}</bdi>
                      {e.toCash ? " · 💵 الكاش" : ""}
                      {e.accountId ? ` · ${accounts.find((a) => a.id === e.accountId)?.name ?? "🏦"}` : ""}
                      {francBadge(e, isFrancAccount(accounts.find((a) => a.id === e.accountId))) && (
                        <span className="franc-badge"> · {francBadge(e, true)}</span>
                      )}
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
        <PartySheet title={`${incomeCategoryOf(form.categoryId, custom).icon} ${categoryPath(custom, form.categoryId) || incomeCategoryOf(form.categoryId, custom).name}`} onClose={() => setForm(null)}>
          <IncomeForm
            accounts={accounts}
            categoryId={form.categoryId}
            categories={categories.map((c) => ({ ...c, name: categoryPath(custom, c.id) || c.name }))}
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

    </section>
  );
}

function IncomeForm({
  accounts,
  categoryId,
  categories,
  editing,
  lastCurrency,
  onSave,
  onDelete,
}: {
  accounts: SourceAccounts;
  categoryId: string;
  categories: ExpenseCategory[];
  editing?: IncomeRecord;
  lastCurrency?: string;
  onSave: (input: IncomeInput) => string | null;
  onDelete?: () => void;
}) {
  const [category, setCategory] = useState(editing?.categoryId ?? categoryId);
  const [source, setSource] = useState(editing ? sourceOf(editing.toCash, editing.accountId) : "cash");
  const [amount, setAmount] = useState(editing ? typedAmount(francSource(accounts, source), editing.amount) : "");
  const [currency, setCurrency] = useState(editing?.currencyCode ?? lastCurrency ?? "MRU");
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const franc = francSource(accounts, source);

  function submit(event: FormEvent) {
    event.preventDefault();
    const { viaCash, accountId } = sourceToFields(source);
    setError(onSave({ categoryId: category, ...storedAmount(franc, amount, currency), date, note, toCash: viaCash, accountId }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <AmountRow amount={amount} onAmount={setAmount} currency={currency} onCurrency={setCurrency} franc={franc} autoFocus={!editing} />
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
      <SourceSelect value={source} onChange={setSource} accounts={accounts} label="دخل إلى" />
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

// ---- 🔁 الشهري ----

export function RecurringSection({
  kind,
  rules,
  incomeCustom,
  expenseCustom,
  onAdd,
  onDelete,
  accounts = [],
}: {
  accounts?: SourceAccounts;
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
            accounts={accounts}
            kind={kind}
            categories={(kind === "income" ? allIncomeCategories(incomeCustom) : allCategories(expenseCustom)).map((c) => ({
              ...c,
              name: categoryPath(kind === "income" ? incomeCustom : expenseCustom, c.id) || c.name,
            }))}
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
  accounts,
  kind,
  categories,
  onSave,
}: {
  accounts: SourceAccounts;
  kind: "income" | "expense";
  categories: ExpenseCategory[];
  onSave: (input: RecurringInput) => string | null;
}) {
  const [category, setCategory] = useState(categories[0]?.id ?? "other");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MRU");
  const [day, setDay] = useState(Math.min(28, Number(today().slice(8, 10))));
  const [note, setNote] = useState("");
  const [source, setSource] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const first = `${firstRecurringMonth(today(), day)}-${String(day).padStart(2, "0")}`;
  return (
    <form
      className="party-balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ kind, categoryId: category, ...storedAmount(francSource(accounts, source), amount, currency), day, note, ...sourceToFields(source) }));
      }}
    >
      <select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="القسم">
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>
      <AmountRow amount={amount} onAmount={setAmount} currency={currency} onCurrency={setCurrency} franc={francSource(accounts, source)} autoFocus />
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
      <SourceSelect value={source} onChange={setSource} accounts={accounts} label={kind === "income" ? "يدخل إلى" : "يُدفع من"} />
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
  accounts = [],
}: {
  accounts?: SourceAccounts;
  book: DebtBook;
  totals: { lent: Record<string, number>; borrowed: Record<string, number> };
  openNew: boolean;
  onOpened: () => void;
  onAdd: (input: DebtInput) => string | null;
  onPay: (debt: PersonalDebt, amount: number, date: string, viaCash: boolean, accountId?: string) => string | null;
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
            accounts={accounts}
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
            accounts={accounts}
            book={book}
            debt={open}
            onPay={(amount, date, viaCash, accountId) => onPay(open, amount, date, viaCash, accountId)}
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

function DebtForm({ accounts, kind, onSave }: { accounts: SourceAccounts; kind: "lent" | "borrowed"; onSave: (input: DebtInput) => string | null }) {
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MRU");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [source, setSource] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="party-balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ kind, person, amount: toNumber(amount), currencyCode: currency, date, note, ...sourceToFields(source) }));
      }}
    >
      <input className="search-input" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="الاسم" autoFocus />
      <div className="expenses-amount-row">
        <AmountInput value={amount} onChange={setAmount} />
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>
      <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
      <SourceSelect value={source} onChange={setSource} accounts={accounts} label={kind === "lent" ? "خرج من" : "دخل إلى"} />
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit" disabled={!amount || !person.trim()}>
        سجّل
      </button>
    </form>
  );
}

function DebtDetail({
  accounts,
  book,
  debt,
  onPay,
  onDeletePayment,
  onDelete,
}: {
  accounts: SourceAccounts;
  book: DebtBook;
  debt: PersonalDebt;
  onPay: (amount: number, date: string, viaCash: boolean, accountId?: string) => string | null;
  onDeletePayment: (paymentId: string) => void;
  onDelete: () => void;
}) {
  const left = debtRemaining(book, debt.id);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [source, setSource] = useState(sourceOf(debt.viaCash, debt.accountId));
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
            const { viaCash, accountId } = sourceToFields(source);
            const message = onPay(toNumber(amount), date, viaCash, accountId);
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
          <SourceSelect value={source} onChange={setSource} accounts={accounts} label={debt.kind === "lent" ? "دخل إلى" : "خرج من"} />
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

// ---- 💰 the whole picture ----

function mruText(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(value)))}`;
}

const GROUPS: { kind: "have" | "owed" | "owe"; title: string }[] = [
  { kind: "have", title: "عندك" },
  { kind: "owe", title: "عليك" },
  { kind: "owed", title: "لك عند الآخرين" },
];

export function WealthCard({ wealth, onOpen }: { wealth: Wealth; onOpen: (line: WealthLine) => void }) {
  return (
    <div className={`net-hero money-hero money-hero-worth${wealth.inHandMru < 0 ? " is-loss" : ""}`}>
      <div className="money-two">
        <div>
          <span className="net-hero-label">في يدك الآن</span>
          <strong className={`net-hero-value${wealth.inHandMru < 0 ? " money-out" : ""}`}>
            <bdi dir="ltr">{mruText(wealth.inHandMru)}</bdi> <small>أوقية</small>
          </strong>
          <small className="money-two-hint">الكاش + البنوك + المحافظ − ما عليك</small>
        </div>
        <div>
          <span className="net-hero-label">كل ما تملك</span>
          <strong className="net-hero-value">
            <bdi dir="ltr">{mruText(wealth.totalMru)}</bdi> <small>أوقية</small>
          </strong>
          <small className="money-two-hint">+ ما لك عند الزبائن والمندوبين والناس</small>
        </div>
      </div>
      {GROUPS.map((group) => (
        <div key={group.kind} className="money-group">
          <span className="money-group-title">{group.title}</span>
          <ul className="money-lines">
            {wealth.lines
              .filter((l) => l.kind === group.kind)
              .map((l) => (
                <li key={l.key}>
                  <button type="button" className="money-line-button" onClick={() => onOpen(l)}>
                    <span>
                      {l.icon ? `${l.icon} ` : ""}
                      {l.label}
                      {l.items.length > 1 ? <small> ({l.items.length})</small> : null}
                    </span>
                    {l.native ? (
                      <small className="money-line-native">
                        <bdi dir="ltr">{l.franc ? francMoney(l.native) : signedMoney(l.native)}</bdi>
                      </small>
                    ) : null}
                    <bdi dir="ltr" className={l.mru === 0 ? undefined : l.kind === "owe" ? "money-out" : "money-in"}>
                      {`${l.kind === "owe" && l.mru ? "-" : ""}${mruText(l.mru)}`}
                    </bdi>
                    <span className="money-line-go" aria-hidden="true">
                      ‹
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A line's detail: who / which account, how much, in its own currencies. */
export function WealthLineDetail({ line }: { line: WealthLine }) {
  if (line.items.length === 0) return <p className="party-empty">لا شيء هنا الآن.</p>;
  return (
    <ul className="money-recurring-list">
      {line.items.map((item, i) => (
        <li key={`${item.name}-${i}`}>
          <span>{item.name}</span>
          <bdi dir="ltr">{signedMoney(item.byCurrency)}</bdi>
        </li>
      ))}
    </ul>
  );
}

function signedMoney(byCurrency: Record<string, number>): string {
  const parts = Object.entries(byCurrency)
    .filter(([, v]) => Math.abs(v) > 0.0001)
    .map(([code, v]) => `${v < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(v) * 100) / 100)} ${currencyLabel(code)}`);
  return parts.length ? parts.join(" + ") : "0";
}

/** 🟠 أورانج / نيتا: their سيفا shown as فرانك (×5), other currencies as they are. */
function francMoney(byCurrency: Record<string, number>): string {
  return signedMoney(Object.fromEntries(Object.entries(byCurrency).map(([code, v]) => (code === "SIFA" ? ["فرانك", sifaToFranc(v)] : [code, v]))));
}

/** The account's balance, shown in its display unit when it has one (Orange/Nita: «فرانك»); the
 * account-currency amount is converted, any other currency stays as it is. */
function accountBalanceText(account: MoneyAccount, byCurrency: Record<string, number>): string {
  const unit = accountDisplayUnit(account);
  if (!unit) return signedMoney(byCurrency);
  const parts = Object.entries(byCurrency)
    .filter(([, v]) => Math.abs(v) > 0.0001)
    .map(([code, v]) => {
      const shown = code === account.currencyCode ? toDisplayAmount(v, unit) : v;
      const label = code === account.currencyCode ? unit.label : currencyLabel(code);
      return `${shown < 0 ? "-" : ""}${formatAmount(Math.round(Math.abs(shown) * 100) / 100)} ${label}`;
    });
  return parts.length ? parts.join(" + ") : "0";
}

// ---- 🏦 my banks / wallets ----

export function AccountsManager({
  book,
  balances,
  onAdd,
  onCorrect,
  onDelete,
  onDeleteTransfer,
  onStatement,
}: {
  book: AccountsBook;
  balances: Record<string, Record<string, number>>;
  /** 📄 Tapping an account opens its «كشف حساب». */
  onStatement?: (accountId: string) => void;
  onAdd: (input: AccountInput) => string | null;
  onCorrect: (account: MoneyAccount, actual: number) => string | null;
  onDelete: (account: MoneyAccount) => void;
  onDeleteTransfer: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const nameOf = (id: string) => (id === "cash" ? "💵 الكاش" : book.accounts.find((a) => a.id === id)?.name ?? "حساب محذوف");
  const transfers = [...(book.transfers ?? [])].sort((a, b) => (b.date !== a.date ? (b.date < a.date ? -1 : 1) : b.createdAt < a.createdAt ? -1 : 1));
  return (
    <div className="party-balance-form">
      {book.accounts.length > 0 && (
        <ul className="money-recurring-list">
          {book.accounts.map((a) => (
            <li key={a.id} className="money-account-row">
              <button type="button" className="money-account-name" onClick={() => onStatement?.(a.id)} aria-label={`كشف حساب ${a.name}`}>
                {a.icon} {a.name}
                {a.number ? (
                  <small>
                    {" "}
                    · <bdi dir="ltr">{a.number}</bdi>
                  </small>
                ) : null}
                {a.method ? <small> · دفعات «{PAYMENT_METHOD_LABELS[a.method]}» هنا</small> : null}
                {isFrancAccount(a) ? <small className="franc-badge"> · 🟠 بالفرانك (5 فرانك = 1 سيفا)</small> : null}
                {onStatement ? <small className="money-account-statement"> · 📄 كشف الحساب</small> : null}
              </button>
              {a.balanceSet === false ? (
                <>
                  {/* money routed here before its balance was typed (a SIFA payment → «كاش سيفا») */}
                  {Object.values(balances[a.id] ?? {}).some((v) => Math.abs(v) >= 0.005) && (
                    <bdi dir="ltr">{accountBalanceText(a, balances[a.id] ?? {})}</bdi>
                  )}
                  <button type="button" className="dialog-primary money-set-balance" onClick={() => setCorrecting(a.id)}>
                    اكتب الرصيد
                  </button>
                </>
              ) : (
                <>
                  <bdi dir="ltr">{accountBalanceText(a, balances[a.id] ?? {})}</bdi>
                  <button type="button" className="btn-icon" onClick={() => setCorrecting(correcting === a.id ? null : a.id)}>
                    ✎
                  </button>
                </>
              )}
              {correcting === a.id && (
                <CorrectForm
                  account={a}
                  onSave={(actual) => {
                    const message = onCorrect(a, actual);
                    if (!message) setCorrecting(null);
                    return message;
                  }}
                  onDelete={() => {
                    if (window.confirm(`حذف حساب «${a.name}»؟ ما سُجّل عليه يبقى في سجلاته.`)) onDelete(a);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {transfers.length > 0 && (
        <>
          <strong className="money-group-title">🔁 تحويلات بين حساباتي</strong>
          <ul className="money-recurring-list">
            {transfers.slice(0, 30).map((t) => (
              <li key={t.id} className="money-account-row">
                <span>
                  من {nameOf(t.fromAccountId)} إلى {nameOf(t.toAccountId)}
                  <small>
                    {" "}
                    · <bdi dir="ltr">{t.date}</bdi>
                    {t.note ? ` · ${t.note}` : ""}
                  </small>
                </span>
                <bdi dir="ltr">
                  {formatAmount(t.amount)} {currencyLabel(t.currencyCode)}
                </bdi>
                {francBadge(t, [t.fromAccountId, t.toAccountId].some((id) => isFrancAccount(book.accounts.find((a) => a.id === id)))) && (
                  <small className="franc-badge">{francBadge(t, true)}</small>
                )}
                <button
                  type="button"
                  className="btn-icon"
                  aria-label="حذف التحويل"
                  onClick={() => {
                    if (window.confirm("حذف هذا التحويل؟ يرجع الرصيدان كما كانا.")) onDeleteTransfer(t.id);
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {adding ? (
        <AccountForm
          onSave={(input) => {
            const message = onAdd(input);
            if (!message) setAdding(false);
            return message;
          }}
        />
      ) : (
        <button type="button" className="btn-icon" onClick={() => setAdding(true)}>
          ➕ حساب آخر
        </button>
      )}
      <p className="settings-hint">
        اكتب الرصيد الذي يظهر في التطبيق الآن مرة واحدة. بعدها يُحسب وحده: دفعات الزبائن بطريقته، وما تسجّله «إلى/من» هذا الحساب. إن اختلف عن التطبيق اضغط ✎ واكتب الرصيد الحقيقي.
      </p>
    </div>
  );
}

function AccountForm({ onSave }: { onSave: (input: AccountInput) => string | null }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("MRU");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="party-balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ name, icon: "🏦", currencyCode: currency, openingBalance: toNumber(balance || "0"), openingDate: today() }));
      }}
    >
      <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الحساب / المحفظة" autoFocus />
      <div className="expenses-amount-row">
        <AmountInput value={balance} onChange={setBalance} />
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>
      <small className="settings-hint">الرصيد الحالي كما يظهر في التطبيق</small>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit" disabled={!name.trim()}>
        حفظ الحساب
      </button>
    </form>
  );
}

function CorrectForm({ account, onSave, onDelete }: { account: MoneyAccount; onSave: (actual: number) => string | null; onDelete: () => void }) {
  const [actual, setActual] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Orange/Nita are typed in «فرانك»; convert to the account's currency (سيفا) before saving.
  const unit = accountDisplayUnit(account);
  return (
    <form
      className="party-balance-form money-correct"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave(unit ? toAccountAmount(toNumber(actual), unit) : toNumber(actual)));
      }}
    >
      <div className="expenses-amount-row">
        <AmountInput value={actual} onChange={setActual} autoFocus />
        <button className="dialog-primary" type="submit" disabled={!actual}>
          {account.balanceSet === false ? "حفظ الرصيد" : "تصحيح الرصيد"}
        </button>
      </div>
      <small className="settings-hint">
        الرصيد الحقيقي في {account.name} الآن ({unit ? `${unit.label} · ${unit.perCurrencyUnit} ${unit.label} = 1 ${currencyLabel(account.currencyCode)}` : currencyLabel(account.currencyCode)})
      </small>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button type="button" className="dialog-danger" onClick={onDelete}>
        حذف الحساب
      </button>
    </form>
  );
}
