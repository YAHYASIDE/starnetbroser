import { describe, expect, it } from "vitest";
import type { CashEntryList } from "./cashStore";
import {
  addCustomCategory,
  addPersonalExpense,
  allCategories,
  categoryOf,
  deletePersonalExpense,
  editPersonalExpense,
  monthExpensesMru,
  summarizeExpenses,
  syncExpenseCash,
} from "./personalExpenses";

const base = { categoryId: "food", amount: 500, currencyCode: "MRU", date: "2026-10-03", fromCash: true };

describe("personal expenses", () => {
  it("records one with a category and amount; refuses a missing amount or date", () => {
    const added = addPersonalExpense([], { ...base, note: "  غداء " });
    if (!added.ok) throw new Error(added.message);
    expect(added.expense).toMatchObject({ categoryId: "food", amount: 500, note: "غداء", fromCash: true });
    expect(addPersonalExpense([], { ...base, amount: 0 }).ok).toBe(false);
    expect(addPersonalExpense([], { ...base, date: "" }).ok).toBe(false);
  });

  it("«من الصندوق» posts a linked cash-out, re-posted on edit and removed when turned off", () => {
    const added = addPersonalExpense([], base);
    if (!added.ok) throw new Error(added.message);
    let cash: CashEntryList = syncExpenseCash([], added.expense, []);
    expect(cash).toHaveLength(1);
    expect(cash[0]).toMatchObject({ kind: "out", amount: 500, currencyCode: "MRU", category: "مصروف شخصي: أكل", sourceKind: "personal-expense", sourceId: added.expense.id });
    const edited = editPersonalExpense(added.list, added.expense.id, { ...base, amount: 700 });
    if (!edited.ok) throw new Error(edited.message);
    cash = syncExpenseCash(cash, edited.expense, []);
    expect(cash.map((c) => c.amount)).toEqual([700]);
    cash = syncExpenseCash(cash, { ...edited.expense, fromCash: false }, []);
    expect(cash).toEqual([]);
    expect(deletePersonalExpense(edited.list, added.expense.id)).toEqual([]);
  });

  it("sums per currency (never mixed) and per category, inside the period", () => {
    let list = [] as ReturnType<typeof deletePersonalExpense>;
    for (const input of [
      base,
      { ...base, categoryId: "medicine", amount: 1200 },
      { ...base, amount: 10, currencyCode: "EUR" },
      { ...base, date: "2026-09-30", amount: 999 },
    ]) {
      const r = addPersonalExpense(list, input);
      if (!r.ok) throw new Error(r.message);
      list = r.list;
    }
    const s = summarizeExpenses(list, "2026-10-01", "2026-10-31", { MRU: 40, EUR: 1 });
    expect(s.byCurrency).toEqual({ MRU: 1700, EUR: 10 });
    expect(s.count).toBe(3);
    expect(s.byCategory.map((c) => [c.categoryId, c.mru])).toEqual([
      ["medicine", 1200],
      ["food", 900],
    ]);
    expect(monthExpensesMru(list, "2026-10", { MRU: 40, EUR: 1 })).toEqual({ mru: 2100, missing: [] });
    expect(monthExpensesMru(list, "2026-10", { MRU: 40 }).missing).toEqual(["EUR"]);
  });

  it("custom categories sit before «أخرى»; an unknown id still shows", () => {
    const r = addCustomCategory([], "مدرسة الأولاد", "🎒");
    if (!r.ok) throw new Error(r.message);
    const names = allCategories(r.list).map((c) => c.name);
    expect(names.slice(-2)).toEqual(["مدرسة الأولاد", "أخرى"]);
    expect(addCustomCategory(r.list, "أكل").ok).toBe(false);
    expect(categoryOf("gone", []).name).toBe("مصروف");
  });
});
