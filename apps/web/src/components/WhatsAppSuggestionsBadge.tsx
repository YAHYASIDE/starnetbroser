"use client";

import { useEffect, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { isRepWorkspace } from "@/lib/repMode";
import type { WhatsAppSuggestion } from "@/lib/whatsappDesk";
import {
  acceptWhatsAppSuggestion,
  dismissWhatsAppSuggestion,
  loadWhatsAppSuggestions,
  WHATSAPP_SUGGESTIONS_EVENT,
} from "@/lib/whatsappLink";

function when(at: number): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 📧 Emails that came on WhatsApp, waiting for him (his Nov 14 2026 ask: «إن أضفتها تُضاف وإن لم أضفها لا تُضاف»):
 * a badge on every page while any wait, each with «➕ أضف» (the «غير مفعّل» device is made now) or «✕ لا تضف».
 */
export function WhatsAppSuggestionsBadge() {
  const [list, setList] = useState<WhatsAppSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (isRepWorkspace()) return;
    const reload = () => setList(loadWhatsAppSuggestions());
    reload();
    window.addEventListener(WHATSAPP_SUGGESTIONS_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(WHATSAPP_SUGGESTIONS_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  if (!list.length && !open) return null;

  return (
    <>
      {list.length > 0 && (
        <button type="button" className="wa-suggest-badge" data-tour="wa-suggest" onClick={() => setOpen(true)}>
          📧 {list.length} إيميل من واتساب - أضيفه؟
        </button>
      )}
      {open && (
        <PartySheet title="📧 إيميلات وصلت على واتساب" onClose={() => { setOpen(false); setDone(null); }}>
          <p className="settings-hint">لا يُضاف شيء وحده: «➕ أضف» ينشئ جهازًا «غير مفعّل» بهذا الإيميل على الزبون صاحب الرقم، و«✕ لا تضف» يتركه.</p>
          {done && <p className="account-card-alert backup-restored">{done}</p>}
          {list.length === 0 ? (
            <p className="settings-hint">✓ لا شيء ينتظر.</p>
          ) : (
            <ul className="wa-suggest-list">
              {list.map((s) => (
                <li key={s.id} className="wa-suggest">
                  <p className="wa-suggest-who">
                    💬 {s.name}
                    {s.phone && s.phone !== s.name ? <> · <bdi dir="ltr">{s.phone}</bdi></> : null} · <bdi dir="ltr">{when(s.at)}</bdi>
                  </p>
                  <p className="wa-suggest-email">
                    <bdi dir="ltr">{s.email}</bdi>
                  </p>
                  <div className="wa-suggest-actions">
                    <button
                      type="button"
                      className="dialog-primary"
                      onClick={() => {
                        const made = acceptWhatsAppSuggestion(s.id);
                        setDone(made ? `✓ أُضيف ${s.email} - تجده في الأجهزة «غير مفعّل»` : `${s.email} موجود من قبل - لم يُضف شيء`);
                      }}
                    >
                      ➕ أضف
                    </button>
                    <button type="button" className="text-action" onClick={() => dismissWhatsAppSuggestion(s.id)}>
                      ✕ لا تضف
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PartySheet>
      )}
    </>
  );
}
