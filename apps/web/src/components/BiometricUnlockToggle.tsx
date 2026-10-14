"use client";

import { useEffect, useState } from "react";
import { isBiometricUnlockEnabled, setBiometricUnlockEnabled } from "@/lib/appLock";
import { biometricAvailable, isRunningInAndroidApp, unlockWithBiometric } from "@/lib/localBrowser";

/** 🖐 «فتح بالبصمة» under «قفل التطبيق» (once a PIN is set): turning it on asks for the finger
 * first, so it's only on when it really works on this phone. The PIN stays the fallback. */
export function BiometricUnlockToggle() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(isBiometricUnlockEnabled());
    void biometricAvailable().then(setAvailable);
  }, []);

  if (!isRunningInAndroidApp()) return null;
  if (available === false) return <p className="settings-hint">🖐 لا توجد بصمة مسجّلة في هذا الهاتف - أضفها من إعدادات الهاتف ثم ارجع.</p>;

  async function toggle(next: boolean) {
    setMessage(null);
    if (next) {
      const ok = await unlockWithBiometric("ضع إصبعك لتفعيل الفتح بالبصمة");
      if (!ok) {
        setMessage("لم تُفعَّل - لم تُقبل البصمة");
        return;
      }
    }
    setBiometricUnlockEnabled(next);
    setEnabled(next);
    setMessage(next ? "✓ يُفتح التطبيق بالبصمة - والرمز يبقى احتياطاً" : null);
  }

  return (
    <>
      <label className="toggle-switch-row">
        <span>🖐 فتح بالبصمة</span>
        <span className={`toggle-switch${enabled ? " toggle-switch-on" : ""}`}>
          <input type="checkbox" checked={enabled} disabled={available === null} onChange={(e) => void toggle(e.target.checked)} />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {message && <p className="settings-hint">{message}</p>}
    </>
  );
}
