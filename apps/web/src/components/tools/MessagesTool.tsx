"use client";

import { useMemo, useState } from "react";
import { BulkWhatsAppSender } from "@/components/BulkWhatsAppSender";
import { type Audience, buildAudience, fillTemplate, loadTemplates, type MessageTemplate, saveTemplates } from "@/lib/messageTemplates";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { currencyLabelFor, type ToolsData } from "./useToolsData";

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "expiring", label: "تنتهي قريباً" },
  { id: "lapsed", label: "متوقفون" },
  { id: "debtors", label: "عليهم ديون" },
  { id: "all", label: "كل الزبائن" },
  { id: "rep", label: "زبائن مندوب" },
];

/** 📨 Own templates with placeholders, sent to a chosen group one customer at a time. */
export function MessagesTool({ data }: { data: ToolsData }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>(() => (typeof window === "undefined" ? [] : loadTemplates()));
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [audience, setAudience] = useState<Audience>("expiring");
  const [days, setDays] = useState(7);
  const reps = Object.values(data.reps);
  const [repId, setRepId] = useState(reps[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const targets = useMemo(
    () => buildAudience(audience, { accounts: data.accounts, clients: data.clients, ledger: data.ledger, today: new Date(), days, repId, currencyLabel: currencyLabelFor(data.currencies) }),
    [audience, data, days, repId],
  );
  const withPhone = targets.flatMap((t) => {
    const link = template ? buildWhatsAppLink(t.phone, fillTemplate(template.body, t.vars)) : null;
    return link ? [{ id: t.id, name: t.label, link }] : [];
  });

  function update(list: MessageTemplate[]) {
    saveTemplates(list);
    setTemplates(list);
  }

  function startEdit(newOne: boolean) {
    setTitle(newOne ? "" : template?.title ?? "");
    setBody(newOne ? "مرحباً {الاسم}،\n\n- STAR NET" : template?.body ?? "");
    if (newOne) setTemplateId("");
    setEditing(true);
  }

  function saveEdit() {
    if (!title.trim() || !body.trim()) return;
    if (templateId && templates.some((t) => t.id === templateId)) {
      update(templates.map((t) => (t.id === templateId ? { ...t, title: title.trim(), body } : t)));
    } else {
      const id = `t-${Date.now()}`;
      update([...templates, { id, title: title.trim(), body }]);
      setTemplateId(id);
    }
    setEditing(false);
  }

  return (
    <div className="tool-body">
      <label className="tool-field">
        <span>الرسالة</span>
        <div className="tool-form-row">
          <select value={template?.id ?? ""} onChange={(e) => setTemplateId(e.target.value)} aria-label="الرسالة">
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <div className="tool-chips">
            <button type="button" className="tool-chip" onClick={() => startEdit(false)}>
              ✎ تعديل
            </button>
            <button type="button" className="tool-chip" onClick={() => startEdit(true)}>
              ➕ جديدة
            </button>
          </div>
        </div>
      </label>
      {editing && (
        <div className="tool-form tool-quote-line">
          <input className="search-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم الرسالة" />
          <textarea className="search-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="settings-hint">يُستبدل تلقائياً: {"{الاسم}"} {"{الجهاز}"} {"{التاريخ}"} {"{الأيام}"} {"{المبلغ}"}</p>
          <div className="settings-actions">
            <button type="button" className="dialog-primary" onClick={saveEdit}>
              حفظ الرسالة
            </button>
            {templateId && templates.length > 1 && (
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  if (!window.confirm("حذف هذه الرسالة؟")) return;
                  const next = templates.filter((t) => t.id !== templateId);
                  update(next);
                  setTemplateId(next[0]?.id ?? "");
                  setEditing(false);
                }}
              >
                🗑 حذف
              </button>
            )}
            <button type="button" className="text-action" onClick={() => setEditing(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}
      <div className="tool-chips">
        {AUDIENCES.map((a) => (
          <button key={a.id} type="button" className={`tool-chip${audience === a.id ? " tool-chip-on" : ""}`} onClick={() => setAudience(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      {audience === "expiring" && (
        <div className="tool-chips">
          {[3, 7, 14, 30].map((d) => (
            <button key={d} type="button" className={`tool-chip${days === d ? " tool-chip-on" : ""}`} onClick={() => setDays(d)}>
              خلال {d} يوماً
            </button>
          ))}
        </div>
      )}
      {audience === "rep" && (
        <select value={repId} onChange={(e) => setRepId(e.target.value)} aria-label="المندوب">
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      <p className="settings-hint">
        {targets.length} مستلم · {withPhone.length} لديهم واتساب
      </p>
      {template && targets[0] && <pre className="tool-preview">{fillTemplate(template.body, targets[0].vars)}</pre>}
      {withPhone.length === 1 ? (
        <a className="dialog-primary tool-wa-big" href={withPhone[0]!.link} target="_blank" rel="noreferrer">
          إرسال إلى {withPhone[0]!.name}
        </a>
      ) : (
        <BulkWhatsAppSender targets={withPhone} label="إرسال للكل واحداً بعد الآخر" />
      )}
    </div>
  );
}
