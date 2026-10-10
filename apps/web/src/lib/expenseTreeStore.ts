"use client";

/**
 * 🗂️ The expense groups (personalExpenses.DEFAULT_EXPENSE_TREE) set up once on this phone. The
 * operator chose to remove his old expenses recorded on the categories before the groups (أكل،
 * شرب، رصيد…) - with their الكاش entries - instead of moving them; a 🔁 monthly rule on an old
 * category keeps going on the matching new one.
 */

import { loadCashEntries, removeLinkedCashEntries, saveCashEntries } from "./cashStore";
import type { ExpenseCategory } from "./categoryTree";
import { loadRecurring, saveRecurring, type RecurringList } from "./myMoney";
import {
  DEFAULT_EXPENSE_TREE,
  loadOldCustomCategories,
  loadPersonalExpenses,
  OLD_CATEGORIES_KEY,
  OLD_EXPENSE_IDS,
  OLD_TO_NEW_CATEGORY,
  readExpenseTree,
  saveExpenseTree,
  savePersonalExpenses,
  type PersonalExpenseList,
} from "./personalExpenses";

/** Pure: which old expenses go, and the 🔁 rules moved to the new categories. */
export function dropOldExpenses(
  expenses: PersonalExpenseList,
  rules: RecurringList,
  oldCustomIds: string[],
): { kept: PersonalExpenseList; removedIds: string[]; rules: RecurringList; rulesChanged: boolean } {
  const old = new Set([...OLD_EXPENSE_IDS, ...oldCustomIds]);
  const removedIds = expenses.filter((e) => old.has(e.categoryId)).map((e) => e.id);
  const kept = expenses.filter((e) => !old.has(e.categoryId));
  let rulesChanged = false;
  const nextRules = rules.map((r) => {
    if (r.kind !== "expense" || !old.has(r.categoryId)) return r;
    rulesChanged = true;
    return { ...r, categoryId: OLD_TO_NEW_CATEGORY[r.categoryId] ?? "other" };
  });
  return { kept, removedIds, rules: nextRules, rulesChanged };
}

/** The category tree - set up the first time (removing the old expenses, his choice). */
export function loadExpenseTree(): ExpenseCategory[] {
  const stored = readExpenseTree();
  if (stored) return stored;
  if (typeof window === "undefined") return DEFAULT_EXPENSE_TREE;
  const plan = dropOldExpenses(loadPersonalExpenses(), loadRecurring(), loadOldCustomCategories().map((c) => c.id));
  if (plan.removedIds.length) {
    saveCashEntries(plan.removedIds.reduce((cash, id) => removeLinkedCashEntries(cash, id), loadCashEntries()));
    savePersonalExpenses(plan.kept);
  }
  if (plan.rulesChanged) saveRecurring(plan.rules);
  saveExpenseTree(DEFAULT_EXPENSE_TREE);
  try {
    window.localStorage.removeItem(OLD_CATEGORIES_KEY);
  } catch {
    // the old list is no longer read anyway
  }
  return DEFAULT_EXPENSE_TREE;
}
