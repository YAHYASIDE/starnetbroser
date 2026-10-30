/**
 * 📉 «خسائر ومصاريف العمل» (his Oct 30 2026 ask, in «حسابي»): a device lost or broken, a card loss, a fine, ads,
 * shipping… - any business loss or expense, recorded with who carries it: me alone, or shared **equally** between me
 * and the reps chosen (or the reps only). A rep's share is **taken off his profit** («ربحه» - a profitTransfer
 * write-off carrying `expenseId`, removed with the expense); my share is a business expense in the reports' «الصافي».
 * The money leaves الكاش (a linked cash-out), a bank / wallet of «حسابي», or nothing (a loss only) - his choice each
 * time. The shares are locked onto the record when it is saved. Pure, except load / save.
 */

import type { AccountFlow } from "./moneyAccounts";
import { recordCashEntry, removeLinkedCashEntries, type CashEntryList } from "./cashStore";
import { addTreeNode, hideTreeNode, visibleCategories, type ExpenseCategory } from "./categoryTree";
import type { RepSettlement, RepSettlementList } from "./repStore";

export interface RepExpenseShare {
  repId: string;
  amount: number;
}

export interface BusinessExpense {
  id: string;
  categoryId: string;
  /** The category's name when it was recorded (the reports' line, kept if the category is removed). */
  categoryName: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  /** 💵 taken out of الكاش (a linked cash-out with this id as its sourceId). */
  fromCash: boolean;
  /** 🏦 a bank / wallet of «حسابي» it was paid from. */
  accountId?: string;
  /** I carry a share too (false = the chosen reps carry it all). */
  includeMe: boolean;
  /** Each chosen rep's share, locked when saved. */
  shares: RepExpenseShare[];
  createdAt: string;
}

export type BusinessExpenseList = BusinessExpense[];

const KEY = "starnet_business_expenses_v1";
const TREE_KEY = "starnet_business_expense_tree_v1";

const g = (id: string, icon: string, name: string): ExpenseCategory => ({ id, icon, name });
const c = (parentId: string, id: string, icon: string, name: string): ExpenseCategory => ({ id, icon, name, parentId });

