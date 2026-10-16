"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatLockoutWait } from "@/lib/appLock";
import {
  checkActivationCode,
  isThisPhoneActivated,
  keepActivationProof,
  loadActivationFailures,
  registerActivationFailure,
  saveActivationFailures,
  type ActivationFailures,
} from "@/lib/appActivation";
import { isRunningInAndroidApp } from "@/lib/localBrowser";

/**
 * 🔐 «تفعيل التطبيق» (lib/appActivation.ts): on the phone app, nothing of STAR NET opens until his activation
 * code was typed once on this phone - a copied APK, a new phone or a cleared app asks for it. On a rep's
 * phone he types it himself. The web demo (demo data only) isn't gated.
 */
export function ActivationGate({ children }: { children: React.ReactNode }) {
  // null = still checking (never show anything before the answer).
  const [active, setActive] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [failures, setFailures] = useState<ActivationFailures>({ count: 0, lockedUntil: 0 });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunningInAndroidApp()) {
      setActive(true);
      return;
    }
    setFailures(loadActivationFailures());
    void isThisPhoneActivated().then(setActive, () => setActive(false));
  }, []);

  const waitMs = Math.max(0, failures.lockedUntil - now);
  useEffect(() => {
    if (waitMs <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waitMs]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checking || waitMs > 0 || !code.trim()) return;
    setChecking(true);
    setError(null);
    const proof = await checkActivationCode(code).catch(() => null);
    setChecking(false);
    if (proof) {
      keepActivationProof(proof);
      setCode("");
      setActive(true);
      return;
    }
    const next = registerActivationFailure(failures, Date.now());
    setFailures(next);
    saveActivationFailures(next);
    setNow(Date.now());
    setCode("");
    setError("الكود غير صحيح");
  }

  if (active === null) return <main className="home" />;
  if (active) return <>{children}</>;

  return (
    <main className="app-lock-screen">
      <form className="app-lock-card auth-form" onSubmit={(e) => void submit(e)}>
        <span className="brand-logo app-lock-logo" aria-hidden="true">★</span>
        <h1 className="app-lock-title">تفعيل STAR NET</h1>
        <p className="settings-hint">هذه النسخة تحتاج كود التفعيل مرة واحدة على هذا الهاتف.</p>
        <input
          className="search-input app-lock-input"
          type="password"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          placeholder="كود التفعيل"
          aria-label="كود التفعيل"
          value={code}
          disabled={waitMs > 0 || checking}
          onChange={(e) => setCode(e.target.value)}
        />
        {waitMs > 0 ? (
          <div className="account-card-alert ledger-form-error">محاولات خاطئة كثيرة - انتظر {formatLockoutWait(waitMs)} ثم حاول مجددًا</div>
        ) : (
          error && <div className="account-card-alert ledger-form-error">{error}</div>
        )}
        <button className="dialog-primary app-lock-submit" type="submit" disabled={!code.trim() || checking || waitMs > 0}>
          {checking ? "جارٍ التحقق…" : "تفعيل"}
        </button>
      </form>
    </main>
  );
}
