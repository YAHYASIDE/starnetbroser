/**
 * 🧾 «المصروفات»: what the operator spends on himself and his home - food, drink, medicine,
 * clothes, his wife, the house… One tap on a category, the amount, save. Each expense keeps its own
 * currency (never mixed); one taken «من الكاش» posts a linked cash-out (removed with it). They
 * are not business expenses: the business net stays as it is, and the reports add one line
 * «يبقى لك» = the month's net − these.
 */

import { recordCashEntry, removeLinkedCashEntries, type CashEntryList } from "./cashStore";
import { RatesFromUsd, sumToMru } from "./reportsView";

export interface ExpenseCategory {
  id: string;
  icon: string;
  name: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "food", icon: "🍞", name: "أكل" },
  { id: "drink", icon: "🥤", name: "شرب" },
  { id: "medicine", icon: "💊", name: "دواء" },
  { id: "clothes", icon: "👕", name: "لباس" },
  { id: "wife", icon: "👩", name: "الزوجة" },
  { id: "home", icon: "🏠", name: "البيت" },
  { id: "transport", icon: "⛽", name: "نقل" },
  { id: "phone", icon: "📱", name: "رصيد" },
  { id: "other", icon: "➕", name: "أخرى" },
];

export interface PersonalExpense {
  id: string;
  categoryId: string;
  amount: number;
  currencyCode: string;
  /** yyyy-mm-dd */
  date: string;
  note?: string;
  /** Taken from الكاش - a linked cash-out entry exists with sourceId = id. */
  fromCash: boolean;
  createdAt: string;
  /** Created by a monthly rule (myMoney.ts «🔁 شهري»), e.g. the rent. */
  recurringId?: string;
  /** Paid from a bank / wallet (moneyAccounts.ts) instead of الكاش. */
  accountId?: string;
}

export type PersonalExpenseList = PersonalExpense[];

const EXPENSES_KEY = "starnet_personal_expenses_v1";
const CATEGORIES_KEY = "starnet_expense_categories_v1";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, list: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(list));
}

export const loadPersonalExpenses = (): PersonalExpenseList => load<PersonalExpense>(EXPENSES_KEY);
export const savePersonalExpenses = (list: PersonalExpenseList): void => save(EXPENSES_KEY, list);
/** The operator's own categories (added with «➕»), after the built-in ones. */
export const loadCustomCategories = (): ExpenseCategory[] => load<ExpenseCategory>(CATEGORIES_KEY);
export const saveCustomCategories = (list: ExpenseCategory[]): void => save(CATEGORIES_KEY, list);

export function allCategories(custom: ExpenseCategory[]): ExpenseCategory[] {
  return [...DEFAULT_EXPENSE_CATEGORIES.filter((c) => c.id !== "other"), ...custom, DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === "other")!];
}

export function categoryOf(id: string, custom: ExpenseCategory[]): ExpenseCategory {
  return allCategories(custom).find((c) => c.id === id) ?? { id, icon: "🧾", name: "مصروف" };
}

export function addCustomCategory(custom: ExpenseCategory[], name: string, icon = "🏷️"): { ok: true; list: ExpenseCategory[]; category: ExpenseCategory } | { ok: false; message: string } {
  const clean = name.trim();
  if (!clean) return { ok: false, message: "اكتب اسم الفئة" };
  if (allCategories(custom).some((c) => c.name === clean)) return { ok: false, message: "هذه الفئة موجودة" };
  const category = { id: newId("cat"), icon: icon.trim() || "🏷️", name: clean };
  return { ok: true, list: [...custom, category], category };
}

export interface ExpenseInput {
  categoryId: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  fromCash: boolean;
  accountId?: string;
}

export type ExpenseResult = { ok: true; list: PersonalExpenseList; expense: PersonalExpense } | { ok: false; message: string };

export function addPersonalExpense(list: PersonalExpenseList, input: ExpenseInput, now = new Date()): ExpenseResult {
  if (!input.categoryId) return { ok: false, message: "اختر الفئة" };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, message: "أدخل المبلغ" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, message: "اختر التاريخ" };
  const expense: PersonalExpense = {
    id: newId("exp"),
    categoryId: input.categoryId,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    fromCash: input.fromCash && !input.accountId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    createdAt: now.toISOString(),
  };
  return { ok: true, list: [...list, expense], expense };
}

