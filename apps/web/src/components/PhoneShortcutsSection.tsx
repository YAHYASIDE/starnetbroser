"use client";

import { useState } from "react";
import { LocalBrowser } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { phoneShortcut, PINNABLE_PAGES } from "@/lib/shortcuts";

/** 📌 Pin any page to the phone's home screen from a list (the long press does the same). */
export function PhoneShortcutsSection() {
  const [status, setStatus] = useState<string | null>(null);

  async function pin(route: string, label: string) {
    const shortcut = phoneShortcut(route, label);
    if (!shortcut) return;
    if (!isRunningInAndroidApp()) return setStatus("متاح في تطبيق الهاتف فقط");
    try {
      const result = await LocalBrowser.pinShortcut(shortcut);
      setStatus(
        result.unsupported
          ? "هاتفك لا يسمح بإضافة اختصارات من التطبيقات"
          : result.pinned
            ? `✓ «${label}»: وافق في نافذة الهاتف ليظهر على الشاشة`
            : "لم تتم الإضافة - حاول مرة أخرى",
      );
    } catch {
      setStatus("تعذرت الإضافة");
    }
  }

  return (
    <section className="section">
      <h2 className="section-title">📌 اختصارات على شاشة الهاتف</h2>
      <p className="settings-hint">اضغط «أضف» لتظهر أيقونة الصفحة على شاشة الهاتف (أو اضغط مطوّلاً على أي صفحة أو أداة في التطبيق).</p>
      <ul className="phone-shortcut-list">
        {PINNABLE_PAGES.map((page) => {
          const look = phoneShortcut(page.route, page.label);
          return (
            <li key={page.route} className="phone-shortcut-row">
              <span className="phone-shortcut-emoji" style={{ background: look?.color }} aria-hidden="true">
                {look?.emoji}
              </span>
              <span className="phone-shortcut-label">{page.label}</span>
              <button type="button" className="text-action" onClick={() => void pin(page.route, page.label)} data-no-shortcut>
                📌 أضف
              </button>
            </li>
          );
        })}
      </ul>
      {status && <p className="settings-hint">{status}</p>}
    </section>
  );
}
