/**
 * 🔑 «صلاحيات المندوب» (his Oct 17 2026 ask: «أي مندوب سأرسل له نسخة، قبل الإرسال تأتيني قائمة بالصلاحيات
 * التي سأعطيه… ما عنده الآن كلها عليها صح والأخرى لا… وزر البحث عن أي ميزة، والميزات مفروزة»).
 * Each rep keeps his list (`Representative.permissions`; none yet = what every rep had until now);
 * his copy carries it, and his phone opens only those pages, menus and settings (`repCan`).
 */

import { loadRepCopy } from "./repCopy";

export type RepFeatureGroup = "pages" | "devices" | "sync" | "alerts" | "data";

/** The groups in their order on the list. */
export const REP_FEATURE_GROUPS: { id: RepFeatureGroup; title: string }[] = [
  { id: "pages", title: "📄 الصفحات" },
  { id: "devices", title: "🛰️ الأجهزة" },
  { id: "sync", title: "🔄 المزامنة" },
  { id: "alerts", title: "🔔 الإشعارات" },
  { id: "data", title: "💾 البيانات والأمان" },
];

export interface RepFeature {
  id: string;
  group: RepFeatureGroup;
  icon: string;
  label: string;
  hint: string;
  /** A page it opens (its sub-pages too). */
  path?: string;
  /** Every rep had it until now - ticked by default. */
  base: boolean;
  /** Always on (the app can't work without it). */
  locked?: boolean;
  keywords?: string[];
}

/** ✂️ «إضافة جهاز مبسّطة» (a restriction, ticked = fewer fields). */
export const SIMPLE_ADD_DEVICE = "act:add-device-simple";

export const REP_FEATURES: RepFeature[] = [
  // 📄 pages
  { id: "page:home", group: "pages", icon: "🏠", label: "الرئيسية", hint: "أجهزته وبطاقاتها", path: "/", base: true, locked: true },
  { id: "page:clients", group: "pages", icon: "👥", label: "الزبائن", hint: "زبائنه وكشوفاتهم", path: "/clients", base: true, keywords: ["زبون", "كشف"] },
  { id: "page:my-reports", group: "pages", icon: "📊", label: "تقاريري", hint: "حسابه معك", path: "/representatives", base: true, keywords: ["حساب", "مندوب"] },
  { id: "page:reminders", group: "pages", icon: "🔔", label: "التذكيرات", hint: "تذكيرات أجهزته", path: "/reminders", base: true },
  { id: "page:tools", group: "pages", icon: "🧰", label: "الأدوات", hint: "دفعة سريعة، خطة اليوم، وعود الدفع", path: "/tools", base: true, keywords: ["دفعة", "خطة", "وعود"] },
  { id: "page:reports", group: "pages", icon: "📈", label: "التقارير", hint: "أرقام أجهزته", path: "/reports", base: true, keywords: ["ربح", "أرقام"] },
  { id: "page:currencies", group: "pages", icon: "💱", label: "العملات", hint: "أسعار الصرف", path: "/currencies", base: true, keywords: ["سعر", "صرف", "أوقية", "سيفا"] },
  { id: "page:mailboxes", group: "pages", icon: "📧", label: "البريد المسجّل", hint: "صناديق بريد أجهزته", path: "/mailboxes", base: true, keywords: ["إيميل", "بريد", "outlook"] },
  { id: "page:settings", group: "pages", icon: "⚙️", label: "الإعدادات", hint: "إعدادات هاتفه", path: "/settings", base: true, locked: true },
  { id: "page:store", group: "pages", icon: "🛍️", label: "المتجر", hint: "الفواتير والمخزون على هاتفه", path: "/store", base: false, keywords: ["فاتورة", "مخزون", "بيع"] },
  { id: "page:starlink", group: "pages", icon: "💳", label: "ستارلينك والبطاقة", hint: "رصيد البطاقة وتكلفة ستارلينك", path: "/starlink", base: false, keywords: ["بطاقة", "kast", "تكلفة"] },
  { id: "page:money", group: "pages", icon: "💰", label: "حسابي", hint: "لوحة المال على بياناته فقط", path: "/money", base: false, keywords: ["مال", "كاش", "ربح"] },
  { id: "page:archive", group: "pages", icon: "🗄️", label: "الأرشيف", hint: "أجهزته المؤرشفة", path: "/archive", base: false },
  { id: "page:trash", group: "pages", icon: "🗑️", label: "سلة المحذوفات", hint: "أجهزته المحذوفة", path: "/trash", base: false, keywords: ["حذف", "استرجاع"] },
  // 🛰️ devices
  { id: "act:add-device", group: "devices", icon: "➕", label: "إضافة جهاز", hint: "«إضافة حساب» في المزيد", base: true, keywords: ["حساب", "جديد"] },
  // ✂️ His Oct 25 2026 ask for «الحافظ» only: the add form without «إنشاء حساب», the customer and the
  // note, and the rep fixed on himself. A restriction, so off by default (every other rep keeps it all).
  { id: SIMPLE_ADD_DEVICE, group: "devices", icon: "✂️", label: "إضافة جهاز مبسّطة", hint: "بلا إنشاء حساب ولا زبون ولا ملاحظة - المندوب ثابت عليه", base: false, keywords: ["مبسط", "زبون", "ملاحظة", "انشاء"] },
  { id: "act:send-devices", group: "devices", icon: "📱", label: "أجهزة للإرسال", hint: "يرسل لك أجهزة جديدة", base: true, keywords: ["إرسال", "جديد"] },
  // 🔄 sync
  { id: "sync:now", group: "sync", icon: "🔄", label: "مزامنة الآن", hint: "من المزيد", base: true, keywords: ["تحديث", "ستارلينك"] },
  { id: "sync:background", group: "sync", icon: "🌙", label: "المزامنة في الخلفية", hint: "دون فتح الصفحات", base: true, keywords: ["خلفية"] },
  { id: "sync:scheduled", group: "sync", icon: "⏰", label: "مزامنات مجدولة", hint: "صباح أجهزة اليوم، فحص الدفع، بعد 429، ملخص الليل", base: true, keywords: ["صباح", "دفع", "429", "ليل"] },
  // 🔔 alerts
  { id: "alerts:summaries", group: "alerts", icon: "🌅", label: "ملخص الصباح والمساء", hint: "إشعارات الملخص", base: true, keywords: ["إشعار", "ملخص"] },
  // 💾 data
  { id: "data:business", group: "data", icon: "🏪", label: "بيانات النشاط", hint: "اسمه وهاتفه في الكشوفات", base: true, keywords: ["نشاط", "شعار", "pdf"] },
  { id: "data:lock", group: "data", icon: "🔒", label: "قفل التطبيق", hint: "رمز وبصمة", base: true, locked: true },
  { id: "data:backup", group: "data", icon: "💾", label: "النسخ الاحتياطي على هاتفه", hint: "نسخة كاملة ونسخة يومية من بياناته", base: false, keywords: ["نسخة", "احتياطي", "استيراد"] },
];

