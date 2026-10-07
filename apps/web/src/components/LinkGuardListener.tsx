"use client";

import { useEffect } from "react";
import { LINK_REMOVED_EVENT } from "@/lib/demoAccountStore";
import { addLocalEvent } from "@/lib/eventLog";

/** Where a save came from, in his words (lib/demoAccountStore.ts `commitDemoAccounts`). */
const SOURCE_LABELS: Record<string, string> = {
  sync: "تحديث Starlink",
  patch: "تعديل سريع على البطاقة",
  remove: "حذف بطاقة",
  tools: "الأدوات",
  "rep-transfer": "نقل زبائن للمندوب",
  "rep-loose": "زبون باسم الجهاز",
  "rep-delete": "حذف مندوب",
  "client-move": "نقل زبون",
};

/**
 * 🔗 A customer taken off a device by something other than him (his Oct 2026 report: «نربط الجهاز
 * بزبون… لا أجده مربوطًا») goes to the 🔔 list with where it came from - so if it ever happens
 * again, he sees it and we know the cause.
 */
export function LinkGuardListener() {
  useEffect(() => {
    const onRemoved = (event: Event) => {
      const detail = (event as CustomEvent<{ source: string; devices: { name: string }[] }>).detail;
      if (!detail?.devices?.length) return;
      const names = detail.devices.map((d) => d.name || "جهاز").slice(0, 5).join("، ");
      const where = SOURCE_LABELS[detail.source] ?? detail.source;
      addLocalEvent(`⚠️ أُزيل الزبون عن ${detail.devices.length} جهاز\n${names}\nالمصدر: ${where} - أرسل لقطة لهذا الإشعار للمطوّر`);
    };
    window.addEventListener(LINK_REMOVED_EVENT, onRemoved);
    return () => window.removeEventListener(LINK_REMOVED_EVENT, onRemoved);
  }, []);
  return null;
}
