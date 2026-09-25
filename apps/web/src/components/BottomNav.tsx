"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Global bottom navigation, rendered once in the root layout so it persists across every route.
 * DOM order below maps right-to-left under this app's dir="rtl" (first child renders rightmost) -
 * so الرئيسية comes first in markup to land on the right, matching the requested layout.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const SHEET_DESTINATIONS = ["/currencies", "/trash", "/archive", "/reminders"];
  const onSheetDestination = SHEET_DESTINATIONS.includes(pathname ?? "");

  // The embedded remote-browser view (cloud session) is meant to be full-screen and immersive,
  // the same reasoning the local Android WebView browsing screen already follows - a persistent
  // nav bar over it would be intrusive and steal space from an already cramped viewer.
  if (pathname === "/session") return null;

  const tabs: { href: string; label: string; icon: string }[] = [
    { href: "/", label: "الرئيسية", icon: "🏠" },
    { href: "/clients", label: "الزبائن", icon: "👥" },
    { href: "/reports", label: "الأرباح وتقارير", icon: "📊" },
    { href: "/representatives", label: "المندوبون", icon: "🤝" },
    { href: "/store", label: "المتجر", icon: "🛍️" },
  ];

  return (
    <>
      {sheetOpen && (
        <div className="bottom-nav-sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
          <div className="bottom-nav-sheet" role="menu" onClick={(e) => e.stopPropagation()}>
            <Link href="/reminders" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <span aria-hidden="true">🔔</span>
              التذكيرات
            </Link>
            <Link href="/currencies" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <span aria-hidden="true">💱</span>
              العملات
            </Link>
            <Link href="/trash" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <span aria-hidden="true">🗑️</span>
              سلة المحذوفات
            </Link>
            <Link href="/archive" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <span aria-hidden="true">📦</span>
              الأرشيف
            </Link>
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav-item${pathname === tab.href ? " bottom-nav-item-active" : ""}`}
          >
            <span className="bottom-nav-icon" aria-hidden="true">{tab.icon}</span>
            <span className="bottom-nav-label">{tab.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`bottom-nav-item bottom-nav-plus${sheetOpen || onSheetDestination ? " bottom-nav-item-active" : ""}`}
          onClick={() => setSheetOpen((v) => !v)}
          aria-expanded={sheetOpen}
          aria-label="المزيد"
        >
          <span className="bottom-nav-icon" aria-hidden="true">➕</span>
          <span className="bottom-nav-label">المزيد</span>
        </button>
      </nav>
    </>
  );
}