const BY_ID = new Map(REP_FEATURES.map((f) => [f.id, f]));

/** What every rep had until now. */
export function basePermissions(): string[] {
  return REP_FEATURES.filter((f) => f.base).map((f) => f.id);
}

/** A rep's ticked features: his own list (plus the always-on ones), or the base list if he has none. */
export function permissionsOf(rep: { permissions?: string[] } | undefined): Set<string> {
  const ids = rep?.permissions ?? basePermissions();
  return new Set([...ids.filter((id) => BY_ID.has(id)), ...REP_FEATURES.filter((f) => f.locked).map((f) => f.id)]);
}

/** Arabic search folding: no diacritics, أ/إ/آ = ا, ة = ه, ى = ي, any case. */
export function foldArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

/** The list as shown: by group, then by name; only what matches the search. */
export function featureSections(query = ""): { id: RepFeatureGroup; title: string; features: RepFeature[] }[] {
  const q = foldArabic(query);
  const matches = (f: RepFeature) =>
    !q || [f.label, f.hint, ...(f.keywords ?? []), REP_FEATURE_GROUPS.find((g) => g.id === f.group)?.title ?? ""].some((t) => foldArabic(t).includes(q));
  return REP_FEATURE_GROUPS.map((g) => ({
    ...g,
    features: REP_FEATURES.filter((f) => f.group === g.id && matches(f)).sort((a, b) => a.label.localeCompare(b.label, "ar")),
  })).filter((g) => g.features.length > 0);
}

/** What changes compared to now: added and removed, by name. */
export function permissionChanges(before: Set<string>, after: Set<string>): { added: string[]; removed: string[] } {
  const name = (id: string) => BY_ID.get(id)?.label ?? id;
  return {
    added: [...after].filter((id) => !before.has(id)).map(name),
    removed: [...before].filter((id) => !after.has(id)).map(name),
  };
}

/** The pages these permissions open. */
export function allowedPaths(perms: Set<string>): string[] {
  return REP_FEATURES.filter((f) => f.path && perms.has(f.id)).map((f) => f.path!);
}

export function pathAllowed(pathname: string, paths: string[]): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return paths.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`)));
}

// ---- on the rep's phone ----

/** What the operator gave this phone (the last copy), the base list for an older copy. */
export function repPermissions(): Set<string> {
  return permissionsOf(loadRepCopy() ?? undefined);
}
