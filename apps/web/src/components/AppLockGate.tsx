"use client";

import { FormEvent, useEffect, useState } from "react";
import { hasAppPin, verifyAppPin } from "@/lib/appLock";

/**
 * Gates every page/BottomNav behind an optional PIN (الإعدادات → "قفل التطبيق"). Checked once per
 * real app open (a fresh JS load, e.g. launching the APK) - unlocking stays in effect for the rest
 * of that session, never re-prompted on internal navigation. An operator who never sets a PIN
 * (hasAppPin() false) never sees anything from this component at all; it renders `children`
 * immediately, with zero added delay or UI.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  // null = "still checking" (client-only, since localStorage doesn't exist on first paint) -
  // rendered as a blank screen so a PIN-protected account's data is never shown even for an
  // instant before the check resolves.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setUnlocked(!hasAppPin());
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (checking) return;
    setChecking(true);
    const ok = await verifyAppPin(pin);
    setChecking(false);
    if (!ok) {
      setError("رمز غير صحيح");
      setPin("");
      return;
    }
    setError(null);
    setUnlocked(true);
  }

  if (unlocked === null) return <main className="home" />;
  if (unlocked) return <>{children}</>;

  return (
    <main className="app-lock-screen">
      <form className="app-lock-card auth-form" onSubmit={submit}>
        <span className="brand-logo app-lock-logo" aria-hidden="true">★</span>
        <h1 className="app-lock-title">STAR NET مقفل</h1>
        <p className="settings-hint">أدخل رمز القفل لفتح التطبيق</p>
        <input
          className="search-input app-lock-input"
          type="password"
          inputMode="numeric"
          maxLength={6}
          dir="ltr"
          autoFocus
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, ""))}
        />
        {error && <div className="account-card-alert ledger-form-error">{error}</div>}
        <button className="dialog-primary app-lock-submit" type="submit" disabled={!pin || checking}>
          {checking ? "جارٍ التحقق…" : "فتح"}
        </button>
      </form>
    </main>
  );
}
