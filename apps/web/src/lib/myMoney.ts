/**
 * 💰 «حسابي» - the operator's own money in one place, like a personal finance app: الدخل (salary,
 * bonuses, gifts…), المصروف (personalExpenses.ts), الديون with people (lent / borrowed, repaid
 * bit by bit), monthly rules that record themselves (🔁 the salary, the rent), and two final
 * figures: «يبقى لك هذا الشهر» and «كل ما تملك».
 *
 * Every amount keeps its own currency; أوقية totals are display-only at today's rates. Records
 * taken through الصندوق post a linked cash entry (sourceId = the record's id, removed with it),
 * which the business reports already leave out (listStandaloneCashEntries).
 */

import { recordCashEntry, removeLinkedCashEntries, type CashEntryList } from "./cashStore";
import { addPersonalExpense, type ExpenseCategory, type PersonalExpense } from "./personalExpenses";
import type { AccountFlow } from "./moneyAccounts";
import { sumToMru, type RatesFromUsd } from "./reportsView";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function add(into: Record<string, number>, code: string, amount: number): void {
  into[code] = (into[code] ?? 0) + amount;
}

// ---- 💵 الدخل ----

export const DEFAULT_INCOME_CATEGORIES: ExpenseCategory[] = [
  { id: "salary", icon: "💼", name: "الراتب" },
  { id: "bonus", icon: "🏆", name: "المكافآت" },
  { id: "gift", icon: "🎁", name: "الهدايا" },
  { id: "sales", icon: "🏷️", name: "المبيعات" },
  { id: "extra", icon: "💵", name: "الإضافي" },
  { id: "topup", icon: "📲", name: "إضافة رصيد" },
  { id: "transfer", icon: "💸", name: "تحويل الأموال" },
  { id: "other", icon: "❤️", name: "أخرى" },
];

export function allIncomeCategories(custom: ExpenseCategory[]): ExpenseCategory[] {
  return [...DEFAULT_INCOME_CATEGORIES.filter((c) => c.id !== "other"), ...custom, DEFAULT_INCOME_CATEGORIES.find((c) => c.id === "other")!];
}

export function incomeCategoryOf(id: string, custom: ExpenseCategory[]): ExpenseCategory {
  return allIncomeCategories(custom).find((c) => c.id === id) ?? { id, icon: "💵", name: "دخل" };
}

export function addIncomeCategory(custom: ExpenseCategory[], name: string, icon = "🏷️"): { ok: true; list: ExpenseCategory[] } | { ok: false; message: string } {
  const clean = name.trim();
  if (!clean) return { ok: false, message: "اكتب اسم القسم" };
  if (allIncomeCategories(custom).some((c) => c.name === clean)) return { ok: false, message: "هذا القسم موجود" };
  return { ok: true, list: [...custom, { id: newId("icat"), icon: icon.trim() || "🏷️", name: clean }] };
}

export interface IncomeRecord {
  id: string;
  categoryId: string;
  amount: number;
  currencyCode: string;
  /** yyyy-mm-dd */
  date: string;
  note?: string;
  /** Went into الصندوق - a linked cash-in entry exists with sourceId = id. */
  toCash: boolean;
  createdAt: string;
  /** Created by a monthly rule (🔁). */
  recurringId?: string;
  /** Went into a bank / wallet (moneyAccounts.ts) instead of الصندوق. */
  accountId?: string;
}

export type IncomeList = IncomeRecord[];

export interface IncomeInput {
  categoryId: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  toCash: boolean;
  accountId?: string;
}

export type IncomeResult = { ok: true; list: IncomeList; income: IncomeRecord } | { ok: false; message: string };

