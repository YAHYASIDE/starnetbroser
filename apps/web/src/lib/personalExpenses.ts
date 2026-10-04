/**
 * 🧾 «المصروفات»: what the operator spends on himself and his home, in groups like his «مصاريف»
 * app (فواتير → الكهرباء، الغاز…; categoryTree.ts). One tap on a category, the amount, save. Each expense keeps its own
 * currency (never mixed); one taken «من الكاش» posts a linked cash-out (removed with it). They
 * are not business expenses: the business net stays as it is, and the reports add one line
 * «يبقى لك» = the month's net − these.
 */

import { addTreeNode, hideTreeNode, visibleCategories, type ExpenseCategory } from "./categoryTree";
import { recordCashEntry, removeLinkedCashEntries, type CashEntryList } from "./cashStore";
import { RatesFromUsd, sumToMru } from "./reportsView";

export type { ExpenseCategory };

const g = (id: string, icon: string, name: string): ExpenseCategory => ({ id, icon, name });
const c = (parentId: string, id: string, icon: string, name: string): ExpenseCategory => ({ id, icon, name, parentId });

/** The operator's categories, like his «مصاريف» app: groups that open to their items. */
export const DEFAULT_EXPENSE_TREE: ExpenseCategory[] = [
  g("withdraw", "🏧", "سحب رصيد"),
  g("credit-transfer", "💸", "تحويل رصيد"),
  g("family", "👨‍👩‍👧", "العائلة"),
  g("device-loss", "📉", "خسارة من الأجهزة"),
  g("food", "🍽️", "الغذاء"),
  c("food", "food-cafe", "☕", "المقاهي"),
  c("food", "food-restaurant", "🍴", "المطاعم"),
  g("transport", "🚗", "المواصلات"),
  c("transport", "transport-fuel", "⛽", "البنزين"),
  c("transport", "transport-repair", "🔧", "الصيانة"),
  c("transport", "transport-parking", "🅿️", "الجراج"),
  c("transport", "transport-taxi", "🚕", "الأجرة"),
  g("bills", "🧾", "فواتير"),
  c("bills", "bills-power", "💡", "الكهرباء"),
  c("bills", "bills-gas", "🔥", "الغاز"),
  c("bills", "bills-internet", "🌐", "الإنترنت"),
  c("bills", "bills-telecom", "📞", "الاتصالات"),
  c("bills", "bills-rent", "🏠", "الإيجار"),
  c("bills", "bills-tv", "📺", "التلفاز"),
  c("bills", "bills-water", "🚰", "المياه"),
  g("household", "🏡", "الأسرة"),
  c("household", "household-kids", "👶", "الأطفال"),
  c("household", "household-repair", "🛠️", "الصيانة المنزلية"),
  c("household", "household-services", "🧺", "الخدمات"),
  g("health", "❤️", "الصحة واللياقة"),
  c("health", "health-doctors", "🩺", "الأطباء"),
  c("health", "health-meds", "💊", "الأدوية"),
  c("health", "health-care", "🧴", "العناية الشخصية"),
  c("health", "health-sport", "🏃", "الأنشطة الرياضية"),
  g("insurance", "🛡️", "التأمينات"),
  g("shopping", "🛍️", "التسوق"),
  c("shopping", "shopping-accessories", "💍", "اكسسوارات"),
  c("shopping", "shopping-clothes", "👕", "ملابس"),
  c("shopping", "shopping-electronics", "📱", "الكترونيات"),
  c("shopping", "shopping-shoes", "👟", "أحذية"),
  g("travel", "✈️", "السفر"),
  g("education", "🎓", "التعليم"),
  c("education", "education-books", "📚", "كتب دراسية"),
  c("education", "education-courses", "📝", "الدورات التدريبية"),
  g("investment", "📈", "إستثمار"),
  g("fun", "🎮", "الترفيه"),
  c("fun", "fun-games", "🕹️", "ألعاب"),
  c("fun", "fun-media", "🎬", "أفلام وصوتيات"),
  g("fees", "📄", "الرسوم والإشتراكات"),
  g("giving", "🤲", "التبرعات والهدايا"),
  c("giving", "giving-sadaqa", "📦", "الصدقة"),
  c("giving", "giving-zakat", "💚", "الزكاة"),
  c("giving", "giving-gifts", "🎁", "الهدايا"),
  g("other", "➕", "أخرى"),
];

/** Phone credit bought (a bank notification «رصيد») is suggested here. */
export const AIRTIME_CATEGORY_ID = "bills-telecom";

/** The categories before the groups (أكل، شرب…) - his old expenses on them were removed. */
export const OLD_EXPENSE_IDS = ["food", "drink", "medicine", "clothes", "wife", "home", "transport", "phone", "other"];

/** An old 🔁 monthly rule keeps going on the matching new category. */
export const OLD_TO_NEW_CATEGORY: Record<string, string> = {
  food: "food",
  drink: "food-cafe",
  medicine: "health-meds",
  clothes: "shopping-clothes",
  wife: "family",
  home: "household",
  transport: "transport",
  phone: "bills-telecom",
  other: "other",
};

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
/** Before the groups: the operator's own extra categories (flat). */
export const OLD_CATEGORIES_KEY = "starnet_expense_categories_v1";
const TREE_KEY = "starnet_expense_tree_v1";

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
/** The stored category tree, or null before the groups existed on this phone
 * (expenseTreeStore.ts sets it up once). */
export function readExpenseTree(): ExpenseCategory[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TREE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as ExpenseCategory[]) : null;
  } catch {
    return null;
  }
}
export const saveExpenseTree = (tree: ExpenseCategory[]): void => save(TREE_KEY, tree);
export const loadOldCustomCategories = (): ExpenseCategory[] => load<ExpenseCategory>(OLD_CATEGORIES_KEY);

/** Everything that can be picked (groups and their items). */
export function allCategories(tree: ExpenseCategory[]): ExpenseCategory[] {
  return visibleCategories(tree.length ? tree : DEFAULT_EXPENSE_TREE);
}

export function categoryOf(id: string, tree: ExpenseCategory[]): ExpenseCategory {
  return (tree.length ? tree : DEFAULT_EXPENSE_TREE).find((c) => c.id === id) ?? { id, icon: "🧾", name: "مصروف" };
}

/** A new group, or a new item inside `parentId`. */
export function addCustomCategory(tree: ExpenseCategory[], name: string, icon = "🏷️", parentId?: string): { ok: true; list: ExpenseCategory[]; category: ExpenseCategory } | { ok: false; message: string } {
  return addTreeNode(tree.length ? tree : DEFAULT_EXPENSE_TREE, { name, icon, parentId }, newId("cat"));
}

/** Removes a group (with its items) or an item; what was recorded on it keeps its name. */
export function removeCategory(tree: ExpenseCategory[], id: string): ExpenseCategory[] {
  return hideTreeNode(tree.length ? tree : DEFAULT_EXPENSE_TREE, id);
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