/** His two kinds and their ready items (he adds his own). */
export const DEFAULT_BUSINESS_TREE: ExpenseCategory[] = [
  g("losses", "📉", "خسائر"),
  c("losses", "loss-device-lost", "📦", "جهاز ضائع"),
  c("losses", "loss-device-broken", "🔧", "جهاز معطّل"),
  c("losses", "loss-card", "💳", "خسارة بطاقة"),
  c("losses", "loss-fine", "🧾", "غرامة"),
  g("costs", "🧾", "مصاريف"),
  c("costs", "cost-ads", "📣", "إعلانات"),
  c("costs", "cost-shipping", "🚚", "نقل وشحن"),
  c("costs", "cost-phone", "📱", "رصيد الهاتف"),
  c("costs", "cost-tools", "🛠️", "أدوات ومعدات"),
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

/** Equal shares between me (when included) and the reps; the rounding cents stay with me (or the last rep). */
export function splitShares(amount: number, includeMe: boolean, repIds: string[]): { me: number; shares: RepExpenseShare[] } {
  const reps = [...new Set(repIds)];
  const people = reps.length + (includeMe || reps.length === 0 ? 1 : 0);
  const each = round2(amount / people);
  const shares = reps.map((repId) => ({ repId, amount: each }));
  const given = round2(each * reps.length);
  if (!includeMe && reps.length > 0) {
    shares[shares.length - 1]!.amount = round2(amount - each * (reps.length - 1));
    return { me: 0, shares };
  }
  return { me: round2(amount - given), shares };
}

/** What I carry of it. */
export function myShare(expense: Pick<BusinessExpense, "amount" | "shares">): number {
  return round2(expense.amount - expense.shares.reduce((sum, s) => sum + s.amount, 0));
}

export interface BusinessExpenseInput {
  categoryId: string;
  categoryName: string;
  amount: number;
  currencyCode: string;
  date: string;
  note?: string;
  fromCash: boolean;
  accountId?: string;
  includeMe: boolean;
  repIds: string[];
}

export type BusinessExpenseResult = { ok: true; list: BusinessExpenseList; expense: BusinessExpense } | { ok: false; message: string };

function build(input: BusinessExpenseInput, id: string, createdAt: string): BusinessExpense | string {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "أدخل مبلغًا صحيحًا أكبر من صفر";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "اختر التاريخ";
  if (!input.includeMe && input.repIds.length === 0) return "اختر من يتحمّله: أنت أو مندوب واحد على الأقل";
  const { shares } = splitShares(input.amount, input.includeMe, input.repIds);
  return {
    id,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    amount: input.amount,
    currencyCode: input.currencyCode,
    date: input.date,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    fromCash: input.accountId ? false : input.fromCash,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    includeMe: input.includeMe || input.repIds.length === 0,
    shares,
    createdAt,
  };
}

export function addBusinessExpense(list: BusinessExpenseList, input: BusinessExpenseInput): BusinessExpenseResult {
  const expense = build(input, newId("bexp"), new Date().toISOString());
  if (typeof expense === "string") return { ok: false, message: expense };
  return { ok: true, list: [...list, expense], expense };
}

/** Edits in place (same id): its shares, cash-out and reps' write-offs are made again from it. */
export function editBusinessExpense(list: BusinessExpenseList, id: string, input: BusinessExpenseInput): BusinessExpenseResult {
  const old = list.find((e) => e.id === id);
  if (!old) return { ok: false, message: "لم يعد موجودًا" };
  const expense = build(input, id, old.createdAt);
  if (typeof expense === "string") return { ok: false, message: expense };
  return { ok: true, list: list.map((e) => (e.id === id ? expense : e)), expense };
}

export function deleteBusinessExpense(list: BusinessExpenseList, id: string): BusinessExpenseList {
  return list.filter((e) => e.id !== id);
}

/** 💵 Its cash-out (the whole amount left الكاش), made again from the record. */
export function syncBusinessCash(cash: CashEntryList, expense: BusinessExpense | null, removedId?: string): CashEntryList {
  let next = removedId ? removeLinkedCashEntries(cash, removedId) : cash;
  if (!expense) return next;
  next = removeLinkedCashEntries(next, expense.id);
  if (!expense.fromCash) return next;
  const result = recordCashEntry(next, {
    kind: "out",
    amount: expense.amount,
    currencyCode: expense.currencyCode,
    date: expense.date,
    category: expense.categoryName,
    note: expense.note,
    sourceId: expense.id,
    sourceKind: "business-expense",
  });
  return result.ok ? result.entries : next;
}

/** 🤝 Each rep's share off his profit: a write-off (profitTransfer) linked by `expenseId`, made again from the record. */
export function syncBusinessRepShares(
  settlements: RepSettlementList,
  expense: BusinessExpense | null,
  rates: Record<string, number> | undefined,
  removedId?: string,
): RepSettlementList {
  const gone = new Set([removedId, expense?.id].filter(Boolean));
  const kept = settlements.filter((s) => !s.expenseId || !gone.has(s.expenseId));
  if (!expense) return kept;
  const made: RepSettlement[] = expense.shares
    .filter((s) => s.amount > 0)
    .map((s) => ({
      id: `${expense.id}:${s.repId}`,
      representativeId: s.repId,
      kind: "profitTransfer",
      amount: s.amount,
      currencyCode: expense.currencyCode,
      date: expense.date,
      note: `📉 نصيبك من ${expense.categoryName}${expense.note ? ` - ${expense.note}` : ""}`,
      ...(rates ? { rates } : {}),
      expenseId: expense.id,
      createdAt: expense.createdAt,
    }));
  return [...kept, ...made];
}

/** 🏦 What left a bank / wallet of «حسابي». */
export function businessExpenseFlows(list: BusinessExpenseList): AccountFlow[] {
  return list.filter((e) => e.accountId).map((e) => ({ accountId: e.accountId, currencyCode: e.currencyCode, date: e.date, amount: -e.amount }));
}

/** The period's totals per currency: the whole amount, my share, and each rep's. */
export function summarizeBusinessExpenses(list: BusinessExpenseList, from: string, to: string) {
  const total: Record<string, number> = {};
  const mine: Record<string, number> = {};
  const byRep: Record<string, Record<string, number>> = {};
  const rows = list.filter((e) => e.date >= from && e.date <= to);
  for (const e of rows) {
    total[e.currencyCode] = round2((total[e.currencyCode] ?? 0) + e.amount);
    mine[e.currencyCode] = round2((mine[e.currencyCode] ?? 0) + myShare(e));
    for (const s of e.shares) {
      const rep = (byRep[s.repId] ??= {});
      rep[e.currencyCode] = round2((rep[e.currencyCode] ?? 0) + s.amount);
    }
  }
  return { count: rows.length, total, mine, byRep };
}

export function loadBusinessExpenses(): BusinessExpenseList {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as BusinessExpenseList) : [];
  } catch {
    return [];
  }
}

export function saveBusinessExpenses(list: BusinessExpenseList): void {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function loadBusinessTree(): ExpenseCategory[] {
  if (typeof window === "undefined") return DEFAULT_BUSINESS_TREE;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TREE_KEY) ?? "null");
    return Array.isArray(parsed) && parsed.length ? (parsed as ExpenseCategory[]) : DEFAULT_BUSINESS_TREE;
  } catch {
    return DEFAULT_BUSINESS_TREE;
  }
}

export function saveBusinessTree(tree: ExpenseCategory[]): void {
  window.localStorage.setItem(TREE_KEY, JSON.stringify(tree));
}

export function businessCategories(tree: ExpenseCategory[]): ExpenseCategory[] {
  return visibleCategories(tree.length ? tree : DEFAULT_BUSINESS_TREE);
}

export function businessCategoryOf(id: string, tree: ExpenseCategory[]): ExpenseCategory {
  return (tree.length ? tree : DEFAULT_BUSINESS_TREE).find((x) => x.id === id) ?? { id, icon: "📉", name: "مصروف عمل" };
}

export function addBusinessCategory(tree: ExpenseCategory[], name: string, icon = "🏷️", parentId?: string) {
  return addTreeNode(tree.length ? tree : DEFAULT_BUSINESS_TREE, { name, icon, parentId }, newId("bcat"));
}

export function removeBusinessCategory(tree: ExpenseCategory[], id: string): ExpenseCategory[] {
  return hideTreeNode(tree.length ? tree : DEFAULT_BUSINESS_TREE, id);
}
