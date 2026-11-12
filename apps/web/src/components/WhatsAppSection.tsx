"use client";

import { useEffect, useState } from "react";
import { LocalBrowser } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "@/lib/localBrowser";
import { setWhatsappAnswerOn, whatsappAnswerOn } from "@/lib/whatsappLink";

type Status = { access: boolean; enabled: boolean; log: { name: string; question: string; at: number }[] };

/**
 * 💬 «واتساب بزنس» (his Nov 12 2026 ask): the app reads his WhatsApp Business messages from their notifications - an
 * email becomes a new «غير مفعّل» device, a registered customer asking about his device is answered by itself.
 */
export function WhatsAppSection() {
  const [android, setAndroid] = useState(false);
  const [on, setOn] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);

  const refresh = () => {
    void LocalBrowser.whatsappStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    const a = isRunningInAndroidApp();
    setAndroid(a);
    setOn(whatsappAnswerOn());
    if (a) refresh();
  }, []);

  return (
    <section className="section" id="whatsapp" data-tour="whatsapp">
      <h2 className="section-title">💬 واتساب بزنس</h2>
      <p className="settings-hint">يقرأ التطبيق رسائل زبائنك في واتساب بزنس من إشعاراتها على هذا الهاتف:</p>
      <ul className="settings-hint call-server-steps">
        <li>📧 رسالة فيها إيميل ← جهاز جديد «غير مفعّل» بهذا الإيميل على الزبون صاحب الرقم (وزبون جديد باسمه في واتساب إن لم يكن مسجّلًا).</li>
        <li>🛰️ زبون رقمه مسجّل يسأل عن جهازه أو اشتراكه أو ما عليه ← يرد التطبيق وحده: حالة كل جهاز، موعد انتهاء اشتراكه، وما عليه.</li>
        <li>🛡️ لا يرد في المجموعات، ولا على رقم غير مسجّل، ومرة واحدة كل 30 دقيقة لكل زبون.</li>
      </ul>
      {!android ? (
        <p className="settings-hint">يعمل في تطبيق الهاتف فقط.</p>
      ) : (
        <>
          <p className={status?.access ? "settings-hint" : "currency-rate-wrong"}>
            {status?.access ? "✓ قراءة الإشعارات مفعّلة" : "⚠️ قراءة الإشعارات غير مفعّلة - فعّلها لـ STAR NET، ولا تكتم إشعارات واتساب بزنس."}
          </p>
          {!status?.access && (
            <button type="button" className="dialog-secondary" onClick={() => void LocalBrowser.openKastNotificationAccess().catch(() => undefined)}>
              🔔 فتح إذن قراءة الإشعارات
            </button>
          )}
          <label className="toggle-switch-row">
            <span>يرد وحده على أسئلة الزبائن عن أجهزتهم</span>
            <span className={`toggle-switch${on ? " toggle-switch-on" : ""}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => {
                  setOn(e.target.checked);
                  setWhatsappAnswerOn(e.target.checked);
                  window.setTimeout(refresh, 1500);
                }}
              />
              <span className="toggle-switch-thumb" />
            </span>
          </label>
          {status && status.log.length > 0 && (
            <>
              <p className="settings-hint">آخر الردود:</p>
              <ul className="msg-list">
                {[...status.log].reverse().slice(0, 10).map((l, i) => (
                  <li key={i} className="msg-item">
                    <span className="msg-item-label">💬 {l.name}</span>
                    <small className="msg-item-hint">
                      «{l.question.slice(0, 60)}» · {new Date(l.at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                    </small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
