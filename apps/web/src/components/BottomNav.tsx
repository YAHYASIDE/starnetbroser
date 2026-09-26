"use client";

import { CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HOME_ACTION_EVENT, HomeAction, homeActionHref, REMINDER_COUNT_EVENT } from "@/lib/homeActions";
import { isRunningInAndroidApp } from "@/lib/localBrowser";

type MoreItem = { label: string; icon: IconName; color: string; tint: string } & ({ href: string } | { action: HomeAction });

/**
 * Global bottom navigation, rendered once in the root layout so it persists across every route.
 * DOM order below maps right-to-left under this app's dir="rtl" (first child renders rightmost) -
 * so الرئيسية comes first in markup to land on the right, matching the requested layout.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const [inApp, setInApp] = useState(false);
  const SHEET_DESTINATIONS = ["/starlink", "/currencies", "/trash", "/archive", "/reminders", "/settings"];
  const onSheetDestination = SHEET_DESTINATIONS.includes(pathname ?? "");

  useEffect(() => {
    setInApp(isRunningInAndroidApp());
    const onCount = (event: Event) => setReminderCount((event as CustomEvent<number>).detail ?? 0);
    window.addEventListener(REMINDER_COUNT_EVENT, onCount);
    return () => window.removeEventListener(REMINDER_COUNT_EVENT, onCount);
  }, []);

  useEffect(() => setSheetOpen(false), [pathname]);

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

  // "المزيد": listed bottom (nearest the thumb) to top.
  const moreItems: MoreItem[] = [
    { label: "إضافة حساب", icon: "plus", color: "#2f80ff", tint: "#d6e6ff", action: "add-account" },
    ...(inApp ? [{ label: "مزامنة الآن", icon: "sync" as const, color: "#10b8cc", tint: "#d2f4f8", action: "sync" as const }] : []),
    { label: "التذكيرات", icon: "bell", color: "#f0455f", tint: "#ffd9df", href: "/reminders" },
    { label: "العملاء", icon: "people", color: "#8b5cf6", tint: "#e6dcff", action: "clients" },
    { label: "ستارلينك والبطاقة", icon: "card", color: "#1668e3", tint: "#d6e3fb", href: "/starlink" },
    { label: "العملات", icon: "coins", color: "#22c55e", tint: "#d4f7e1", href: "/currencies" },
    { label: "الأرشيف", icon: "archive", color: "#64748b", tint: "#e2e8f0", href: "/archive" },
    { label: "سلة المحذوفات", icon: "trash", color: "#e0294a", tint: "#ffd6de", href: "/trash" },
    { label: "الإعدادات", icon: "settings", color: "#f5a524", tint: "#ffecc7", href: "/settings" },
  ];

  function runAction(action: HomeAction) {
    setSheetOpen(false);
    if (pathname === "/") window.dispatchEvent(new CustomEvent(HOME_ACTION_EVENT, { detail: action }));
    else router.push(homeActionHref(action));
  }

  return (
    <>
      {sheetOpen && (
        <div className="more-menu-layer" role="presentation" onClick={() => setSheetOpen(false)}>
          <ul className="more-menu" role="menu" aria-label="المزيد">
            {moreItems.map((item, index) => {
              const style = { "--more-color": item.color, "--more-tint": item.tint, "--more-delay": `${index * 35}ms` } as CSSProperties;
              const content = (
                <>
                  <span className="more-menu-icon" aria-hidden="true">
                    <NavIcon name={item.icon} />
                    {item.icon === "bell" && reminderCount > 0 && <span className="more-menu-badge">{reminderCount > 9 ? "9+" : reminderCount}</span>}
                  </span>
                  <span className="more-menu-label">{item.label}</span>
                </>
              );
              return (
                <li key={item.label} className="more-menu-row" style={style} onClick={(e) => e.stopPropagation()}>
                  {"href" in item ? (
                    <Link href={item.href} className="more-menu-item" role="menuitem" onClick={() => setSheetOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    <button type="button" className="more-menu-item" role="menuitem" onClick={() => runAction(item.action)}>
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
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
          className={`bottom-nav-item bottom-nav-plus${sheetOpen ? " bottom-nav-more-open" : ""}${sheetOpen || onSheetDestination ? " bottom-nav-item-active" : ""}`}
          onClick={() => setSheetOpen((v) => !v)}
          aria-expanded={sheetOpen}
          aria-label={sheetOpen ? "إغلاق" : "المزيد"}
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            <NavIcon name={sheetOpen ? "close" : "more"} />
            {!sheetOpen && reminderCount > 0 && <span className="bottom-nav-dot" />}
          </span>
          <span className="bottom-nav-label">المزيد</span>
        </button>
      </nav>
    </>
  );
}

type IconName =
  | "home" | "people" | "chart" | "handshake" | "bag" | "more" | "bell" | "coins" | "trash" | "archive" | "card"
  | "plus" | "sync" | "settings" | "close";

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
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    sync: <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14v-4a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1.1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z" />
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
