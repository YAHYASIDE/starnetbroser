"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./BottomNav";
import { deskNavGroups, isDeskNavActive } from "@/lib/deskNav";
import { isDesktopApp } from "@/lib/desktop";
import { REMINDER_COUNT_EVENT } from "@/lib/homeActions";
import { isRepAllowedPath, isRepWorkspace } from "@/lib/repMode";

/** 🖥️ The Windows app's right sidebar - in place of the bottom bar on a wide window (globals.css
 * «Windows layout»; a narrow window keeps the phone's bottom bar). Never rendered on the phone. */
export function DeskSidebar() {
  const pathname = usePathname();
  const [desk, setDesk] = useState(false);
  const [rep, setRep] = useState(false);
  const [reminders, setReminders] = useState(0);
  useEffect(() => {
    setDesk(isDesktopApp());
    setRep(isRepWorkspace());
    const onCount = (event: Event) => setReminders((event as CustomEvent<number>).detail ?? 0);
    window.addEventListener(REMINDER_COUNT_EVENT, onCount);
    return () => window.removeEventListener(REMINDER_COUNT_EVENT, onCount);
  }, []);
  if (!desk || pathname === "/session") return null;
  const groups = deskNavGroups(rep, isRepAllowedPath);
  return (
    <nav className="desk-sidebar" aria-label="التنقل الرئيسي">
      <Link href="/" className="desk-brand">
        <span className="desk-brand-mark" aria-hidden="true">★</span>
        <span>STAR NET</span>
      </Link>
      {groups.map((group) => (
        <div key={group.title} className="desk-nav-group">
          <span className="desk-nav-title">{group.title}</span>
          {group.items.map((item) => {
            const active = isDeskNavActive(item.href, pathname);
            return (
              <Link key={item.href} href={item.href} className={`desk-nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                <span className="desk-nav-icon" aria-hidden="true">
                  <NavIcon name={item.icon} />
                </span>
                <span className="desk-nav-label">{item.label}</span>
                {item.icon === "bell" && reminders > 0 && <b className="desk-nav-badge">{reminders > 99 ? "99+" : reminders}</b>}
              </Link>
            );
          })}
        </div>
      ))}
      <span className="desk-zoom-hint">
        <span>التكبير والتصغير</span>
        <bdi dir="ltr">Ctrl +   Ctrl −   Ctrl 0</bdi>
      </span>
    </nav>
  );
}

/** The open windows, the last one on top (the phone's bottom sheets and the dialogs). */
const LAYERS = ".party-sheet-backdrop, .dialog-backdrop, .shortcut-sheet-layer, .bottom-nav-sheet-backdrop, .more-menu-layer, .whatsapp-menu-backdrop, .proof-viewer-backdrop";

/** 🖥️ Esc closes the top window, as everywhere on Windows: its ✕ when it has one, else a click
 * on its dimmed backdrop (what closes it on the phone). Typing in a field is left alone. */
export function DeskKeys() {
  useEffect(() => {
    if (!isDesktopApp()) return;
    const onKey = (event: KeyboardEvent) => {
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
