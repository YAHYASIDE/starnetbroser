/**
 * 🖥️ The Windows app's right sidebar (his Oct 21 2026 choice: «شريط جانبي على اليمين» instead of the
 * phone's bottom bar): every page by name, in two groups - the daily pages (the phone's bottom
 * tabs, same order) and the rest (the phone's two «المزيد» lists). A rep sees only what the
 * operator gave him.
 */

export type DeskIcon = "home" | "people" | "chart" | "handshake" | "bag" | "bell" | "coins" | "trash" | "archive" | "card" | "settings" | "tools" | "mail";

export interface DeskNavItem {
  href: string;
  label: string;
  icon: DeskIcon;
}

export interface DeskNavGroup {
  title: string;
  items: DeskNavItem[];
}

const OWNER_MAIN: DeskNavItem[] = [
  { href: "/", label: "الرئيسية", icon: "home" },
  { href: "/clients", label: "الزبائن", icon: "people" },
  { href: "/money", label: "حسابي", icon: "coins" },
  { href: "/representatives", label: "المندوبون", icon: "handshake" },
  { href: "/reports", label: "التقارير", icon: "chart" },
];

const OWNER_MORE: DeskNavItem[] = [
  { href: "/store", label: "المتجر", icon: "bag" },
  { href: "/starlink", label: "ستارلينك والبطاقة", icon: "card" },
  { href: "/tools", label: "الأدوات والتوقعات", icon: "tools" },
  { href: "/reminders", label: "التذكيرات", icon: "bell" },
  { href: "/currencies", label: "العملات", icon: "coins" },
  { href: "/mailboxes", label: "البريد المسجّل", icon: "mail" },
  { href: "/archive", label: "الأرشيف", icon: "archive" },
  { href: "/trash", label: "سلة المحذوفات", icon: "trash" },
  { href: "/settings", label: "الإعدادات", icon: "settings" },
];

const REP_MAIN: DeskNavItem[] = [
  { href: "/", label: "الرئيسية", icon: "home" },
  { href: "/clients", label: "الزبائن", icon: "people" },
  { href: "/representatives", label: "تقاريري", icon: "chart" },
  { href: "/reminders", label: "التذكيرات", icon: "bell" },
  { href: "/tools", label: "الأدوات", icon: "tools" },
];

const REP_MORE: DeskNavItem[] = [
  { href: "/reports", label: "التقارير", icon: "chart" },
  { href: "/store", label: "المتجر", icon: "bag" },
  { href: "/starlink", label: "ستارلينك والبطاقة", icon: "card" },
  { href: "/money", label: "حسابي", icon: "coins" },
  { href: "/currencies", label: "العملات", icon: "coins" },
  { href: "/mailboxes", label: "البريد المسجّل", icon: "mail" },
  { href: "/archive", label: "الأرشيف", icon: "archive" },
  { href: "/trash", label: "سلة المحذوفات", icon: "trash" },
  { href: "/settings", label: "الإعدادات", icon: "settings" },
];

/** `allowed(path)` is the rep's permission check (ignored for the owner). Empty groups are left out. */
export function deskNavGroups(rep: boolean, allowed: (path: string) => boolean = () => true): DeskNavGroup[] {
  const keep = (items: DeskNavItem[]) => (rep ? items.filter((i) => allowed(i.href)) : items);
  return [
    { title: "اليومي", items: keep(rep ? REP_MAIN : OWNER_MAIN) },
    { title: "المزيد", items: keep(rep ? REP_MORE : OWNER_MORE) },
  ].filter((g) => g.items.length > 0);
}

/** The sidebar row that is the open page: exact for «الرئيسية», a page and its sub-pages otherwise. */
export function isDeskNavActive(href: string, pathname: string | null | undefined): boolean {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}
