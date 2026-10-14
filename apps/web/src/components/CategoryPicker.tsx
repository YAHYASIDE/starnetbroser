"use client";

import { Fragment, useRef, useState } from "react";
import { PartySheet } from "@/components/AccountsSection";
import { treeChildren, treeGroups, type ExpenseCategory } from "@/lib/categoryTree";

/**
 * 🗂️ The categories as small circles, like «مصاريف»: a group (فواتير) opens under its row to its
 * items (الكهرباء، الغاز…); a single category is picked at once. Long press on any circle: remove
 * it, or (a group) add an item inside it; the dashed «➕» adds a group.
 */
export function CategoryPicker({
  tree,
  selectedId,
  onPick,
  onAdd,
  onRemove,
  label,
}: {
  tree: ExpenseCategory[];
  /** Highlighted (a form choosing one); none = tapping records right away. */
  selectedId?: string;
  onPick: (id: string) => void;
  /** Long-press editing; without these the circles only pick. */
  onAdd?: (name: string, icon: string, parentId?: string) => string | null;
  onRemove?: (id: string) => void;
  label: string;
}) {
  const groups = treeGroups(tree);
  const selectedGroup = selectedId ? tree.find((c) => c.id === selectedId)?.parentId : undefined;
  const [openId, setOpenId] = useState<string | null>(selectedGroup ?? null);
  const [menu, setMenu] = useState<ExpenseCategory | null>(null);
  const [adding, setAdding] = useState<{ parentId?: string } | null>(null);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const editable = Boolean(onAdd || onRemove);

  function pressStart(category: ExpenseCategory) {
    if (!editable) return;
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setMenu(category);
    }, 550);
  }
  function pressEnd() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  function tap(category: ExpenseCategory) {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (!category.parentId && treeChildren(tree, category.id).length > 0) {
      setOpenId(openId === category.id ? null : category.id);
      return;
    }
    onPick(category.id);
  }

  function circle(category: ExpenseCategory, extra?: { name?: string; hasItems?: boolean }) {
    const active = selectedId === category.id || (extra?.hasItems && openId === category.id);
    return (
      <button
        key={category.id + (extra?.name ? "-self" : "")}
        type="button"
        className={`cat-item${active ? " cat-item-active" : ""}`}
        onClick={() => (extra?.name ? onPick(category.id) : tap(category))}
        onPointerDown={() => pressStart(category)}
        onPointerUp={pressEnd}
        onPointerLeave={pressEnd}
        onPointerCancel={pressEnd}
        onContextMenu={(e) => editable && e.preventDefault()}
      >
        <span className="cat-circle" aria-hidden="true">
          {category.icon}
          {extra?.hasItems && <i className="cat-more">{openId === category.id ? "▴" : "▾"}</i>}
        </span>
        <small>{extra?.name ?? category.name}</small>
      </button>
    );
  }

  return (
    <div className="cat-picker" role="group" aria-label={label}>
      {groups.map((group) => {
        const items = treeChildren(tree, group.id);
        return (
          <Fragment key={group.id}>
            {circle(group, { hasItems: items.length > 0 })}
            {openId === group.id && items.length > 0 && (
              <div className="cat-panel">
                {circle(group, { name: "عام" })}
                {items.map((item) => circle(item))}
                {onAdd && (
                  <button type="button" className="cat-item cat-item-new" onClick={() => setAdding({ parentId: group.id })}>
                    <span className="cat-circle" aria-hidden="true">
                      ➕
                    </span>
                    <small>بند</small>
                  </button>
                )}
              </div>
            )}
          </Fragment>
        );
      })}
      {onAdd && (
        <button type="button" className="cat-item cat-item-new" onClick={() => setAdding({})}>
          <span className="cat-circle" aria-hidden="true">
            ➕
          </span>
          <small>قسم جديد</small>
        </button>
      )}

      {menu && (
        <PartySheet title={`${menu.icon} ${menu.name}`} onClose={() => setMenu(null)}>
          <div className="party-balance-form">
            {onAdd && !menu.parentId && (
              <button
                type="button"
                className="dialog-secondary"
                onClick={() => {
                  setAdding({ parentId: menu.id });
                  setMenu(null);
                }}
              >
                ➕ بند داخل «{menu.name}»
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                className="dialog-danger"
                onClick={() => {
                  const what = !menu.parentId && treeChildren(tree, menu.id).length > 0 ? `«${menu.name}» وكل بنوده` : `«${menu.name}»`;
                  if (window.confirm(`حذف ${what}؟ ما سُجّل عليه يبقى باسمه.`)) {
                    onRemove(menu.id);
                    if (openId === menu.id) setOpenId(null);
                  }
                  setMenu(null);
                }}
              >
                🗑 حذف «{menu.name}»
              </button>
            )}
          </div>
        </PartySheet>
      )}

      {adding && onAdd && (
        <PartySheet
          title={adding.parentId ? `➕ بند داخل «${tree.find((c) => c.id === adding.parentId)?.name ?? ""}»` : "➕ قسم جديد"}
          onClose={() => setAdding(null)}
        >
          <NewCategoryForm
            onSave={(name, icon) => {
              const message = onAdd(name, icon, adding.parentId);
              if (!message) {
                if (adding.parentId) setOpenId(adding.parentId);
                setAdding(null);
              }
              return message;
            }}
          />
        </PartySheet>
      )}
    </div>
  );
}

function NewCategoryForm({ onSave }: { onSave: (name: string, icon: string) => string | null }) {
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
        <input className="search-input expenses-icon-input" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="الرمز" maxLength={4} />
        <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم (مثلاً: المدرسة)" autoFocus />
      </div>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit" disabled={!name.trim()}>
        إضافة
      </button>
    </form>
  );
}
