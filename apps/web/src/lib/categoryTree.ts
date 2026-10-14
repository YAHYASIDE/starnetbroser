/**
 * 🗂️ Expense / income categories as groups with items inside, like the app «مصاريف»: «فواتير»
 * opens to الكهرباء، الغاز، الماء… Stored as one flat list (an item has its group's `parentId`).
 * The operator adds or removes any group or item (long press); a removed one is only hidden, so
 * what was recorded on it keeps its name.
 */

export interface ExpenseCategory {
  id: string;
  icon: string;
  name: string;
  /** The group it belongs to (none = a group, or a single category). */
  parentId?: string;
  /** Removed by the operator: not offered any more, still names old records. */
  hidden?: boolean;
}

/** What can be picked: everything not removed (a removed group hides its items too). */
export function visibleCategories(tree: ExpenseCategory[]): ExpenseCategory[] {
  const hiddenGroups = new Set(tree.filter((c) => c.hidden && !c.parentId).map((c) => c.id));
  return tree.filter((c) => !c.hidden && !(c.parentId && hiddenGroups.has(c.parentId)));
}

/** The top row: groups and single categories, in order. */
export function treeGroups(tree: ExpenseCategory[]): ExpenseCategory[] {
  return visibleCategories(tree).filter((c) => !c.parentId);
}

/** A group's items. */
export function treeChildren(tree: ExpenseCategory[], groupId: string): ExpenseCategory[] {
  return visibleCategories(tree).filter((c) => c.parentId === groupId);
}

/** The group a category rolls up to (itself when it's a group). */
export function groupIdOf(tree: ExpenseCategory[], id: string): string {
  return tree.find((c) => c.id === id)?.parentId ?? id;
}

/** «فواتير · الكهرباء» for an item, the name alone for a group. */
export function categoryPath(tree: ExpenseCategory[], id: string): string {
  const node = tree.find((c) => c.id === id);
  if (!node) return "";
  const parent = node.parentId ? tree.find((c) => c.id === node.parentId) : undefined;
  return parent ? `${parent.name} · ${node.name}` : node.name;
}

export type TreeResult = { ok: true; list: ExpenseCategory[]; category: ExpenseCategory } | { ok: false; message: string };

/** A new group (no parentId) or a new item inside a group. */
export function addTreeNode(tree: ExpenseCategory[], input: { name: string; icon?: string; parentId?: string }, id: string): TreeResult {
  const name = input.name.trim();
  if (!name) return { ok: false, message: "اكتب الاسم" };
  if (input.parentId && !treeGroups(tree).some((g) => g.id === input.parentId)) return { ok: false, message: "القسم غير موجود" };
  const siblings = input.parentId ? treeChildren(tree, input.parentId) : treeGroups(tree);
  if (siblings.some((c) => c.name === name)) return { ok: false, message: "هذا الاسم موجود" };
  // A name removed before comes back instead of a twin.
  const removed = tree.find((c) => c.hidden && c.name === name && (c.parentId ?? "") === (input.parentId ?? ""));
  if (removed) {
    const category = { ...removed, icon: input.icon?.trim() || removed.icon, hidden: undefined };
    delete category.hidden;
    return { ok: true, list: tree.map((c) => (c.id === removed.id ? category : c)), category };
  }
  const category: ExpenseCategory = { id, icon: input.icon?.trim() || "🏷️", name, ...(input.parentId ? { parentId: input.parentId } : {}) };
  // A group goes before «أخرى»; an item at the end of its group.
  const otherIndex = input.parentId ? -1 : tree.findIndex((c) => c.id === "other");
  const list = otherIndex >= 0 ? [...tree.slice(0, otherIndex), category, ...tree.slice(otherIndex)] : [...tree, category];
  return { ok: true, list, category };
}

/** Removes a group (with its items) or an item - hidden, records keep their name. */
export function hideTreeNode(tree: ExpenseCategory[], id: string): ExpenseCategory[] {
  return tree.map((c) => (c.id === id ? { ...c, hidden: true } : c));
}
