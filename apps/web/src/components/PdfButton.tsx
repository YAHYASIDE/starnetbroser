"use client";

import { useState } from "react";
import { PrintableDocument } from "@/lib/pdfDocument";
import { exportPrintablePdf } from "@/lib/pdfExport";
import { isTelegramConnected, sendTelegramPdf } from "@/lib/telegram";

/** "📄 PDF" - builds the document only when tapped (never on every render). With Telegram
 * connected, it first asks: share/save as before, or send it to the Telegram chat. */
export function PdfButton({ build, className = "party-action", label = "🖨️ PDF" }: { build: () => PrintableDocument; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  async function share() {
    setChoosing(false);
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await exportPrintablePdf(build());
    setBusy(false);
    if (!result.ok) setError(result.message);
  }

  async function toTelegram() {
    setChoosing(false);
    setBusy(true);
    setError(null);
    setDone(null);
    const result = await sendTelegramPdf(build());
    setBusy(false);
    if (result.ok) setDone("✓ أُرسل إلى تيليغرام");
    else setError(result.message);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => (isTelegramConnected() ? setChoosing(true) : share())} disabled={busy}>
        {busy ? "⏳ جارِ التجهيز…" : label}
      </button>
      {error && <span className="account-card-alert ledger-form-error">{error}</span>}
      {done && <span className="pdf-sent-note">{done}</span>}
      {choosing && (
        <div className="party-sheet-backdrop" role="presentation" onClick={() => setChoosing(false)}>
          <div className="party-sheet pdf-choice-sheet" role="dialog" aria-modal="true" aria-label="ملف PDF" onClick={(e) => e.stopPropagation()}>
            <div className="party-sheet-head">
              <strong>ملف PDF</strong>
              <button type="button" className="dialog-close" onClick={() => setChoosing(false)} aria-label="إغلاق">
                ×
              </button>
            </div>
            <button type="button" className="dialog-primary" onClick={() => void toTelegram()}>
              ✈️ إرسال إلى تيليغرام
            </button>
            <button type="button" className="dialog-secondary" onClick={() => void share()}>
              📤 مشاركة / حفظ
            </button>
          </div>
        </div>
      )}
    </>
  );
}
