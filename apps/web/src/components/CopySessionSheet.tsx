"use client";

import { useState } from "react";
import { exportAccountSessions, isRunningInAndroidApp } from "@/lib/localBrowser";
import { toCookieEditorJson } from "@/lib/pastedSession";

/**
 * 📤 «نسخ الجلسة» (the card's «⋯», his Oct 14 2026 ask «أصدّر الجلسة من جهاز في التطبيق إلى متصفح آخر، كروم
 * مثلاً»): this device's Starlink session as Cookie-Editor JSON, copied to the clipboard (or shown to
 * copy by hand) - to Import in Chrome / Kiwi / Firefox. The reverse of «📋 لصق جلسة». Never logged
 * or stored: it lives only in this sheet until he closes it.
 */
export function CopySessionSheet({ accountId, accountName, onClose }: { accountId: string; accountName: string; onClose: () => void }) {
  const [json, setJson] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    setMessage(null);
    if (!isRunningInAndroidApp()) return setMessage("يعمل داخل تطبيق الهاتف فقط");
    setBusy(true);
    const sessions = await exportAccountSessions([accountId]);
    setBusy(false);
    const { json: text, count } = toCookieEditorJson(sessions[accountId] ?? {});
    if (count === 0) return setMessage("لا توجد جلسة في متصفح هذا الجهاز - افتح الحساب وسجّل الدخول أولاً");
    setJson(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setMessage(`✓ نُسخت الجلسة (${count} كوكيز) - الصقها في المتصفح الآخر`);
    } catch {
      setMessage("لم يُنسخ تلقائيًا - اضغط مطولاً داخل الخانة ← تحديد الكل ← نسخ");
    }
  }

  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet" role="dialog" aria-modal="true" aria-label="نسخ الجلسة" onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>📤 نسخ الجلسة - {accountName}</strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <ol className="paste-session-steps">
          <li>اضغط «📤 نسخ الجلسة» هنا.</li>
          <li>في كروم على الكمبيوتر (أو Kiwi / Firefox على الهاتف): ثبّت إضافة «Cookie-Editor» وافتح starlink.com.</li>
          <li>من الإضافة: Import ← الصق ← Import، ثم حدّث الصفحة فتكون داخل الحساب.</li>
        </ol>
        {json && <textarea className="search-input paste-session-input" dir="ltr" rows={5} readOnly value={json} onFocus={(e) => e.target.select()} aria-label="الجلسة" />}
        {message && <p className={copied ? "settings-hint" : "account-card-alert ledger-form-error"}>{message}</p>}
        <div className="settings-actions">
          <button type="button" className="dialog-primary" disabled={busy} onClick={() => void copy()}>
            {busy ? "⏳ جارِ القراءة…" : json ? "📤 انسخها مرة أخرى" : "📤 نسخ الجلسة"}
          </button>
          <button type="button" className="text-action" onClick={onClose}>
            إغلاق
          </button>
        </div>
        <p className="settings-hint">⚠️ من يملك هذه الجلسة يدخل الحساب دون كلمة سر. لا ترسلها لأحد، وامسحها من الحافظة بعد اللصق.</p>
      </div>
    </div>
  );
}
