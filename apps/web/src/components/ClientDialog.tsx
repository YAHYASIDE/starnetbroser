"use client";

import { FormEvent, useState } from "react";
import { Client } from "@/lib/clientStore";

interface Props {
  client: Client;
  linkedAccountCount: number;
  onClose: () => void;
  onSave: (patch: { name: string; phone?: string }) => void;
}

/**
 * The "صفحة الزبون" opened by tapping a client's name on a device card. Currently a basic info
 * card (name/phone, linked-device count, rename) - the full financial statement (per-device
 * balances/results, totals across devices) is added on top of this same dialog once the
 * accounting rework reaches that stage.
 */
export function ClientDialog({ client, linkedAccountCount, onClose, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), phone: phone.trim() || undefined });
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setName(client.name);
    setPhone(client.phone ?? "");
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="account-dialog client-dialog" role="dialog" aria-modal="true" aria-labelledby="client-dialog-title">
        <header className="dialog-header">
          <div>
            <h2 id="client-dialog-title">بطاقة الزبون</h2>
            <p>{linkedAccountCount} جهاز مرتبط بهذا الزبون</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        {editing ? (
          <form className="account-form" onSubmit={submit}>
            <label className="form-field form-wide">
              <span>اسم الزبون *</span>
              <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="form-field form-wide">
              <span>رقم الهاتف</span>
              <input dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <div className="dialog-actions form-wide">
              <button className="dialog-secondary" type="button" onClick={cancelEdit}>إلغاء</button>
              <button className="dialog-primary" type="submit">حفظ</button>
            </div>
          </form>
        ) : (
          <>
            <div className="account-info-grid">
              <div><span>اسم الزبون</span><strong>{client.name}</strong></div>
              <div><span>رقم الهاتف</span><strong dir="ltr">{client.phone || "—"}</strong></div>
              <div><span>عدد الأجهزة</span><strong>{linkedAccountCount}</strong></div>
            </div>
            <div className="dialog-actions form-wide">
              <button className="dialog-secondary" type="button" onClick={() => setEditing(true)}>تعديل اسم الزبون</button>
              <button className="dialog-primary dialog-done" type="button" onClick={onClose}>تم</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
