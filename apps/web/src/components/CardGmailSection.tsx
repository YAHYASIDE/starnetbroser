"use client";

import { useEffect, useState } from "react";
import { cardGmailEmail, isRunningInAndroidApp, linkCardGmail, unlinkCardGmail } from "@/lib/localBrowser";

/**
 * 💳 «بريد رمز البطاقة»: the Gmail that receives the card company's STARLINK payment code (the
 * «Verify transaction» email from no-reply). Linked once (read-only); then «أضف البطاقة» reads
 * the code straight from the mail and types it, even when Gmail's notification hides it in the
 * body. Separate from «بريد الرموز» (Microsoft's login codes) - the card code usually goes to a
 * different address (his personal Gmail).
 */
export function CardGmailSection() {
  const [android, setAndroid] = useState(true);
  const [linked, setLinked] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setAndroid(isRunningInAndroidApp());
    void cardGmailEmail().then(setLinked);
  }, []);

  async function link() {
    setBusy(true);
    setMessage(null);
    const result = await linkCardGmail(email);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setLinked(result.email);
    setMessage("✓ تم الربط - يقرأ التطبيق رمز البطاقة من هذا البريد وحده عند «أضف البطاقة»");
  }

  async function unlink() {
    if (!window.confirm("فصل بريد رمز البطاقة؟ ستحتاج لنسخ الرمز بنفسك بعد ذلك.")) return;
    await unlinkCardGmail();
    setLinked(null);
    setMessage("تم الفصل");
  }

  return (
    <section className="section" id="card-gmail">
      <h2 className="section-title">💳 بريد رمز البطاقة (Gmail)</h2>
      <p className="settings-hint">
        البريد الذي تصله رموز تأكيد البطاقة من no-reply («STARLINK INTERNET … confirm your payment … code»). بعد الربط،
        عند «💳 أضف البطاقة» يقرأ التطبيق الرمز من هذا البريد ويكتبه وحده - حتى لو لم يظهر في إشعار Gmail. قراءة فقط، لا يُرسل شيئاً.
      </p>
      {!android && <p className="settings-hint">⚠️ يعمل داخل تطبيق Android فقط.</p>}
      {linked ? (
        <>
          <p className="settings-hint">
            ✓ مربوط بـ <bdi dir="ltr">{linked}</bdi>
          </p>
          <div className="settings-actions">
            <button type="button" className="text-action" disabled={busy} onClick={unlink}>
              فصل
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="form-field">
            <span>بريد Gmail للبطاقة</span>
            <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" placeholder="yourname@gmail.com" />
          </label>
          <div className="settings-actions">
            <button type="button" className="dialog-primary" disabled={busy || !android || !email.trim()} onClick={link}>
              {busy ? "جارِ الربط…" : "ربط Gmail"}
            </button>
          </div>
          <p className="settings-hint">عند الربط تظهر شاشة Google: اختر نفس الحساب أعلاه ووافق على «قراءة البريد».</p>
        </>
      )}
      {message && <div className={`account-card-alert${message.startsWith("✓") ? " backup-restored" : ""}`}>{message}</div>}
    </section>
  );
}
