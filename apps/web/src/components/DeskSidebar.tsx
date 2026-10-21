"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./BottomNav";
import { DESK_SIDEBAR_KEY, deskNavGroups, isDeskNavActive } from "@/lib/deskNav";
import { isDesktopApp } from "@/lib/desktop";
import { REMINDER_COUNT_EVENT } from "@/lib/homeActions";
import { isRepAllowedPath, isRepWorkspace } from "@/lib/repMode";

/** 🖥️ The Windows app's right sidebar - in place of the bottom bar on a wide window (globals.css
 * «Windows layout»; a narrow window keeps the phone's bottom bar). It folds to its icons (with
 * their names as tips), remembered. Never rendered on the phone. */
export function DeskSidebar() {
  const pathname = usePathname();
  const [desk, setDesk] = useState(false);
  const [rep, setRep] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [reminders, setReminders] = useState(0);
  useEffect(() => {
    setDesk(isDesktopApp());
    setRep(isRepWorkspace());
    setCollapsed(document.documentElement.classList.contains("desk-collapsed"));
    const onCount = (event: Event) => setReminders((event as CustomEvent<number>).detail ?? 0);
    window.addEventListener(REMINDER_COUNT_EVENT, onCount);
    return () => window.removeEventListener(REMINDER_COUNT_EVENT, onCount);
  }, []);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle("desk-collapsed", next);
    try {
      window.localStorage.setItem(DESK_SIDEBAR_KEY, next ? "collapsed" : "open");
    } catch {
      // Only this window remembers it then.
    }
  }
  if (!desk || pathname === "/session") return null;
  const groups = deskNavGroups(rep, isRepAllowedPath);
  return (
    <nav className="desk-sidebar" aria-label="التنقل الرئيسي">
      <Link href="/" className="desk-brand" data-tip="STAR NET">
        <span className="desk-brand-mark" aria-hidden="true">★</span>
        <span className="desk-brand-name">STAR NET</span>
      </Link>
      {groups.map((group) => (
        <div key={group.title} className="desk-nav-group">
          <span className="desk-nav-title">{group.title}</span>
          {group.items.map((item) => {
            const active = isDeskNavActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`desk-nav-item${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                data-tip={item.label}
              >
                <span className="desk-nav-icon" aria-hidden="true">
                  <NavIcon name={item.icon} />
                </span>
                <span className="desk-nav-label">{item.label}</span>
                {item.icon === "bell" && reminders > 0 && <b className="desk-nav-badge desk-num">{reminders > 99 ? "99+" : reminders}</b>}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="desk-sidebar-foot">
        <button type="button" className="desk-nav-item desk-collapse" onClick={toggle} aria-expanded={!collapsed} data-tip={collapsed ? "فتح القائمة" : "طي القائمة"}>
          <span className="desk-nav-icon" aria-hidden="true">
            <NavIcon name="chevron" />
          </span>
          <span className="desk-nav-label">طي القائمة</span>
        </button>
        <span className="desk-zoom-hint">
          تكبير <kbd>Ctrl +</kbd> · تصغير <kbd>Ctrl −</kbd>
        </span>
      </div>
    </nav>
  );
}

/** The open windows, the last one on top (the phone's bottom sheets and the dialogs). */
const LAYERS = ".party-sheet-backdrop, .dialog-backdrop, .shortcut-sheet-layer, .bottom-nav-sheet-backdrop, .more-menu-layer, .whatsapp-menu-backdrop, .proof-viewer-backdrop";

/** 🖥️ The keyboard, as everywhere on Windows: Esc closes the top window (its ✕ when it has one,
 * else a click on its dimmed backdrop - what closes it on the phone); Ctrl K goes to the search. */
export function DeskKeys() {
  useEffect(() => {
    if (!isDesktopApp()) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "K" || event.code === "KeyK")) {
        const search = document.querySelector<HTMLInputElement>(".desk-search input");
        if (search) {
          event.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const layers = Array.from(document.querySelectorAll<HTMLElement>(LAYERS));
      const top = layers[layers.length - 1];
      if (!top) return;
      event.preventDefault();
      const close = top.querySelector<HTMLElement>(".dialog-close, [aria-label='إغلاق']");
      if (close) close.click();
      else top.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