export function addIncome(list: IncomeList, input: IncomeInput, now = new Date(), recurringId?: string): IncomeResult {
  if (!input.categoryId) return { ok: false, message: "اختر القسم" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "أدخل المبلغ" };
  if (!DATE_RE.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  const income: IncomeRecord = {
    id: newId("inc"),
    categoryId: input.categoryId,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    toCash: input.toCash && !input.accountId,
    createdAt: now.toISOString(),
    ...(recurringId ? { recurringId } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
  };
  return { ok: true, list: [...list, income], income };
}

/** Same id (its cash entry is re-posted to match), new figures; a 🔁 record stays linked to its rule. */
export function editIncome(list: IncomeList, id: string, input: IncomeInput): IncomeResult {
  const existing = list.find((e) => e.id === id);
  if (!existing) return { ok: false, message: "الدخل غير موجود" };
  const checked = addIncome([], input, new Date(), existing.recurringId);
  if (!checked.ok) return checked;
  const income: IncomeRecord = { ...checked.income, id, createdAt: existing.createdAt };
  return { ok: true, list: list.map((e) => (e.id === id ? income : e)), income };
}

export function deleteIncome(list: IncomeList, id: string): IncomeList {
  return list.filter((e) => e.id !== id);
}

/** The income's الصندوق entry, rebuilt: removed, then posted again only when it went «في الصندوق». */
export function syncIncomeCash(cash: CashEntryList, income: IncomeRecord, custom: ExpenseCategory[]): CashEntryList {
  const without = removeLinkedCashEntries(cash, income.id);
  if (!income.toCash) return without;
  const posted = recordCashEntry(without, {
    kind: "in",
    amount: income.amount,
    currencyCode: income.currencyCode,
    date: income.date,
    category: `دخل شخصي: ${incomeCategoryOf(income.categoryId, custom).name}`,
    ...(income.note ? { note: income.note } : {}),
    sourceId: income.id,
    sourceKind: "personal-income",
  });
  return posted.ok ? posted.entries : without;
}

// ---- 🔁 شهري: the salary, the rent… recorded by themselves ----

export interface RecurringRule {
  id: string;
  kind: "income" | "expense";
  categoryId: string;
  amount: number;
  currencyCode: string;
  /** Day of the month it lands on (1-28, so every month has it). */
  day: number;
  note?: string;
  /** Through الصندوق (income in / expense out). */
  viaCash: boolean;
  /** Through a bank / wallet instead. */
  accountId?: string;
  /** yyyy-mm: the first month it records (its first day on/after the rule was made). */
  startMonth: string;
  /** Months whose record the operator deleted - never recreated. */
  skipped: string[];
  createdAt: string;
}

export type RecurringList = RecurringRule[];

export interface RecurringInput {
  kind: "income" | "expense";
  categoryId: string;
  amount: number;
  currencyCode: string;
  day: number;
  note?: string;
  viaCash: boolean;
  accountId?: string;
}

export type RecurringResult = { ok: true; list: RecurringList; rule: RecurringRule } | { ok: false; message: string };

export function addRecurringRule(list: RecurringList, input: RecurringInput, today: string, now = new Date()): RecurringResult {
  if (!input.categoryId) return { ok: false, message: "اختر القسم" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "أدخل المبلغ" };
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 28) return { ok: false, message: "اختر يوماً من 1 إلى 28" };
  const rule: RecurringRule = {
    id: newId("rec"),
    kind: input.kind,
    categoryId: input.categoryId,
    amount: input.amount,
    currencyCode: input.currencyCode,
    day: input.day,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    viaCash: input.viaCash && !input.accountId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    startMonth: firstRecurringMonth(today, input.day),
    skipped: [],
    createdAt: now.toISOString(),
  };
  return { ok: true, list: [...list, rule], rule };
}

/** The first month a new rule records: this month if its day hasn't passed yet, else the next. */
export function firstRecurringMonth(today: string, day: number): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  if (d <= day) return today.slice(0, 7);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function deleteRecurringRule(list: RecurringList, id: string): RecurringList {
  return list.filter((r) => r.id !== id);
}

/** A 🔁 record the operator deleted: that month stays without it. */
export function skipRecurringMonth(list: RecurringList, ruleId: string, month: string): RecurringList {
  return list.map((r) => (r.id === ruleId && !r.skipped.includes(month) ? { ...r, skipped: [...r.skipped, month] } : r));
}

function monthsFrom(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number) as [number, number];
  const [ey, em] = end.split("-").map(Number) as [number, number];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The records every rule owes up to `today` (its day reached, not yet recorded, not skipped). */
export function dueRecurring(
  rules: RecurringList,
  incomes: IncomeList,
  expenses: PersonalExpense[],
  today: string,
  now = new Date(),
): { incomes: IncomeRecord[]; expenses: PersonalExpense[] } {
  const out = { incomes: [] as IncomeRecord[], expenses: [] as PersonalExpense[] };
  for (const rule of rules) {
    const done = new Set(
      [...incomes, ...expenses].filter((r) => r.recurringId === rule.id).map((r) => r.date.slice(0, 7)),
    );
    for (const month of monthsFrom(rule.startMonth, today.slice(0, 7))) {
      const date = `${month}-${String(rule.day).padStart(2, "0")}`;
      if (date > today || done.has(month) || rule.skipped.includes(month)) continue;
      const input = { categoryId: rule.categoryId, amount: rule.amount, currencyCode: rule.currencyCode, date, note: rule.note, accountId: rule.accountId };
      if (rule.kind === "income") {
        const made = addIncome([], { ...input, toCash: rule.viaCash }, now, rule.id);
        if (made.ok) out.incomes.push(made.income);
      } else {
        const made = addPersonalExpense([], { ...input, fromCash: rule.viaCash }, now);
        if (made.ok) out.expenses.push({ ...made.expense, recurringId: rule.id });
      }
    }
  }
  return out;
}

// ---- 🤝 الديون مع الناس (not the customers' - those are in their accounts) ----

export type DebtKind = "lent" | "borrowed";

export interface PersonalDebt {
  id: string;
  /** lent: I gave - he owes me. borrowed: I took - I owe him. */
  kind: DebtKind;
  person: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  viaCash: boolean;
  /** Through a bank / wallet instead of الصندوق. */
  accountId?: string;
  createdAt: string;
}

/** Part (or all) of a debt paid back - in the debt's own currency. */
export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number;
  date: string;
  viaCash: boolean;
  accountId?: string;
  createdAt: string;
}

