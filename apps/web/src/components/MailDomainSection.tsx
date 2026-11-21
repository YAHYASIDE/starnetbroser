"use client";

import { useEffect, useState } from "react";
import { loadMailDomain, saveMailDomain } from "@/lib/mailDomain";
import { loadActivationPassword, saveActivationPassword } from "@/lib/activationPassword";

/** 📮 «بريد على نطاقي» (settings → عام): his domain, and how to set it up once. */
export function MailDomainSection() {
  const [domain, setDomain] = useState("");
  const [saved, setSaved] = useState("");
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const current = loadMailDomain();
    setDomain(current);
    setSaved(current);
  }, []);

  return (
    <section className="section">
      <h2 className="section-title">📮 بريد على نطاقي</h2>
      <p className="settings-hint">
        بدل إنشاء بريد أوتلوك لكل جهاز: كل عنوان على نطاقك (مثل ahmed.salem427@نطاقك) يصل إلى Gmail «بريد الرموز»، فيعمل فورًا
        في «إنشاء حساب جديد» ورمز ستارلينك يُكتب منه وحده.
      </p>
      <div className="suggest-input-row">
        <input className="search-input" dir="ltr" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="starnet-mr.com" autoCapitalize="none" />
        <button
          type="button"
          className="dialog-primary"
          onClick={() => {
            const next = saveMailDomain(domain);
            setDomain(next);
            setSaved(next);
            setNote(next ? `✓ حُفظ: @${next}` : domain.trim() ? "هذا ليس نطاقًا - مثال: starnet-mr.com" : "✓ أُزيل النطاق - يعود الإنشاء إلى أوتلوك");
          }}
        >
          حفظ
        </button>
      </div>
      {note && <p className="settings-hint">{note}</p>}
      <ol className="settings-hint mail-domain-steps">
        <li>اشترِ نطاقًا (حوالي 10$ في السنة) - وجدّده لسنوات مقدّمًا: إن انتهى يتوقف بريد كل الأجهزة.</li>
        <li>فعّل تحويل البريد لكل العناوين (Catch-all) إلى Gmail «بريد الرموز» - مثل Cloudflare Email Routing المجاني.</li>
        <li>اربط «بريد الرموز» في الإعدادات ← عام إن لم يكن مربوطًا.</li>
        <li>اكتب النطاق هنا واحفظ، ثم جرّب جهازًا واحدًا أولًا.</li>
      </ol>
      {saved && <p className="settings-hint">في «إنشاء حساب جديد» يُقترح البريد على «@{saved}» فقط.</p>}
    </section>
  );
}

/** 🔑 «كلمة سر التفعيل» (settings → عام, his Nov 21 2026 ask): one word for the email, Starlink and the Wi-Fi of every
 * new device - kept on this phone only. */
export function ActivationPasswordSection() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  const [shown, setShown] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const current = loadActivationPassword();
    setValue(current);
    setSaved(Boolean(current));
  }, []);

  return (
    <section className="section">
      <h2 className="section-title">🔑 كلمة سر التفعيل</h2>
      <p className="settings-hint">
        تُكتب وحدها في كل جهاز جديد: كلمة سر البريد، وحساب Starlink (تُملأ في صفحة «تعيين كلمة مرور» عند التفعيل)، والواي فاي. تُحفظ في
        هذا الهاتف فقط، ولا تدخل النسخة الاحتياطية.
      </p>
      <div className="suggest-input-row">
        <input className="search-input" dir="ltr" type={shown ? "text" : "password"} value={value} onChange={(e) => setValue(e.target.value)} placeholder="8 أحرف أو أكثر" autoCapitalize="none" autoComplete="off" />
        <button type="button" className="suggest-again" onClick={() => setShown(!shown)} aria-label={shown ? "إخفاء" : "إظهار"}>
          {shown ? "🙈" : "👁"}
        </button>
        <button
          type="button"
          className="dialog-primary"
          onClick={() => {
            const ok = saveActivationPassword(value);
            if (!ok) {
              setNote("بين 8 و 63 حرفًا");
              return;
            }
            setSaved(Boolean(value.trim()));
            setNote(value.trim() ? "✓ حُفظت - تُكتب وحدها في كل جهاز جديد" : "✓ أُزيلت - يعود الاقتراح لكل جهاز");
          }}
        >
          حفظ
        </button>
      </div>
      {note ? <p className="settings-hint">{note}</p> : saved && <p className="settings-hint">✓ مضبوطة على هذا الهاتف.</p>}
    </section>
  );
}
