"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PartySheet } from "./AccountsSection";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import {
  customerMessages,
  customerMessageText,
  effectHint,
  KIND_TITLES,
  loadMessageEdits,
  loadMessageLog,
  MESSAGE_LOG_EVENT,
  messagesOfKind,
  sentAgo,
  sentMessages,
  type CustomerMessage,
  type CustomerMessageKind,
  type SentCustomerMessage,
} from "@/lib/customerMessages";

const KINDS: CustomerMessageKind[] = ["status", "activation", "travel"];

/**
 * 📨 «رسالة للزبون» from the card's ⋯ (his Nov 7 2026 choice «الرسائل من بطاقة الجهاز أيضًا»): his ready messages
 * (as edited in Settings) straight into the customer's WhatsApp, without a screenshot - and «📜 ما أُرسل»: every
 * message sent to this device's customer, from here or from the browser's 📸.
 */
export function CustomerMessageSheet({
  accountId,
  deviceName,
  customerName,
  phone,
  onSent,
  onClose,
}: {
  accountId: string;
  deviceName: string;
  customerName?: string;
  phone?: string;
  onSent: (message: CustomerMessage) => void;
  onClose: () => void;
}) {
  const list = useMemo(() => customerMessages(loadMessageEdits()), []);
  const [log, setLog] = useState<SentCustomerMessage[]>(() => sentMessages(loadMessageLog(), accountId));
  const [kind, setKind] = useState<CustomerMessageKind>("status");
  useEffect(() => {
    const reload = () => setLog(sentMessages(loadMessageLog(), accountId));
    window.addEventListener(MESSAGE_LOG_EVENT, reload);
    return () => window.removeEventListener(MESSAGE_LOG_EVENT, reload);
  }, [accountId]);

  function send(message: CustomerMessage) {
    const text = customerMessageText(message.body, customerName, deviceName);
    // no number on the device: WhatsApp opens with the text and he picks the chat
    const link = buildWhatsAppLink(phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(link, "_blank", "noopener,noreferrer");
    onSent(message);
  }

  const now = Date.now();
  return (
    <PartySheet title={`📨 رسالة لزبون ${deviceName}`} onClose={onClose}>
      <p className="settings-hint">
        {customerName ? `إلى ${customerName}` : "الجهاز بلا زبون مربوط"}
        {phone ? " - تفتح محادثته في واتساب جاهزة" : " - بلا رقم: اختر المحادثة في واتساب"}
      </p>
      <div className="msg-kind-tabs" role="tablist">
        {KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`msg-kind-tab${kind === k ? " is-active" : ""}`} onClick={() => setKind(k)}>
            {KIND_TITLES[k]}
          </button>
        ))}
      </div>
      <div className="msg-list">
        {messagesOfKind(list, kind).map((m) => {
          const hint = effectHint(m.effect);
          return (
            <button key={m.id} type="button" className="msg-item" onClick={() => send(m)}>
              <span className="msg-item-label">{m.label}</span>
              {hint && <small className="msg-item-hint">{hint}</small>}
            </button>
          );
        })}
      </div>
      <Link href="/settings#customer-messages" className="text-action msg-edit-link" onClick={onClose}>
        ✎ تعديل نصوص الرسائل
      </Link>
      <h3 className="msg-log-title">📜 ما أُرسل ({log.length})</h3>
      {log.length === 0 ? (
        <p className="party-empty">لم تُرسل له رسالة جاهزة بعد.</p>
      ) : (
        <ul className="msg-log">
          {log.map((s) => (
            <li key={`${s.id}-${s.at}`} className="msg-log-item">
              <span>
                {s.via === "browser" ? "📸 " : ""}
                {s.label}
              </span>
              <small>
                {sentAgo(s.at, now)}
                {s.by ? ` · ${s.by}` : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
    </PartySheet>
  );
}