export interface DebtBook {
  debts: PersonalDebt[];
  payments: DebtPayment[];
}

export const EMPTY_DEBT_BOOK: DebtBook = { debts: [], payments: [] };

export interface DebtInput {
  kind: DebtKind;
  person: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  viaCash: boolean;
  accountId?: string;
}

export type DebtResult = { ok: true; book: DebtBook; debt: PersonalDebt } | { ok: false; message: string };

export function addDebt(book: DebtBook, input: DebtInput, now = new Date()): DebtResult {
  if (!input.person.trim()) return { ok: false, message: "اكتب اسم الشخص" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "أدخل المبلغ" };
  if (!DATE_RE.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  const debt: PersonalDebt = {
    id: newId("debt"),
    kind: input.kind,
    person: input.person.trim(),
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    viaCash: input.viaCash && !input.accountId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    createdAt: now.toISOString(),
  };
  return { ok: true, book: { ...book, debts: [...book.debts, debt] }, debt };
}

export function debtRemaining(book: DebtBook, debtId: string): number {
  const debt = book.debts.find((d) => d.id === debtId);
  if (!debt) return 0;
  const paid = book.payments.filter((p) => p.debtId === debtId).reduce((sum, p) => sum + p.amount, 0);
  return Math.max(0, Math.round((debt.amount - paid) * 100) / 100);
}

export type DebtPaymentResult = { ok: true; book: DebtBook; payment: DebtPayment } | { ok: false; message: string };

export function addDebtPayment(
  book: DebtBook,
  input: { debtId: string; amount: number; date: string; viaCash: boolean; accountId?: string },
  now = new Date(),
): DebtPaymentResult {
  if (!book.debts.some((d) => d.id === input.debtId)) return { ok: false, message: "الدين غير موجود" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "أدخل المبلغ" };
  if (input.amount > debtRemaining(book, input.debtId) + 0.0001) return { ok: false, message: "المبلغ أكبر من الباقي" };
  if (!DATE_RE.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  const payment: DebtPayment = {
    id: newId("pay"),
    debtId: input.debtId,
    amount: input.amount,
    date: input.date,
    viaCash: input.viaCash && !input.accountId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    createdAt: now.toISOString(),
  };
  return { ok: true, book: { ...book, payments: [...book.payments, payment] }, payment };
}

/** The debt and its repayments (the caller removes their cash entries: the ids returned). */
export function deleteDebt(book: DebtBook, debtId: string): { book: DebtBook; removedIds: string[] } {
  const payments = book.payments.filter((p) => p.debtId === debtId);
  return {
    book: { debts: book.debts.filter((d) => d.id !== debtId), payments: book.payments.filter((p) => p.debtId !== debtId) },
    removedIds: [debtId, ...payments.map((p) => p.id)],
  };
}

export function deleteDebtPayment(book: DebtBook, paymentId: string): DebtBook {
  return { ...book, payments: book.payments.filter((p) => p.id !== paymentId) };
}

/** The debt's الصندوق entry: lending takes money out, borrowing brings it in. */
export function syncDebtCash(cash: CashEntryList, debt: PersonalDebt): CashEntryList {
  const without = removeLinkedCashEntries(cash, debt.id);
  if (!debt.viaCash) return without;
  const posted = recordCashEntry(without, {
    kind: debt.kind === "lent" ? "out" : "in",
    amount: debt.amount,
    currencyCode: debt.currencyCode,
    date: debt.date,
    category: debt.kind === "lent" ? `دين: سلّفت ${debt.person}` : `دين: استلفت من ${debt.person}`,
    ...(debt.note ? { note: debt.note } : {}),
    sourceId: debt.id,
    sourceKind: "personal-debt",
  });
  return posted.ok ? posted.entries : without;
}

/** A repayment's الصندوق entry: the opposite way of its debt. */
export function syncDebtPaymentCash(cash: CashEntryList, payment: DebtPayment, debt: PersonalDebt): CashEntryList {
  const without = removeLinkedCashEntries(cash, payment.id);
  if (!payment.viaCash) return without;
  const posted = recordCashEntry(without, {
    kind: debt.kind === "lent" ? "in" : "out",
    amount: payment.amount,
    currencyCode: debt.currencyCode,
    date: payment.date,
    category: debt.kind === "lent" ? `دين: ردّ ${debt.person}` : `دين: رددت لـ${debt.person}`,
    sourceId: payment.id,
    sourceKind: "personal-debt",
  });
  return posted.ok ? posted.entries : without;
}

/** What people still owe me / I still owe them, per currency. */
export function debtTotals(book: DebtBook): { lent: Record<string, number>; borrowed: Record<string, number> } {
  const lent: Record<string, number> = {};
  const borrowed: Record<string, number> = {};
  for (const debt of book.debts) {
    const left = debtRemaining(book, debt.id);
    if (left <= 0) continue;
    add(debt.kind === "lent" ? lent : borrowed, debt.currencyCode, left);
  }
  return { lent, borrowed };
}

// ---- through a bank / wallet ----

/** Every one of my records that went through a bank / wallet, signed (+ in, − out). */
export function personalFlows(incomes: IncomeList, expenses: PersonalExpense[], book: DebtBook): AccountFlow[] {
  const flows: AccountFlow[] = [];
  for (const i of incomes) if (i.accountId) flows.push({ accountId: i.accountId, currencyCode: i.currencyCode, date: i.date, amount: i.amount });
  for (const e of expenses) if (e.accountId) flows.push({ accountId: e.accountId, currencyCode: e.currencyCode, date: e.date, amount: -e.amount });
  const byId = new Map(book.debts.map((d) => [d.id, d]));
  for (const d of book.debts) {
    if (d.accountId) flows.push({ accountId: d.accountId, currencyCode: d.currencyCode, date: d.date, amount: d.kind === "lent" ? -d.amount : d.amount });
  }
  for (const p of book.payments) {
    const debt = byId.get(p.debtId);
    if (!debt || !p.accountId) continue;
    flows.push({ accountId: p.accountId, currencyCode: debt.currencyCode, date: p.date, amount: debt.kind === "lent" ? p.amount : -p.amount });
  }
  return flows;
}

// ---- the final figures ----

function inMonth(records: { date: string; amount: number; currencyCode: string }[], month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of records) if (r.date.slice(0, 7) === month) add(out, r.currencyCode, r.amount);
  return out;
}

export interface MonthLeft {
  businessMru: number;
  incomeMru: number;
  expenseMru: number;
  /** «يبقى لك هذا الشهر» = business net + income − expenses. */
  leftMru: number;
  missing: string[];
}

/** One month: what the business earned (reports' «الصافي»), plus my income, minus my spending. */
export function monthLeft(input: { month: string; businessNetMru: number; incomes: IncomeList; expenses: PersonalExpense[]; rates: RatesFromUsd }): MonthLeft {
  const income = sumToMru(inMonth(input.incomes, input.month), input.rates);
  const expense = sumToMru(inMonth(input.expenses, input.month), input.rates);
  return {
    businessMru: input.businessNetMru,
    incomeMru: income.mru,
    expenseMru: expense.mru,
    leftMru: input.businessNetMru + income.mru - expense.mru,
    missing: Array.from(new Set([...income.missing, ...expense.missing])),
  };
}

/** One person / account / device behind a line, for the line's detail sheet. */
export interface WealthItem {
  name: string;
  byCurrency: Record<string, number>;
  mru: number;
}

export interface WealthLine {
  key: string;
  icon: string;
  label: string;
  /** Always positive; `kind` says which way it counts. */
  mru: number;
  kind: "have" | "owed" | "owe";
  items: WealthItem[];
}

export interface Wealth {
  lines: WealthLine[];
  /** «في يدك الآن» = الصندوق + البنوك + البطاقة − everything I owe. */
  inHandMru: number;
  /** «كل ما تملك» = in hand + everything owed to me (customers, reps, people). */
  totalMru: number;
  missing: string[];
}

export interface WealthGroup {
  name: string;
  byCurrency: Record<string, number>;
}

export interface WealthInput {
  /** الصندوق - cash in hand. */
  cash: Record<string, number>;
  banks: WealthGroup[];
  cardUsd: number;
  /** Positive balances only. */
  customers: WealthGroup[];
  /** Per rep: positive = he owes me, negative = I owe him (أوقية). */
  repsMru: { name: string; mru: number }[];
  debts: DebtBook;
  /** What I still owe each supplier (positive only). */
  suppliers: WealthGroup[];
  /** Open D's and previous debts still to pay Starlink, per device (USD). */
  starlink: { name: string; usd: number }[];
  rates: RatesFromUsd;
}

/** The whole picture, line by line: what I have, what's owed to me, what I owe. */
export function buildWealth(input: WealthInput): Wealth {
  const missing = new Set<string>();
  const item = (name: string, byCurrency: Record<string, number>): WealthItem => {
    const converted = sumToMru(byCurrency, input.rates);
    converted.missing.forEach((m) => missing.add(m));
    return { name, byCurrency, mru: converted.mru };
  };
  const line = (key: string, icon: string, label: string, kind: WealthLine["kind"], items: WealthItem[]): WealthLine => ({
    key,
    icon,
    label,
    kind,
    items: items.filter((i) => Object.values(i.byCurrency).some((v) => Math.abs(v) > 0.0001)).sort((a, b) => b.mru - a.mru),
    mru: items.reduce((sum, i) => sum + i.mru, 0),
  });

  const people = { lent: [] as WealthItem[], borrowed: [] as WealthItem[] };
  for (const d of input.debts.debts) {
    const left = debtRemaining(input.debts, d.id);
    if (left > 0) people[d.kind === "lent" ? "lent" : "borrowed"].push(item(d.person, { [d.currencyCode]: left }));
  }
  const mruItem = (name: string, mru: number): WealthItem => ({ name, byCurrency: { MRU: mru }, mru });

  const lines: WealthLine[] = [
    line("cash", "💵", "الصندوق (نقداً)", "have", [item("الصندوق", input.cash)]),
    line("banks", "🏦", "البنوك والمحافظ", "have", input.banks.map((b) => item(b.name, b.byCurrency))),
    line("card", "💳", "بطاقة KAST", "have", [item("البطاقة", { USD: input.cardUsd })]),
    line("customers", "👥", "لك عند الزبائن", "owed", input.customers.map((c) => item(c.name, c.byCurrency))),
    line("repsOwe", "🧑‍💼", "لك عند المندوبين", "owed", input.repsMru.filter((r) => r.mru > 0).map((r) => mruItem(r.name, r.mru))),
    line("lent", "🤝", "لك عند الناس", "owed", people.lent),
    line("starlink", "🛰️", "عليك لستارلينك (D)", "owe", input.starlink.map((s) => item(s.name, { USD: s.usd }))),
    line("suppliers", "🏭", "عليك للموردين", "owe", input.suppliers.map((s) => item(s.name, s.byCurrency))),
    line("repsOwed", "🧑‍💼", "عليك للمندوبين", "owe", input.repsMru.filter((r) => r.mru < 0).map((r) => mruItem(r.name, -r.mru))),
    line("borrowed", "↩", "عليك للناس", "owe", people.borrowed),
  ];
  const sum = (kind: WealthLine["kind"]) => lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.mru, 0);
  const inHandMru = sum("have") - sum("owe");
  return { lines, inHandMru, totalMru: inHandMru + sum("owed"), missing: Array.from(missing) };
}

