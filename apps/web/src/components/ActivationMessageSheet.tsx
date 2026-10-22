"use client";

import { useEffect, useRef, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { buildActivationMessage, missingActivationFields, SYNCED_FIELD_LABELS } from "@/lib/activationMessage";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/** 📨 «رسالة التفعيل» (his Oct 22 2026 ask): his own activation message filled from the device, sent
 * to the customer's WhatsApp or copied. KIT / subscription / ACC come from Starlink, so when one is
 * missing the device is synced first (his choice) - the message refills itself when the read lands. */
export function ActivationMessageSheet({
  account,
  clientName,
  phone,
  canSync,
  syncing,
  onSync,
  onClose,
}: {
  account: StarlinkAccountSummary;
  clientName?: string;
  phone?: string;
  canSync: boolean;
  syncing: boolean;
  onSync: () => Promise<void>;
  onClose: () => void;
}) {
  const [date] = useState(() => new Date());
  const [copied, setCopied] = useState(false);
  const [synced, setSynced] = useState(false);
  const started = useRef(false);
  const missing = missingActivationFields(account);
  const message = buildActivationMessage(account, clientName, date);
  const whatsappLink = buildWhatsAppLink(phone, message);

  async function sync() {
    await onSync();
    setSynced(true);
  }

  useEffect(() => {
    if (started.current || !canSync || missing.length === 0) return;
    started.current = true;
    void sync();
    // Once per opening: only when something was missing at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("انسخ الرسالة:", message);
    }
  }

  function sendWhatsApp() {
    window.open(whatsappLink ?? `https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet activation-sheet" role="dialog" aria-modal="true" aria-label="رسالة التفعيل" onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>📨 رسالة التفعيل</strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        {missing.length > 0 && (
          <div className="activation-missing">
            <span>
              {syncing
                ? "⏳ يتم التحديث من Starlink…"
                : synced
                  ? "⏳ بانتظار نتيجة التحديث - تمتلئ الرسالة وحدها."
                  : "لم يُقرأ بعد من Starlink:"}{" "}
              {missing.map((key) => SYNCED_FIELD_LABELS[key]).join("، ")}
            </span>
            {canSync && !syncing && (
              <button type="button" className="text-action" onClick={() => void sync()}>
                🔄 {synced ? "أعد التحديث" : "حدّث من Starlink"}
              </button>
            )}
          </div>
        )}
        <pre className="activation-preview" dir="rtl">
          {message}
        </pre>
        <div className="activation-actions">
          <button type="button" className="dialog-primary" onClick={sendWhatsApp}>
            💬 {whatsappLink ? "واتساب الزبون" : "واتساب"}
          </button>
          <button type="button" className="dialog-secondary" onClick={() => void copy()}>
            {copied ? "✓ نُسخت" : "📋 نسخ"}
          </button>
        </div>
        {!whatsappLink && <p className="settings-hint">لا رقم واتساب لهذا الزبون - تختار المحادثة في واتساب.</p>}
      </div>
    </div>
  );
}