/** Same id (so its cash entry is re-posted to match), new figures. */
export function editPersonalExpense(list: PersonalExpenseList, id: string, input: ExpenseInput): ExpenseResult {
  const existing = list.find((e) => e.id === id);
  if (!existing) return { ok: false, message: "المصروف غير موجود" };
  const checked = addPersonalExpense([], input);
  if (!checked.ok) return checked;
  const expense: PersonalExpense = {
    ...checked.expense,
    id,
    createdAt: existing.createdAt,
    ...(existing.recurringId ? { recurringId: existing.recurringId } : {}),
  };
  return { ok: true, list: list.map((e) => (e.id === id ? expense : e)), expense };
}

export function deletePersonalExpense(list: PersonalExpenseList, id: string): PersonalExpenseList {
  return list.filter((e) => e.id !== id);
}

/** The expense's الكاش entry, rebuilt: removed, then posted again only when it's «من الكاش». */
export function syncExpenseCash(cash: CashEntryList, expense: PersonalExpense, categories: ExpenseCategory[]): CashEntryList {
  const without = removeLinkedCashEntries(cash, expense.id);
  if (!expense.fromCash) return without;
  const category = categoryOf(expense.categoryId, categories);
  const posted = recordCashEntry(without, {
    kind: "out",
    amount: expense.amount,
    currencyCode: expense.currencyCode,
    date: expense.date,
    category: `مصروف شخصي: ${category.name}`,
    ...(expense.note ? { note: expense.note } : {}),
    sourceId: expense.id,
    sourceKind: "personal-expense",
  });
  return posted.ok ? posted.entries : without;
}

export interface ExpenseSummary {
  /** Per currency - never mixed. */
  byCurrency: Record<string, number>;
  /** Per category, largest first (by its amount in أوقية when rates allow, else by count). */
  byCategory: { categoryId: string; byCurrency: Record<string, number>; count: number; mru?: number }[];
  count: number;
}

/** Expenses dated from `from` to `to` (yyyy-mm-dd, inclusive). */
/** Any dated money records with a category (expenses, and the income in myMoney.ts). */
export type CategorizedRecord = Pick<PersonalExpense, "categoryId" | "amount" | "currencyCode" | "date">;

export function summarizeExpenses(list: CategorizedRecord[], from: string, to: string, rates: RatesFromUsd = {}): ExpenseSummary {
  const byCurrency: Record<string, number> = {};
  const groups = new Map<string, { byCurrency: Record<string, number>; count: number }>();
  let count = 0;
  for (const e of list) {
    if (e.date < from || e.date > to) continue;
    count += 1;
    byCurrency[e.currencyCode] = (byCurrency[e.currencyCode] ?? 0) + e.amount;
    const group = groups.get(e.categoryId) ?? { byCurrency: {}, count: 0 };
    group.byCurrency[e.currencyCode] = (group.byCurrency[e.currencyCode] ?? 0) + e.amount;
    group.count += 1;
    groups.set(e.categoryId, group);
  }
  const byCategory = Array.from(groups.entries()).map(([categoryId, g]) => {
    const converted = sumToMru(g.byCurrency, rates);
    return { categoryId, byCurrency: g.byCurrency, count: g.count, ...(converted.missing.length === 0 ? { mru: converted.mru } : {}) };
  });
  byCategory.sort((a, b) => (b.mru ?? 0) - (a.mru ?? 0) || b.count - a.count);
  return { byCurrency, byCategory, count };
}

/** A month's personal expenses in أوقية at today's rates (display only), and what had no rate. */
export function monthExpensesMru(list: PersonalExpenseList, month: string, rates: RatesFromUsd): { mru: number; missing: string[] } {
  const summary = summarizeExpenses(list, `${month}-01`, `${month}-31`);
  return sumToMru(summary.byCurrency, rates);
}