// ---- storage (business data: `starnet_` keys, so the full backup carries them) ----

const INCOME_KEY = "starnet_personal_income_v1";
const INCOME_CATEGORIES_KEY = "starnet_income_categories_v1";
const RECURRING_KEY = "starnet_recurring_v1";
const DEBTS_KEY = "starnet_personal_debts_v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export const loadIncome = (): IncomeList => asArray<IncomeRecord>(read(INCOME_KEY, []));
export const saveIncome = (list: IncomeList): void => write(INCOME_KEY, list);
export const loadIncomeCategories = (): ExpenseCategory[] => asArray<ExpenseCategory>(read(INCOME_CATEGORIES_KEY, []));
export const saveIncomeCategories = (list: ExpenseCategory[]): void => write(INCOME_CATEGORIES_KEY, list);
export const loadRecurring = (): RecurringList => asArray<RecurringRule>(read(RECURRING_KEY, []));
export const saveRecurring = (list: RecurringList): void => write(RECURRING_KEY, list);
export function loadDebtBook(): DebtBook {
  const raw = read<Partial<DebtBook>>(DEBTS_KEY, {});
  return { debts: asArray(raw.debts), payments: asArray(raw.payments) };
}
export const saveDebtBook = (book: DebtBook): void => write(DEBTS_KEY, book);
