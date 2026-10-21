/**
 * 🖥️ The Windows app's right sidebar (his Oct 21 2026 choice: «شريط جانبي على اليمين» instead of the
 * phone's bottom bar): every page by name, in two groups - the daily pages (the phone's bottom
 * tabs, same order) and the rest (the phone's two «المزيد» lists). A rep sees only what the
 * operator gave him.
 */

export type DeskIcon = "home" | "dish" | "people" | "chart" | "handshake" | "bag" | "bell" | "coins" | "trash" | "archive" | "card" | "settings" | "tools" | "mail";

export interface DeskNavItem {
  href: string;
  label: string;
  icon: DeskIcon;
}

export interface DeskNavGroup {
  title: string;
  items: DeskNavItem[];
}

/** By what the page is for: the day's work, the money, the helpers, the app itself. */
const OWNER_GROUPS: DeskNavGroup[] = [
  {
    title: "العمل",
    items: [
      { href: "/", label: "الرئيسية", icon: "home" },
      { href: "/devices", label: "الأجهزة", icon: "dish" },
      { href: "/clients", label: "الزبائن", icon: "people" },
      { href: "/representatives", label: "المندوبون", icon: "handshake" },
      { href: "/reminders", label: "التذكيرات", icon: "bell" },
    ],
  },
  {
    title: "المال",
    items: [
      { href: "/money", label: "حسابي", icon: "coins" },
      { href: "/reports", label: "التقارير", icon: "chart" },
      { href: "/store", label: "المتجر", icon: "bag" },
      { href: "/starlink", label: "ستارلينك والبطاقة", icon: "card" },
      { href: "/currencies", label: "العملات", icon: "coins" },
    ],
  },
  {
    title: "أدوات",
    items: [
      { href: "/tools", label: "الأدوات والتوقعات", icon: "tools" },
      { href: "/mailboxes", label: "البريد المسجّل", icon: "mail" },
    ],
  },
  {
    title: "النظام",
    items: [
      { href: "/archive", label: "الأرشيف", icon: "archive" },
      { href: "/trash", label: "سلة المحذوفات", icon: "trash" },
      { href: "/settings", label: "الإعدادات", icon: "settings" },
    ],
  },
];

const REP_GROUPS: DeskNavGroup[] = [
  {
    title: "العمل",
    items: [
      { href: "/", label: "الرئيسية", icon: "home" },
      { href: "/devices", label: "الأجهزة", icon: "dish" },
      { href: "/clients", label: "الزبائن", icon: "people" },
      { href: "/representatives", label: "تقاريري", icon: "chart" },
      { href: "/reminders", label: "التذكيرات", icon: "bell" },
    ],
  },
  {
    title: "المال",
    items: [
      { href: "/money", label: "حسابي", icon: "coins" },
      { href: "/reports", label: "التقارير", icon: "chart" },
      { href: "/store", label: "المتجر", icon: "bag" },
      { href: "/starlink", label: "ستارلينك والبطاقة", icon: "card" },
      { href: "/currencies", label: "العملات", icon: "coins" },
    ],
  },
  {
    title: "أدوات",
    items: [
      { href: "/tools", label: "الأدوات", icon: "tools" },
      { href: "/mailboxes", label: "البريد المسجّل", icon: "mail" },
    ],
  },
  {
    title: "النظام",
    items: [
      { href: "/archive", label: "الأرشيف", icon: "archive" },
      { href: "/trash", label: "سلة المحذوفات", icon: "trash" },
      { href: "/settings", label: "الإعدادات", icon: "settings" },
    ],
  },
];

/** `allowed(path)` is the rep's permission check (ignored for the owner); «الأجهزة» goes with «الرئيسية».
 * Empty groups are left out. */
export function deskNavGroups(rep: boolean, allowed: (path: string) => boolean = () => true): DeskNavGroup[] {
  const groups = rep ? REP_GROUPS : OWNER_GROUPS;
  const keep = (item: DeskNavItem) => !rep || allowed(item.href === "/devices" ? "/" : item.href);
  return groups.map((g) => ({ ...g, items: g.items.filter(keep) })).filter((g) => g.items.length > 0);
}

/** The sidebar row that is the open page: exact for «الرئيسية», a page and its sub-pages otherwise. */
export function isDeskNavActive(href: string, pathname: string | null | undefined): boolean {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

/** The sidebar folded to its icons («طي القائمة») - a setting of this laptop, not backed up. */
export const DESK_SIDEBAR_KEY = "starnet.deskSidebar";
