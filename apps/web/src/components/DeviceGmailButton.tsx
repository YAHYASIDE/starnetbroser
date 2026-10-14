"use client";

import { useEffect, useState } from "react";
import { deviceGmailLinked, latestDeviceGmailCode, linkDeviceGmail, openAddGoogleAccount, unlinkDeviceGmail } from "@/lib/localBrowser";

/**
 * 📧 «Gmail» on a card whose email is Gmail: Google refuses its sign-in inside the app, so the
 * device's Gmail is linked once through Google's own screen (read-only, like the Outlook app does).
 * Then «فتح الحساب» types Starlink's two-step code by itself, and this button shows the newest
 * code. The code is shown and copied, never stored.
 */
export function DeviceGmailButton({ email, disabled }: { email: string; disabled?: boolean }) {
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = email.trim().toLowerCase();

  useEffect(() => {
    let alive = true;
    void deviceGmailLinked().then((set) => alive && setLinked(set.has(key)));
    return () => {
      alive = false;
    };
  }, [key]);

  async function link() {
    if (!window.confirm(`ربط Gmail ${key} بالتطبيق؟\nيقرأ التطبيق رسائل Starlink فقط ليكتب رمز التحقق. ستظهر شاشة Google لتوافق.`)) return;
    const result = await linkDeviceGmail(key);
    if (result.ok) {
      setLinked(true);
      window.alert("✓ رُبط Gmail - «فتح الحساب» يكتب رمز Starlink تلقائياً الآن");
      return;
    }
    if (result.notOnPhone) {
      if (window.confirm(`${result.message}\n\nغالباً ${key} غير مضاف في هاتفك: أضفه من صفحة Google (حسابات الهاتف)، ثم اضغط «📧 Gmail» مرة أخرى.\nفتح صفحة الإضافة الآن؟`)) {
        const opened = await openAddGoogleAccount();
        if (!opened.ok) window.alert(opened.message);
      }
      return;
    }
    window.alert(result.message);
  }

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      if (!linked) return await link();
      const result = await latestDeviceGmailCode(key);
      if (!result.ok) {
        if (result.notLinked) {
          await unlinkDeviceGmail(key);
          setLinked(false);
          return await link();
        }
        window.alert(result.message);
        return;
      }
      if (!result.code) {
        window.alert(`لا يوجد رمز Starlink اليوم في ${key}`);
        return;
      }
      await navigator.clipboard?.writeText(result.code).catch(() => undefined);
      window.alert(`📧 آخر رمز Starlink في ${key}:\n\n${result.code}\n\n(نُسخ)`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`card-action card-action-mail${linked ? " card-action-mail-on" : ""}`}
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      title={linked ? "Gmail مربوط - يعرض آخر رمز Starlink" : "Gmail غير مربوط - اربطه مرة واحدة"}
      aria-label="Gmail الجهاز"
    >
      <span aria-hidden="true">📧</span> {busy ? "…" : "Gmail"}
    </button>
  );
}
