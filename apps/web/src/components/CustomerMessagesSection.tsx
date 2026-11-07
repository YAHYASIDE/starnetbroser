"use client";

import { useEffect, useState } from "react";
import {
  customerMessages,
  customerMessageText,
  DEFAULT_CUSTOMER_MESSAGES,
  editCustomerMessage,
  effectHint,
  isEdited,
  KIND_TITLES,
  loadMessageEdits,
  MAX_BODY,
  MAX_LABEL,
  messagesOfKind,
  saveMessageEdits,
  type CustomerMessage,
  type CustomerMessageEdits,
  type CustomerMessageKind,
} from "@/lib/customerMessages";

const KINDS: CustomerMessageKind[] = ["status", "activation", "travel"];

/**
 * 💬 «رسائل الزبون الجاهزة» (his Nov 7 2026 choice «تعديل نصوص الرسائل»): each message's button and text, edited
 * here - used by the device browser's 📸 and the card's ⋯ «رسالة للزبون». Only what he changes is kept, so
 * «↺ الأصل» brings his original words back. The greeting, the device line and «⭐ STAR NET» are added by themselves.
 */
export function CustomerMessagesSection() {
  const [edits, setEdits] = useState<CustomerMessageEdits>({});
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", body: "" });
  const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => setEdits(loadMessageEdits()), []);
  const list = customerMessages(edits);

  function start(m: CustomerMessage) {
    setOpen(m.id);
    setDraft({ label: m.label, body: m.body });
    setSavedId(null);
  }

  function commit(next: CustomerMessageEdits, id: string) {
    saveMessageEdits(next);
    setEdits(next);
    setSavedId(id);
  }

  function save(id: string) {
    commit(editCustomerMessage(edits, id, draft), id);
    setOpen(null);
  }

  function reset(id: string) {
    const base = DEFAULT_CUSTOMER_MESSAGES.find((m) => m.id === id)!;
    commit(editCustomerMessage(edits, id, { label: base.label, body: base.body }), id);
    setDraft({ label: base.label, body: base.body });
  }

  return (
    <section className="section">
      <h2 className="section-title">💬 رسائل الزبون الجاهزة</h2>
      <p className="settings-hint">
        تُرسل مع 📸 في متصفح الجهاز ومن ⋯ «رسالة للزبون» في بطاقته. التحية باسم الزبون واسم الجهاز و«⭐ STAR NET» تُضاف وحدها.
      </p>
      {KINDS.map((kind) => (
        <div key={kind} className="msg-edit-group">
          <h3 className="msg-log-title">{KIND_TITLES[kind]}</h3>
          {messagesOfKind(list, kind).map((m) => {
            const hint = effectHint(m.effect);
            if (open !== m.id) {
              return (
                <button key={m.id} type="button" className="msg-item" onClick={() => start(m)}>
                  <span className="msg-item-label">
                    {m.label}
                    {isEdited(edits, m.id) && <small className="msg-edited"> · معدّلة</small>}
                    {savedId === m.id && <small className="msg-edited"> · ✓ حُفظت</small>}
                  </span>
                  {hint && <small className="msg-item-hint">{hint}</small>}
                </button>
              );
            }
            return (
              <div key={m.id} className="msg-edit-box">
                <label className="msg-field">
                  الزر
                  <input className="msg-input" maxLength={MAX_LABEL} value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
                </label>
                <label className="msg-field">
                  الرسالة
                  <textarea className="msg-input msg-edit-body" rows={4} maxLength={MAX_BODY} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
                </label>
                <pre className="msg-preview">{customerMessageText(draft.body.trim() || m.body, "أحمد", "اسم الجهاز")}</pre>
                <div className="msg-edit-actions">
                  <button type="button" className="dialog-primary" onClick={() => save(m.id)}>
                    💾 حفظ
                  </button>
                  {isEdited(edits, m.id) && (
                    <button type="button" className="text-action" onClick={() => reset(m.id)}>
                      ↺ الأصل
                    </button>
                  )}
                  <button type="button" className="text-action" onClick={() => setOpen(null)}>
                    إلغاء
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
