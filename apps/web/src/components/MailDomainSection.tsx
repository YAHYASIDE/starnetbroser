"use client";

import { useEffect, useState } from "react";
import { loadMailDomain, saveMailDomain } from "@/lib/mailDomain";

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
      {saved && <p className="settings-hint">في «إنشاء حساب جديد» يظهر اختيار «📮 @{saved}» أو «📧 أوتلوك».</p>}
    </section>
  );
}
