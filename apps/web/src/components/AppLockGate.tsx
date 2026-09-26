"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import {
  formatLockoutWait,
  hasAppPin,
  isInternalLeave,
  loadPinFailures,
  lockoutRemainingMs,
  registerPinFailure,
  savePinFailures,
  shouldRelock,
  verifyAppPin,
} from "@/lib/appLock";
import { isRunningInAndroidApp } from "@/lib/localBrowser";

/**
 * Gates every page/BottomNav behind an optional PIN (الإعدادات → "قفل التطبيق"). Asked on every
 * real app open, and again when the app comes back after more than a minute in the background
 * (never after the app's own device-browser hand-off). A re-lock only covers the pages - they stay
 * mounted underneath, so a half-filled form is still there after unlocking. Five wrong PINs in a
 * row start a growing wait (30s, 1m, 2m, ... up to 15m) that survives closing the app.
 * An operator who never sets a PIN never sees anything from this component at all.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  // null = "still checking" (client-only, since localStorage doesn't exist on first paint) -
  // rendered as a blank screen so a PIN-protected account's data is never shown even for an
  // instant before the check resolves.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  // Children have been shown at least once - a later lock overlays them instead of unmounting.
  const [everUnlocked, setEverUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [failures, setFailures] = useState(() => ({ count: 0, lockedUntil: 0 }));
  const hidden = useRef<{ at: number; internal: boolean } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // The covered pages must not be reachable by keyboard/screen reader while locked.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.toggleAttribute("inert", unlocked === false);
    if (unlocked === false) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  }, [unlocked, everUnlocked]);

  useEffect(() => {
    const locked = hasAppPin();
    setUnlocked(!locked);
    setEverUnlocked(!locked);
    setFailures(loadPinFailures());
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (hidden.current) return;
      const at = Date.now();
      hidden.current = { at, internal: isInternalLeave(at) };
    };
    const onShow = () => {
      const left = hidden.current;
      hidden.current = null;
      if (!left || !hasAppPin()) return;
      if (shouldRelock(left.at, Date.now(), left.internal)) {
        setPin("");
        setError(null);
        setUnlocked(false);
      }
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? onHide() : onShow());
    document.addEventListener("visibilitychange", onVisibility);
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    if (isRunningInAndroidApp()) {
      // The WebView doesn't always report visibility when the Activity pauses - the native
      // pause/resume events cover that.
      handles.push(App.addListener("pause", onHide), App.addListener("resume", onShow));
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const handle of handles) void handle.then((h) => h.remove()).catch(() => undefined);
    };
  }, []);

  const waitMs = lockoutRemainingMs(failures, now);
  useEffect(() => {
    if (unlocked !== false || failures.lockedUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [unlocked, failures.lockedUntil]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (checking || lockoutRemainingMs(failures, Date.now()) > 0) return;
    setChecking(true);
    const ok = await verifyAppPin(pin);
    setChecking(false);
    setPin("");
    if (!ok) {
      const next = registerPinFailure(failures, Date.now());
      setFailures(next);
      savePinFailures(next);
      setNow(Date.now());
      setError("رمز غير صحيح");
      return;
    }
    const cleared = { count: 0, lockedUntil: 0 };
    setFailures(cleared);
    savePinFailures(cleared);
    setError(null);
    setUnlocked(true);
    setEverUnlocked(true);
  }

  // One stable tree whether or not a re-lock is showing, so the pages never remount.
  function content(overlay: React.ReactNode) {
    return (
      <>
        <div ref={contentRef} className="app-lock-content">
          {children}
        </div>
        {overlay}
      </>
    );
  }

  if (unlocked === null) return <main className="home" />;
  if (unlocked) return content(null);

  const lockScreen = (
    <main className={everUnlocked ? "app-lock-screen app-lock-overlay" : "app-lock-screen"}>
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
          disabled={waitMs > 0}
          onChange={(e) => setPin(e.target.value.replace(/[^\d]/g, ""))}
        />
        {waitMs > 0 ? (
          <div className="account-card-alert ledger-form-error">
            محاولات خاطئة كثيرة - انتظر {formatLockoutWait(waitMs)} ثم حاول مجدداً
          </div>
        ) : (
          error && <div className="account-card-alert ledger-form-error">{error}</div>
        )}
        <button className="dialog-primary app-lock-submit" type="submit" disabled={!pin || checking || waitMs > 0}>
          {checking ? "جارٍ التحقق…" : "فتح"}
        </button>
      </form>
    </main>
  );

  if (!everUnlocked) return lockScreen;
  return content(lockScreen);
}
