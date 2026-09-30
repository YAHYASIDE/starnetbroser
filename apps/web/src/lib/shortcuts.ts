/**
 * 📌 Home-screen shortcuts: long-press any page or tool in the app to pin it on the phone's home
 * screen (PhoneShortcutLayer + the native PhoneShortcuts). Pure: which routes may be pinned, and
 * each one's icon (emoji + color) and id.
 */

export interface PhoneShortcut {
  id: string;
  label: string;
  route: string;
  emoji: string;
  color: string;
}

/** Most specific first: "/tools#pay" before "/tools". */
const LOOKS: [prefix: string, emoji: string, color: string][] = [
  ["/?action=add-account", "➕", "#2f80ff"],
  ["/?action=sync", "🔄", "#10b8cc"],
  ["/?action=clients", "👥", "#7c3aed"],
  ["/tools#pay", "💵", "#0e9f6e"],
  ["/tools#today", "✅", "#0e9f6e"],
  ["/tools#promises", "🤝", "#7c3aed"],
  ["/tools", "🧰", "#8b5cf6"],
  ["/reminders", "🔔", "#f0455f"],
  ["/clients", "👥", "#2f80ff"],
  ["/representatives", "🤝", "#7c3aed"],
  ["/reports", "📊", "#1668e3"],
  ["/store", "🛍️", "#f59e0b"],
  ["/starlink", "🛰️", "#1668e3"],
  ["/currencies", "💱", "#22c55e"],
  ["/mailboxes", "📧", "#0891b2"],
  ["/archive", "🗄️", "#64748b"],
  ["/trash", "🗑️", "#e0294a"],
  ["/settings", "⚙️", "#f5a524"],
  ["/assistant", "🤖", "#8b5cf6"],
];

/** An in-app route ("/tools#pay", "/?action=sync") - never another site or a scheme. */
export function isShortcutRoute(route: string): boolean {
  return route.length > 0 && route.length <= 200 && route.startsWith("/") && !route.startsWith("//") && !/[\s\\]/.test(route);
}

/** "/tools#pay" -> "sc_tools_pay" (stable, so pinning it again updates the same shortcut). */
export function shortcutId(route: string): string {
  const slug = route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return `sc_${slug || "home"}`.slice(0, 60);
}

/** The label a long-pressed element shows: its text without badges / digits clutter, short. */
export function shortcutLabel(text: string): string {
  const clean = text.replace(/\s+/g, " ").replace(/^[\d\s+]+|[\d\s+]+$/g, "").trim();
  return (clean || "STAR NET").slice(0, 25);
}

export function phoneShortcut(route: string, label: string): PhoneShortcut | null {
  if (!isShortcutRoute(route)) return null;
  const look = LOOKS.find(([prefix]) => route === prefix || route.startsWith(prefix)) ?? (route === "/" ? ["/", "🏠", "#2f80ff"] : ["", "★", "#2f80ff"]);
  return { id: shortcutId(route), label: shortcutLabel(label), route, emoji: look[1], color: look[2] };
}

/** Every page / tool that can be pinned, for the settings list (long-press works anywhere too). */
export const PINNABLE_PAGES: { route: string; label: string }[] = [
  { route: "/", label: "الرئيسية" },
  { route: "/?action=add-account", label: "إضافة حساب" },
  { route: "/?action=sync", label: "مزامنة الآن" },
  { route: "/tools#pay", label: "دفعة سريعة" },
  { route: "/tools#today", label: "خطة اليوم" },
  { route: "/tools#promises", label: "وعود الدفع" },
  { route: "/tools", label: "الأدوات" },
  { route: "/reminders", label: "التذكيرات" },
  { route: "/clients", label: "الزبائن" },
  { route: "/representatives", label: "المندوبون" },
  { route: "/reports", label: "التقارير" },
  { route: "/store", label: "المتجر" },
  { route: "/starlink", label: "ستارلينك والبطاقة" },
  { route: "/currencies", label: "العملات" },
  { route: "/settings", label: "الإعدادات" },
];
