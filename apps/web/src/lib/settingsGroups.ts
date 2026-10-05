/**
 * الإعدادات in colored groups: the page opens on a grid of shortcuts and shows one group at a
 * time. Pure - which group a link like "/settings#backup" opens, and the remembered choice.
 */

export type SettingsGroupId = "general" | "alerts" | "devices" | "bots" | "backup" | "security";

export interface SettingsGroup {
  id: SettingsGroupId;
  icon: string;
  title: string;
  /** The hub's small tile. */
  short: string;
  subtitle: string;
  /** CSS color token pair (var(--x) / var(--x-bg)). */
  tone: "brand" | "yellow" | "mint" | "violet" | "green" | "red";
  /** Section anchors inside the group (for links such as "/settings#backup"). */
  anchors: string[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: "general", icon: "🎨", title: "عام", short: "عام", subtitle: "المظهر، العملة، بيانات النشاط", tone: "brand", anchors: ["general"] },
  { id: "alerts", icon: "🔔", title: "التذكيرات", short: "التذكيرات", subtitle: "الصباح، المساء، الإشعارات", tone: "yellow", anchors: ["alerts"] },
  { id: "devices", icon: "🛰️", title: "الأجهزة والتحديث", short: "الأجهزة", subtitle: "المزامنة التلقائية، الجلسات", tone: "mint", anchors: ["devices", "sessions"] },
  { id: "bots", icon: "✈️", title: "البوتات", short: "البوتات", subtitle: "بوتك، بوتات المندوبين", tone: "violet", anchors: ["bots", "telegram"] },
  { id: "backup", icon: "💾", title: "النسخ الاحتياطي", short: "النسخ", subtitle: "نسخة كاملة، يومية، Google Drive", tone: "green", anchors: ["backup", "drive"] },
  { id: "security", icon: "🔒", title: "الأمان والتطبيق", short: "الأمان", subtitle: "القفل، التحديث، التخزين", tone: "red", anchors: ["security", "lock", "update"] },
];

export function isSettingsGroupId(value: string | null | undefined): value is SettingsGroupId {
  return SETTINGS_GROUPS.some((g) => g.id === value);
}

