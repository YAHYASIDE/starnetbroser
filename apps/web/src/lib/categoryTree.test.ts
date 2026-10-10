import { describe, expect, it } from "vitest";
import { addTreeNode, categoryPath, groupIdOf, hideTreeNode, treeChildren, treeGroups, visibleCategories } from "./categoryTree";
import { DEFAULT_EXPENSE_TREE } from "./personalExpenses";
import { dropOldExpenses } from "./expenseTreeStore";
import type { PersonalExpense } from "./personalExpenses";
import type { RecurringRule } from "./myMoney";

const tree = DEFAULT_EXPENSE_TREE;

describe("expense groups like «مصاريف»", () => {
  it("his own sections first, «فواتير» opens to its items, «أخرى» last", () => {
    expect(treeGroups(tree).slice(0, 4).map((c) => c.name)).toEqual(["سحب رصيد", "تحويل رصيد", "العائلة", "خسارة من الأجهزة"]);
    expect(treeChildren(tree, "bills").map((c) => c.name)).toEqual(["الكهرباء", "الغاز", "الإنترنت", "الاتصالات", "الإيجار", "التلفاز", "المياه"]);
    expect(treeGroups(tree).at(-1)?.name).toBe("أخرى");
    expect(tree.some((c) => c.name === "أكل" || c.name === "شرب")).toBe(false);
  });

  it("an item rolls up to its group and reads «فواتير · الكهرباء»", () => {
    expect(groupIdOf(tree, "bills-power")).toBe("bills");
    expect(groupIdOf(tree, "bills")).toBe("bills");
    expect(categoryPath(tree, "bills-power")).toBe("فواتير · الكهرباء");
    expect(categoryPath(tree, "insurance")).toBe("التأمينات");
  });

  it("adds a group before «أخرى» and an item inside a group, never twice", () => {
    const group = addTreeNode(tree, { name: "DEMO GROUP", icon: "🎒" }, "g1");
    if (!group.ok) throw new Error(group.message);
    expect(treeGroups(group.list).slice(-2).map((c) => c.name)).toEqual(["DEMO GROUP", "أخرى"]);
    const item = addTreeNode(group.list, { name: "DEMO ITEM", parentId: "g1" }, "i1");
    if (!item.ok) throw new Error(item.message);
    expect(treeChildren(item.list, "g1").map((c) => c.id)).toEqual(["i1"]);
    expect(addTreeNode(item.list, { name: "DEMO ITEM", parentId: "g1" }, "i2").ok).toBe(false);
    expect(addTreeNode(item.list, { name: "الغاز", parentId: "bills" }, "i3").ok).toBe(false);
    expect(addTreeNode(item.list, { name: " " }, "x").ok).toBe(false);
  });

  it("removing hides it (and a group's items) but old records keep its name", () => {
    const hidden = hideTreeNode(tree, "bills");
    expect(visibleCategories(hidden).some((c) => c.id === "bills" || c.parentId === "bills")).toBe(false);
    expect(categoryPath(hidden, "bills-power")).toBe("فواتير · الكهرباء");
    // Added again: the same one comes back.
    const back = addTreeNode(hideTreeNode(tree, "travel"), { name: "السفر" }, "new");
    expect(back.ok && back.category.id).toBe("travel");
  });
});

describe("dropOldExpenses (the old أكل/شرب… expenses go, his choice)", () => {
  const e = (id: string, categoryId: string) => ({ id, categoryId, amount: 10, currencyCode: "MRU", date: "2026-10-04", fromCash: false, createdAt: "x" }) as PersonalExpense;
  it("removes the expenses on old categories and moves a monthly rule to the new one", () => {
    const rules = [
      { id: "r1", kind: "expense", categoryId: "phone" },
      { id: "r2", kind: "income", categoryId: "other" },
    ] as RecurringRule[];
    const plan = dropOldExpenses([e("a", "food"), e("b", "phone"), e("c", "cat-1"), e("d", "bills-power")], rules, ["cat-1"]);
    expect(plan.removedIds).toEqual(["a", "b", "c"]);
    expect(plan.kept.map((x) => x.id)).toEqual(["d"]);
    expect(plan.rules.map((r) => r.categoryId)).toEqual(["bills-telecom", "other"]);
    expect(plan.rulesChanged).toBe(true);
  });
});
