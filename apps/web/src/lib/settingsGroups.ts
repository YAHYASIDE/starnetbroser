/**
 * الإعدادات in colored groups: the page opens on a grid of shortcuts and shows one group at a
 * time. Pure - which group a link like "/settings#backup" opens, and the remembered choice.
 */

export type SettingsGroupId = "general" | "alerts" | "devices" | "bots" | "backup" | "security";

export interface SettingsGroup {
  id: SettingsGroupId;
  icon: string;
  title: string;
  subtitle: string;
  /** CSS color token pair (var(--x) / var(--x-bg)). */
  tone: "brand" | "yellow" | "mint" | "violet" | "green" | "red";
  /** Section anchors inside the group (for links such as "/settings#backup"). */
  anchors: string[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: "general", icon: "🎨", title: "عام", subtitle: "المظهر، العملة، بيانات النشاط", tone: "brand", anchors: ["general"] },
  { id: "alerts", icon: "🔔", title: "التذكيرات", subtitle: "الصباح، المساء، الإشعارات", tone: "yellow", anchors: ["alerts"] },
  { id: "devices", icon: "🛰️", title: "الأجهزة والتحديث", subtitle: "المزامنة التلقائية، الجلسات", tone: "mint", anchors: ["devices", "sessions"] },
  { id: "bots", icon: "✈️", title: "البوتات", subtitle: "بوتك، بوتات المندوبين", tone: "violet", anchors: ["bots", "telegram"] },
  { id: "backup", icon: "💾", title: "النسخ الاحتياطي", subtitle: "نسخة كاملة، يومية، Google Drive", tone: "green", anchors: ["backup", "drive"] },
  { id: "security", icon: "🔒", title: "الأمان والتطبيق", subtitle: "القفل، التحديث، التخزين", tone: "red", anchors: ["security", "lock", "update"] },
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
