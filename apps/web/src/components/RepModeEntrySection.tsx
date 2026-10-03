"use client";

import { useState } from "react";
import { formatRepDeviceCode, saveRepMode } from "@/lib/repDeviceTransfer";

/** Settings: switch this phone to 📱 وضع المندوب with the code the operator gave the rep. */
export function RepModeEntrySection() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function enter() {
    const formatted = formatRepDeviceCode(code);
    if (!formatted) return setError("الرمز غير صحيح - 12 حرفاً ورقماً كما أعطاك المسؤول");
    if (!window.confirm("تحويل هذا الهاتف إلى وضع المندوب؟ يظهر فيه فقط إضافة الأجهزة وإرسالها للمسؤول.")) return;
    saveRepMode({ code: formatted, ...(name.trim() ? { name: name.trim() } : {}) });
  }

  return (
    <section className="section">
      <h2 className="section-title">📱 وضع المندوب</h2>
      <p className="settings-hint">
        لهاتف المندوب فقط: يضيف أجهزة زبائنه ويسجّل دخولها إلى Starlink، ثم يرسلها للمسؤول عبر بوت المندوبين. الرمز يعطيه المسؤول من صفحة
        المندوبين ← إدارة ← «رمز تطبيق المندوب».
      </p>
      <input className="search-input" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" />
      <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك (اختياري)" />
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={enter}>
          تفعيل وضع المندوب
        </button>
      </div>
    </section>
  );
}