/** "#backup" -> "backup", "#sessions" -> "devices"; null when the hash names no group. */
export function groupForHash(hash: string | null | undefined): SettingsGroupId | null {
  const anchor = (hash ?? "").replace(/^#/, "").trim();
  if (!anchor) return null;
  return SETTINGS_GROUPS.find((g) => g.anchors.includes(anchor))?.id ?? null;
}

const REMEMBER_KEY = "starnet.settingsGroup";

export function loadRememberedGroup(): SettingsGroupId | null {
  try {
    const value = window.localStorage.getItem(REMEMBER_KEY);
    return isSettingsGroupId(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberGroup(id: SettingsGroupId): void {
  try {
    window.localStorage.setItem(REMEMBER_KEY, id);
  } catch {
    // a convenience only
  }
}

// ---- every setting as one folded line (and what the settings search finds) ----

export type SettingsItemId =
  | "whats-new" | "shortcuts" | "passwords" | "gmail-codes" | "card-gmail" | "theme" | "help" | "invoice-currency" | "business" | "profit-reset"
  | "reminders"
  | "auto-sync" | "sessions"
  | "telegram" | "rep-bots" | "activation-costs" | "instant-replies"
  | "backup-full" | "backup-daily" | "drive"
  | "lock" | "update" | "rep-mode" | "storage" | "server";

export interface SettingsItem {
  id: SettingsItemId;
  group: SettingsGroupId;
  icon: string;
  title: string;
  /** One short line under the title while folded. */
  summary: string;
  /** Other words the search should find it by. */
  keywords: string[];
}

export const SETTINGS_ITEMS: SettingsItem[] = [
  { id: "whats-new", group: "general", icon: "🆕", title: "ما الجديد", summary: "جولة تشرح ما تغيّر في كل تحديث", keywords: ["جديد", "تحديث", "جولة", "شرح", "تغيير"] },
  { id: "shortcuts", group: "general", icon: "📌", title: "اختصارات على شاشة الهاتف", summary: "ثبّت أي صفحة على الشاشة الرئيسية", keywords: ["اختصار", "تثبيت", "شاشة"] },
  { id: "passwords", group: "general", icon: "🔑", title: "كلمات المرور المستعملة", summary: "كل كلمات مرور الأجهزة مع النسخ", keywords: ["كلمة سر", "كلمات السر", "باسورد", "password", "مرور"] },
  { id: "gmail-codes", group: "general", icon: "📨", title: "بريد الرموز (Gmail)", summary: "رموز مايكروسوفت تُكتب وحدها", keywords: ["gmail", "جيميل", "رمز", "كود", "outlook", "مايكروسوفت"] },
  { id: "card-gmail", group: "general", icon: "💳", title: "بريد رمز البطاقة (Gmail)", summary: "رمز تأكيد البطاقة يُكتب وحده", keywords: ["gmail", "جيميل", "بطاقة", "رمز", "card", "payment", "no-reply", "starlink"] },
  { id: "theme", group: "general", icon: "🌓", title: "المظهر", summary: "داكن، فاتح، حسب الجهاز", keywords: ["داكن", "فاتح", "ليلي", "ثيم", "الوان", "ألوان"] },
  { id: "help", group: "general", icon: "💡", title: "المساعدة الذكية", summary: "تلميحات تشرح الشاشات", keywords: ["مساعدة", "شرح", "تلميحات"] },
  { id: "invoice-currency", group: "general", icon: "💱", title: "العملة الافتراضية للفواتير", summary: "عملة كل فاتورة جديدة", keywords: ["عملة", "فاتورة", "اوقية", "أوقية", "دولار"] },
  { id: "business", group: "general", icon: "🏪", title: "بيانات النشاط", summary: "الاسم والهاتف في الكشوفات و PDF", keywords: ["نشاط", "pdf", "كشف", "شعار", "هاتف"] },
  { id: "profit-reset", group: "general", icon: "🔁", title: "بداية جديدة للأرباح", summary: "تصفير الأرباح من تاريخ", keywords: ["ارباح", "أرباح", "تصفير", "بداية"] },
  { id: "reminders", group: "alerts", icon: "🔔", title: "التذكيرات والإشعارات", summary: "عدد التذكيرات، ملخص الصباح والمساء", keywords: ["تذكير", "اشعار", "إشعار", "صباح", "مساء", "ملخص"] },
  { id: "auto-sync", group: "devices", icon: "🔄", title: "تحديث الأجهزة من Starlink", summary: "المزامنة التلقائية ووقتها", keywords: ["مزامنة", "تحديث", "ستارلينك", "starlink", "تلقائي"] },
  { id: "sessions", group: "devices", icon: "🔐", title: "فحص جلسات الدخول", summary: "أي الأجهزة خرجت من Starlink", keywords: ["جلسة", "جلسات", "دخول", "خروج"] },
  { id: "telegram", group: "bots", icon: "✈️", title: "تيليغرام (بوتك)", summary: "التنبيهات والأوامر من بوتك", keywords: ["تيليغرام", "تلغرام", "telegram", "بوت"] },
  { id: "rep-bots", group: "bots", icon: "🤝", title: "بوتات المندوبين", summary: "ربط كل مندوب ببوته", keywords: ["مندوب", "مندوبين", "بوت"] },
  { id: "activation-costs", group: "bots", icon: "⚡", title: "تكلفة باقات التفعيل", summary: "أسعار التفعيل في البوت", keywords: ["تفعيل", "باقة", "تكلفة"] },
  { id: "instant-replies", group: "bots", icon: "⚡", title: "رد البوت والتطبيق مغلق", summary: "خدمة الرد في الخلفية", keywords: ["رد", "مغلق", "خلفية"] },
  { id: "backup-full", group: "backup", icon: "🔒", title: "نسخة احتياطية كاملة محمية", summary: "تصدير واستيراد بكلمة سر", keywords: ["نسخة", "احتياطي", "استيراد", "تصدير", "استرجاع", "backup"] },
  { id: "backup-daily", group: "backup", icon: "🗓️", title: "نسخ احتياطي تلقائي يومي", summary: "نسخة كل يوم في ملفات الهاتف", keywords: ["يومي", "تلقائي", "نسخة"] },
  { id: "drive", group: "backup", icon: "☁️", title: "نسخة في Google Drive", summary: "رفع تلقائي إلى درايف", keywords: ["درايف", "drive", "جوجل", "google"] },
  { id: "lock", group: "security", icon: "🔒", title: "قفل التطبيق", summary: "رمز وبصمة عند فتح التطبيق", keywords: ["قفل", "رمز", "بصمة", "pin", "امان", "أمان"] },
  { id: "update", group: "security", icon: "⬆️", title: "تحديث التطبيق", summary: "الإصدار والتحقق من نسخة أحدث", keywords: ["تحديث", "اصدار", "إصدار", "نسخة جديدة", "apk"] },
  { id: "rep-mode", group: "security", icon: "📱", title: "وضع المندوب", summary: "تحويل هذا الهاتف لهاتف مندوب", keywords: ["مندوب", "وضع"] },
  { id: "storage", group: "security", icon: "💽", title: "مساحة التخزين", summary: "ما تأخذه بيانات التطبيق", keywords: ["تخزين", "مساحة", "ذاكرة"] },
  { id: "server", group: "security", icon: "🌐", title: "عنوان الخادم والحساب", summary: "وضع العرض أو بياناتك على الخادم", keywords: ["خادم", "سيرفر", "server", "api", "حساب"] },
];

export function settingsItem(id: SettingsItemId): SettingsItem {
  return SETTINGS_ITEMS.find((i) => i.id === id)!;
}
