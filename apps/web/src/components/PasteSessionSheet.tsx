"use client";

import { useState } from "react";
import { importAccountSessions, isRunningInAndroidApp } from "@/lib/localBrowser";
import { parsePastedSession } from "@/lib/pastedSession";

/**
 * 📋 «لصق جلسة» (the card's «⋯»): a Starlink session copied from another browser - a Firefox clone
 * with the «Cookie-Editor» add-on → Export → JSON - pasted onto this device, so its browser opens
 * already signed in. The session goes straight into this device's own isolated browser.
 */
export function PasteSessionSheet({ accountId, accountName, onOpen, onClose }: { accountId: string; accountName: string; onOpen: () => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function pasteFromClipboard() {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      setMessage("اضغط مطولاً داخل الخانة ثم «لصق»");
    }
  }

  async function save() {
    setMessage(null);
    const parsed = parsePastedSession(text);
    if (!parsed.ok) return setMessage(parsed.message);
    if (!isRunningInAndroidApp()) return setMessage("يعمل داخل تطبيق الهاتف فقط");
    setBusy(true);
    const result = await importAccountSessions({ [accountId]: parsed.cookiesByUrl });
    setBusy(false);
    if (!result.ok || result.importedCount === 0) return setMessage("لم تُحفظ الجلسة - تأكد أنك صدّرتها من صفحة Starlink");
    setDone(true);
    setText("");
    setMessage(`✓ لُصقت الجلسة (${parsed.count} كوكيز) في متصفح «${accountName}»`);
  }

  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet" role="dialog" aria-modal="true" aria-label="لصق جلسة" onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>📋 لصق جلسة - {accountName}</strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <ol className="paste-session-steps">
          <li>في متصفح Firefox المنسوخ: افتح starlink.com وأنت مسجّل الدخول.</li>
          <li>من إضافة «Cookie-Editor»: Export ← JSON (تُنسخ الجلسة).</li>
          <li>ارجع هنا والصقها في الخانة ثم «حفظ الجلسة».</li>
        </ol>
        <textarea
          className="search-input paste-session-input"
          dir="ltr"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='[{"domain":".starlink.com","name":"…","value":"…"}]'
          spellCheck={false}
          autoCapitalize="off"
        />
        {message && <p className={done ? "settings-hint" : "account-card-alert ledger-form-error"}>{message}</p>}
        <div className="settings-actions">
          {done ? (
            <button
              type="button"
              className="dialog-primary"
              onClick={() => {
                onClose();
                onOpen();
              }}
            >
              ↗ فتح الحساب للتأكد
            </button>
          ) : (
            <>
              <button type="button" className="dialog-primary" disabled={busy || !text.trim()} onClick={() => void save()}>
                {busy ? "⏳ جارِ الحفظ…" : "حفظ الجلسة"}
              </button>
              <button type="button" className="dialog-secondary" onClick={() => void pasteFromClipboard()}>
                📋 لصق من الحافظة
              </button>
            </>
          )}
        </div>
        <p className="settings-hint">الجلسة تُحفظ في متصفح هذا الجهاز فقط. لا تشاركها مع أحد - من يملكها يدخل الحساب.</p>
      </div>
    </div>
  );
}
