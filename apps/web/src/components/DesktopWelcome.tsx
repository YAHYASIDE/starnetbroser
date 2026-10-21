"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasAppPin } from "@/lib/appLock";

/**
 * 🖥️ The first run of STAR NET for Windows: his data comes from the phone (a full backup file) and
 * the laptop gets its own lock. Shown while the app has no device yet.
 */
export function DesktopWelcome({ empty }: { empty: boolean }) {
  const [pin, setPin] = useState(true);
  useEffect(() => setPin(hasAppPin()), []);
  if (!empty && pin) return null;
  return (
    <section className="desktop-welcome" aria-label="STAR NET لويندوز">
      <strong>🖥️ STAR NET على اللابتوب</strong>
      {empty && (
        <ol>
          <li>في الهاتف: الإعدادات ← النسخة الاحتياطية ← «تصدير نسخة احتياطية» (بكلمة مرور)، وأرسل الملف إلى اللابتوب.</li>
          <li>هنا: <Link href="/settings">الإعدادات</Link> ← «📂 اختر ملف النسخة» ← كلمة مرورها ← استرجاع.</li>
        </ol>
      )}
      {!pin && (
        <p>
          🔒 ضع رمز قفل لهذا اللابتوب من <Link href="/settings">الإعدادات</Link> - بياناتك وكلمات مرور الأجهزة محفوظة عليه.
        </p>
      )}
      <small>هذه النسخة منفصلة عن الهاتف حتى نضيف الاتصال الدائم بينهما.</small>
    </section>
  );
}
