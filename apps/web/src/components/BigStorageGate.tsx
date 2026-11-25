"use client";

import { useEffect, useState, type ReactNode } from "react";
import { startBigStorage, type StartResult } from "@/lib/bigStorage";
import { BOOT_OK_AFTER_MS, markBootOk } from "@/lib/safeMode";

/**
 * 🗄️ Nothing of the app reads its data before the big storage (lib/bigStorage.ts) is loaded into memory - the first
 * start also moves the data there. If this phone already moved and IndexedDB won't open, the app does NOT open on the
 * incomplete localStorage: «أعد المحاولة».
 */
export function BigStorageGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StartResult | null>(null);
  const [slow, setSlow] = useState(false);
  // an open that stays up 20 seconds is a good one - even on the lock screen (lib/safeMode.ts: two bad opens in a row
  // enter the safe mode by themselves)
  useEffect(() => {
    const t = window.setTimeout(markBootOk, BOOT_OK_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => alive && setSlow(true), 6000);
    void startBigStorage().then((r) => {
      window.clearTimeout(t);
      if (alive) setState(r);
    });
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);
  if (state && (state.kind !== "failed" || !state.migrated)) return <>{children}</>;
  if (!state && !slow) return null;
  return (
    <div className="bigstore-wait" role="alert">
      <strong>{state ? "تعذّر فتح بيانات التطبيق" : "جارٍ فتح بيانات التطبيق…"}</strong>
      <p>
        {state
          ? "بياناتك محفوظة في ذاكرة الهاتف الكبيرة لكن لم تُفتح الآن. أغلق التطبيق تمامًا ثم افتحه، أو اضغط «أعد المحاولة». لا تمسح بيانات التطبيق."
          : "قد يأخذ هذا ثواني في أول تشغيل بعد التحديث (نقل البيانات إلى مساحة أكبر)."}
      </p>
      <button type="button" className="dialog-primary" onClick={() => window.location.reload()}>
        أعد المحاولة
      </button>
    </div>
  );
}
