"use client";

import { useEffect, useState } from "react";
import { STORAGE_FULL_EVENT, installStorageGuard, measureStorage } from "@/lib/storageGuard";

// Installed at import time, before any page's first save can run.
if (typeof window !== "undefined") installStorageGuard(window);

/**
 * A red strip across the top once a save has failed because the phone's app storage is full -
 * the change the operator just made is only on screen, not saved, so they must know right away.
 * A softer version shows on open when storage is already almost full.
 */
export function StorageFullBanner() {
  const [state, setState] = useState<"none" | "nearlyFull" | "failed">("none");

  useEffect(() => {
    try {
      if (measureStorage(window.localStorage).level === "full") setState("nearlyFull");
    } catch {
      // Storage blocked entirely - nothing to measure.
    }
    const onFull = () => setState("failed");
    window.addEventListener(STORAGE_FULL_EVENT, onFull);
    return () => window.removeEventListener(STORAGE_FULL_EVENT, onFull);
  }, []);

  if (state === "none") return null;
  return (
    <div className={`storage-banner${state === "failed" ? " is-failed" : ""}`} role="alert">
      <div className="storage-banner-text">
        {state === "failed" ? (
          <>
            <strong>ذاكرة التطبيق ممتلئة - آخر تغيير لم يُحفظ.</strong> احذف صور منتجات أو سجلات قديمة (الإعدادات ← مساحة
            التخزين) ثم أعد التحميل وأعد إدخاله.
          </>
        ) : (
          <>
            <strong>ذاكرة التطبيق شبه ممتلئة.</strong> خذ نسخة احتياطية وخفّف البيانات من الإعدادات ← مساحة التخزين.
          </>
        )}
      </div>
      <div className="storage-banner-actions">
        {state === "failed" && (
          <button className="btn-icon" type="button" onClick={() => window.location.reload()}>
            إعادة تحميل
          </button>
        )}
        <button className="btn-icon" type="button" aria-label="إخفاء" onClick={() => setState("none")}>
          ✕
        </button>
      </div>
    </div>
  );
}
