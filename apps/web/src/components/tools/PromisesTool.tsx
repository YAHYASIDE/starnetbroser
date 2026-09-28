"use client";

import { useMemo, useState } from "react";
import { BulkWhatsAppSender } from "@/components/BulkWhatsAppSender";
import { listClients } from "@/lib/clientStore";
import {
  addPromise,
  bucketPromises,
  buildPromiseReminder,
  deletePromise,
  loadPromises,
  type PaymentPromise,
  reliabilityByClient,
  resolvePromise,
  savePromises,
  validatePromise,
} from "@/lib/paymentPromises";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { currencyLabelFor, currencyOptions, todayIso, type ToolsData } from "./useToolsData";

/** 🤝 Payment promises: recorded, surfaced when due, marked kept or broken. */
export function PromisesTool({ data }: { data: ToolsData }) {
  const [list, setList] = useState<PaymentPromise[]>(() => (typeof window === "undefined" ? [] : loadPromises()));
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const currencies = currencyOptions(data.currencies);
  const [currency, setCurrency] = useState(currencies.find((c) => c.code === "MRU")?.code ?? currencies[0]!.code);
  const [dueDate, setDueDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const label = currencyLabelFor(data.currencies);
  const buckets = useMemo(() => bucketPromises(list, today), [list, today]);
  const reliability = useMemo(() => reliabilityByClient(list), [list]);
  const clients = useMemo(() => listClients(data.clients), [data.clients]);

  function update(next: PaymentPromise[]) {
    savePromises(next);
    setList(next);
  }

  function add() {
    const client = clientId ? data.clients[clientId] : undefined;
    const input = { clientId: client?.id, name: client?.name ?? name, phone: client?.phone, amount: Number(amount), currency, dueDate, note: note.trim() || undefined };
    const problem = validatePromise(input);
    if (problem) return setError(problem);
    update(addPromise(list, input));
    setAdding(false);
    setAmount("");
    setNote("");
    setName("");
    setClientId("");
    setError(null);
  }

  function row(p: PaymentPromise, tone: "overdue" | "today" | "upcoming") {
    const r = reliability[p.clientId ?? p.name];
    const link = buildWhatsAppLink(p.phone, buildPromiseReminder(p, label(p.currency), today));
    return (
      <li key={p.id} className={`tool-promise tool-promise-${tone}`}>
        <div className="tool-promise-head">
          <strong>{p.name}</strong>
          <bdi dir="ltr">
            {p.amount.toLocaleString("en-US")} {label(p.currency)}
          </bdi>
        </div>
        <small>
          {tone === "today" ? "اليوم" : `${p.dueDate.slice(8)}/${p.dueDate.slice(5, 7)}`}
          {tone === "overdue" ? " · متأخر" : ""}
          {r && r.rate !== null ? ` · يفي بوعوده ${Math.round(r.rate * 100)}%` : ""}
          {p.note ? ` · ${p.note}` : ""}
        </small>
        <div className="tool-promise-actions">
          <button type="button" className="text-action" onClick={() => update(resolvePromise(list, p.id, "kept"))}>
            ✅ دفع
          </button>
          <button type="button" className="text-action" onClick={() => update(resolvePromise(list, p.id, "broken"))}>
            ❌ لم يفِ
          </button>
          {link && (
            <a className="tool-wa" href={link} target="_blank" rel="noreferrer">
              تذكير
            </a>
          )}
          <button type="button" className="text-action" aria-label="حذف" onClick={() => window.confirm("حذف هذا الوعد؟") && update(deletePromise(list, p.id))}>
            🗑
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="tool-body">
      <p className="settings-hint">سجّل موعد الدفع الذي وعد به الزبون - يظهر لك يوم الموعد، و«✅ دفع» لا يسجّل المبلغ (سجّله من الجهاز كالعادة).</p>
      {adding ? (
        <div className="tool-form">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="الزبون">
            <option value="">— زبون آخر (اكتب اسمه) —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!clientId && <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" />}
          <div className="tool-form-row">
            <input className="search-input" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" />
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="العملة">
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <input className="search-input" type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="تاريخ الدفع" />
          <input className="search-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" />
          {error && <p className="settings-hint telegram-stopped">{error}</p>}
          <div className="settings-actions">
            <button type="button" className="dialog-primary" onClick={add}>
              حفظ الوعد
            </button>
            <button type="button" className="text-action" onClick={() => setAdding(false)}>
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dialog-primary" onClick={() => setAdding(true)}>
          ➕ وعد جديد
        </button>
      )}
      {buckets.overdue.length + buckets.today.length + buckets.upcoming.length === 0 && <p className="settings-hint">لا توجد وعود مفتوحة.</p>}
      <BulkWhatsAppSender
        targets={[...buckets.overdue, ...buckets.today].flatMap((p) => {
          const link = buildWhatsAppLink(p.phone, buildPromiseReminder(p, label(p.currency), today));
          return link ? [{ id: p.id, name: p.name, link }] : [];
        })}
        label="تذكير كل المستحقين"
      />
      {buckets.overdue.length > 0 && <h3 className="tool-subtitle">⏰ متأخرة ({buckets.overdue.length})</h3>}
      <ul className="tool-list">{buckets.overdue.map((p) => row(p, "overdue"))}</ul>
      {buckets.today.length > 0 && <h3 className="tool-subtitle">📅 اليوم ({buckets.today.length})</h3>}
      <ul className="tool-list">{buckets.today.map((p) => row(p, "today"))}</ul>
      {buckets.upcoming.length > 0 && <h3 className="tool-subtitle">🗓 قادمة ({buckets.upcoming.length})</h3>}
      <ul className="tool-list">{buckets.upcoming.map((p) => row(p, "upcoming"))}</ul>
    </div>
  );
}
