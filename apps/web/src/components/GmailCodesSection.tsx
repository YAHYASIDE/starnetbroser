"use client";

import { useEffect, useState } from "react";
import { SIGNUP_RECOVERY_EMAIL } from "@/lib/accountCreation";
import { gmailCodesEmail, isRunningInAndroidApp, latestGmailCode, linkGmailCodes, unlinkGmailCodes } from "@/lib/localBrowser";

/**
 * 📨 «بريد الرموز»: the shop's Gmail where Microsoft sends its verification codes (a new Outlook's
 * recovery email, a sign-in check). Linked once (read-only); the mail browser then reads the code
 * and types it in. Google refuses its sign-in inside the app, so it can't be opened like «📧 البريد».
 */
export function GmailCodesSection() {
  const [android, setAndroid] = useState(true);
  const [linked, setLinked] = useState<string | null>(null);
  const [email, setEmail] = useState(SIGNUP_RECOVERY_EMAIL);
  const [busy, setBusy] = useState<"link" | "test" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setAndroid(isRunningInAndroidApp());
    void gmailCodesEmail().then(setLinked);
  }, []);

  async function link() {
    setBusy("link");
    setMessage(null);
    const result = await linkGmailCodes(email);
    setBusy(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setLinked(result.email);
    setMessage("✓ تم الربط - رموز مايكروسوفت تُكتب الآن وحدها في صفحات البريد");
  }

  async function test() {
    setBusy("test");
    setMessage(null);
    const result = await latestGmailCode();
    setBusy(null);
    if (!result.ok) setMessage(result.message);
    else setMessage(result.code ? `✓ آخر رمز اليوم: ${result.code}` : "✓ الربط يعمل - لا رمز اليوم في البريد");
  }

  async function unlink() {
    if (!window.confirm("فصل بريد الرموز؟ لن تُكتب الرموز وحدها بعد ذلك.")) return;
    await unlinkGmailCodes();
    setLinked(null);
    setMessage("تم الفصل");
  }

  return (
    <section className="section" id="gmail-codes">
      <h2 className="section-title">📨 بريد الرموز (Gmail)</h2>
      <p className="settings-hint">
        البريد الذي تصله رموز التحقق من مايكروسوفت (بريد الاسترداد عند إنشاء أوتلوك جديد، أو عند تسجيل الدخول). بعد
        الربط، حين تطلب صفحة البريد رمزاً يقرأه التطبيق من هنا ويكتبه وحده (وفي «إضافة الحساب» يضغط Next وحده أيضاً). قراءة فقط، لا يُرسل شيئاً.
      </p>
      {!android && <p className="settings-hint">⚠️ يعمل داخل تطبيق Android فقط.</p>}
      {linked ? (
        <>
          <p className="settings-hint">
            ✓ مربوط بـ <bdi dir="ltr">{linked}</bdi>
          </p>
          <div className="settings-actions">
            <button type="button" className="dialog-primary" disabled={busy !== null} onClick={test}>
              {busy === "test" ? "جارِ القراءة…" : "🔍 جرّب: آخر رمز"}
            </button>
            <button type="button" className="text-action" disabled={busy !== null} onClick={unlink}>
              فصل
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="form-field">
            <span>بريد Gmail</span>
            <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
          </label>
          <div className="settings-actions">
            <button type="button" className="dialog-primary" disabled={busy !== null || !android || !email.trim()} onClick={link}>
              {busy === "link" ? "جارِ الربط…" : "ربط Gmail"}
            </button>
          </div>
          <p className="settings-hint">
            عند الربط تظهر شاشة Google: اختر نفس الحساب أعلاه ووافق على «قراءة البريد».
          </p>
        </>
      )}
      {message && <div className={`account-card-alert${message.startsWith("✓") ? " backup-restored" : ""}`}>{message}</div>}
    </section>
  );
}
