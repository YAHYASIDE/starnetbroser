"use client";

import { useEffect, useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { clearVerificationCodes, isRunningInAndroidApp, listVerificationCodes } from "@/lib/localBrowser";
import { buildCodeRows, type StoredCode } from "@/lib/verificationCodes";
import { isDesktopApp } from "@/lib/desktop";
import { CodesBotConnect } from "@/components/CodesBotConnect";

/** 🔑 «الأكواد» (his Oct 22 2026 ask): every verification code the app read from a mailbox, kept 30 days
 * on this phone; tap 📋 to copy. With the steps to keep passkeys in his Google account. */
export function CodesSection({ accounts }: { accounts: StarlinkAccountSummary[] }) {
  const [codes, setCodes] = useState<StoredCode[]>([]);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inApp = isRunningInAndroidApp() || isDesktopApp();

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setNow(Date.now());
      void listVerificationCodes().then((list) => alive && setCodes(list));
    };
    refresh();
    // «🔑 الأكواد» from «المزيد» opens /mailboxes#codes: bring the section up once it's drawn.
    if (window.location.hash === "#codes") window.setTimeout(() => document.getElementById("codes")?.scrollIntoView({ block: "start" }), 120);
    const timer = window.setInterval(refresh, 30_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const rows = useMemo(() => buildCodeRows(codes, accounts, query, now), [codes, accounts, query, now]);

  async function copy(key: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(key);
      window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      window.prompt("انسخ الرمز:", code);
    }
  }

  async function clearAll() {
    if (!window.confirm("مسح كل الأكواد المحفوظة على هذا الهاتف؟")) return;
    await clearVerificationCodes();
    setCodes([]);
  }

  return (
    <section className="section codes-section" id="codes" data-tour="codes">
      <div className="codes-head">
        <h2 className="section-title">🔑 الأكواد</h2>
        {codes.length > 0 && (
          <button type="button" className="btn-link" onClick={() => void clearAll()}>
            🗑 مسح
          </button>
        )}
      </div>
      <p className="settings-hint">
        كل رمز تحقق يقرؤه التطبيق من البريد (دخول Starlink، دخول البريد، دفع البطاقة) يُحفظ هنا 30 يومًا على هذا الهاتف. الرمز يعمل دقائق
        فقط بعد وصوله.
      </p>
      {isRunningInAndroidApp() && <CodesBotConnect />}
      {!inApp ? (
        <p className="settings-hint">الأكواد تُحفظ في تطبيق Android وبرنامج الويندوس فقط.</p>
      ) : codes.length === 0 ? (
        <p className="empty-state">لا أكواد بعد - تظهر هنا عندما يقرأ التطبيق رمزًا من بريد جهاز.</p>
      ) : (
        <>
          {codes.length > 5 && (
            <input className="search-input" placeholder="ابحث بالجهاز أو الإيميل أو الرمز" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          <ul className="codes-list">
            {rows.map((row) => (
              <li key={row.key} className={`codes-row${row.fresh ? " is-fresh" : ""}`}>
                <div className="codes-main">
                  <strong>{row.deviceName}</strong>
                  <small>
                    {row.kindLabel} · {row.ago}
                  </small>
                  {row.email && (
                    <bdi dir="ltr" className="codes-email">
                      {row.email}
                    </bdi>
                  )}
                </div>
                <button type="button" className="codes-code" onClick={() => void copy(row.key, row.code)} aria-label={`نسخ الرمز ${row.code}`}>
                  <bdi dir="ltr">{row.code}</bdi>
                  <span aria-hidden="true">{copied === row.key ? "✓" : "📋"}</span>
                </button>
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="empty-state">لا نتائج.</p>}
        </>
      )}

      <details className="codes-help">
        <summary>
          🔐 احفظ مفاتيح المرور (Passkeys) في حساب Google <bdi dir="ltr">starnet.om@gmail.com</bdi>
        </summary>
        <ol>
          <li>افتح إعدادات الهاتف ← «كلمات المرور ومفاتيح المرور والحسابات» (في بعض الهواتف: «Google» ← «الملء التلقائي»).</li>
          <li>
            في «الخدمة المفضّلة» اختر <strong>Google</strong> ثم الحساب <bdi dir="ltr">starnet.om@gmail.com</bdi> (أضِفه للهاتف من «الحسابات» إن لم يكن
            موجودًا).
          </li>
          <li>أوقف «Microsoft Authenticator / Edge» من الخدمات الإضافية إن أردت ألا يُحفظ فيه شيء.</li>
          <li>في Starlink: Settings ← Privacy &amp; Security ← Passkeys ← «Add passkey» - يُحفظ الآن في <bdi dir="ltr">starnet.om@gmail.com</bdi> (تراه في passwords.google.com وأنت داخل به).</li>
          <li>المفتاح القديم «Microsoft Password Manager»: احذفه من ⋯ ← Delete إن لم تعد تحتاجه.</li>
        </ol>
        <p className="settings-hint">على اللابتوب: سجّل دخول Chrome بنفس الحساب ليظهر المفتاح هناك. المفتاح يُحفظ في الحساب وليس في رسالة بريد. كلمة المرور تبقى، ويدخل بها التطبيق دائمًا.</p>
      </details>
    </section>
  );
}
