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
  const SHEET_DESTINATIONS = ["/starlink", "/currencies", "/trash", "/archive", "/reminders"];
  const onSheetDestination = SHEET_DESTINATIONS.includes(pathname ?? "");

  // The embedded remote-browser view (cloud session) is meant to be full-screen and immersive,
  // the same reasoning the local Android WebView browsing screen already follows - a persistent
  // nav bar over it would be intrusive and steal space from an already cramped viewer.
  if (pathname === "/session") return null;

  const tabs: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: "الرئيسية", icon: "home" },
    { href: "/clients", label: "الزبائن", icon: "people" },
    { href: "/reports", label: "التقارير", icon: "chart" },
    { href: "/representatives", label: "المندوبون", icon: "handshake" },
    { href: "/store", label: "المتجر", icon: "bag" },
  ];

  return (
    <>
      {sheetOpen && (
        <div className="bottom-nav-sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
          <div className="bottom-nav-sheet" role="menu" onClick={(e) => e.stopPropagation()}>
            <Link href="/starlink" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <NavIcon name="card" />
              ستارلينك والبطاقة
            </Link>
            <Link href="/reminders" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <NavIcon name="bell" />
              التذكيرات
            </Link>
            <Link href="/currencies" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <NavIcon name="coins" />
              العملات
            </Link>
            <Link href="/trash" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <NavIcon name="trash" />
              سلة المحذوفات
            </Link>
            <Link href="/archive" className="bottom-nav-sheet-item" onClick={() => setSheetOpen(false)}>
              <NavIcon name="archive" />
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
            <span className="bottom-nav-icon" aria-hidden="true"><NavIcon name={tab.icon} /></span>
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
          <span className="bottom-nav-icon" aria-hidden="true"><NavIcon name="more" /></span>
          <span className="bottom-nav-label">المزيد</span>
        </button>
      </nav>
    </>
  );
}

type IconName = "home" | "people" | "chart" | "handshake" | "bag" | "more" | "bell" | "coins" | "trash" | "archive" | "card";

/** Line icons shared by the bottom bar and its "المزيد" sheet (stroke = currentColor). */
function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, JSX.Element> = {
    home: <path d="M4 11 12 4l8 7v9H4z" />,
    people: (
      <>
        <circle cx="9" cy="8" r="3.3" />
        <path d="M3.5 19.5c0-3 2.5-5.3 5.5-5.3s5.5 2.3 5.5 5.3M16 11a3 3 0 0 0 0-6M17 14.5c2.3.4 4 2.3 4 5" />
      </>
    ),
    chart: <path d="M5 20V10M12 20V4M19 20v-7" />,
    handshake: <path d="m3 12 4-4 4 2 3-2 7 5-4 4-3-2-2 2-3-2-2 1zM11 10l3 3" />,
    bag: (
      <>
        <path d="M4 8h16l-1.5 11h-13z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.3" />
        <circle cx="12" cy="12" r="1.3" />
        <circle cx="19" cy="12" r="1.3" />
      </>
    ),
    bell: (
      <>
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </>
    ),
    coins: (
      <>
        <circle cx="9" cy="9" r="5.5" />
        <circle cx="15" cy="15" r="5.5" />
      </>
    ),
    trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
    card: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </>
    ),
    archive: (
      <>
        <path d="M3 5h18v4H3zM5 9v10h14V9" />
        <path d="M10 13h4" />
      </>
    ),
  };
  return <svg viewBox="0 0 24 24">{paths[name]}</svg>;
}
