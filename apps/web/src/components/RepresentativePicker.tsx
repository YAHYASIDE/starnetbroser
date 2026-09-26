"use client";

import { useMemo, useState } from "react";
import { CreateRepresentativeInput, Representative } from "@/lib/repStore";
import { combinePhoneNumber, DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_CODES } from "@/lib/phoneCountryCodes";

interface Props {
  representatives: Representative[];
  selectedRepresentativeId?: string;
  onSelect: (representativeId: string | undefined) => void;
  onCreateRepresentative: (input: CreateRepresentativeInput) => Representative;
}

/** Search-or-create picker for linking a sale invoice to a Representative record (repStore.ts) -
 * the mirror of ClientPicker.tsx/SupplierPicker.tsx, with a commission-percent field on the "add
 * new" mini-form since that rate is essential and has no sensible default. */
export function RepresentativePicker({ representatives, selectedRepresentativeId, onSelect, onCreateRepresentative }: Props) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommissionPercent, setNewCommissionPercent] = useState("");
  const [newPhoneDialCode, setNewPhoneDialCode] = useState(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
  const [newPhoneLocalNumber, setNewPhoneLocalNumber] = useState("");

  const selected = representatives.find((r) => r.id === selectedRepresentativeId);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return representatives;
    return representatives.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.phone ?? "").toLowerCase().includes(q),
    );
  }, [representatives, query]);

  function submitNewRepresentative() {
    if (!newName.trim() || !newCommissionPercent) return;
    const phone = combinePhoneNumber(newPhoneDialCode, newPhoneLocalNumber);
    const created = onCreateRepresentative({
      name: newName,
      phone: phone || undefined,
      commissionPercent: Number(newCommissionPercent),
    });
    onSelect(created.id);
    setShowNewForm(false);
    setNewName("");
    setNewCommissionPercent("");
    setNewPhoneDialCode(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
    setNewPhoneLocalNumber("");
    setQuery("");
  }

  if (selected) {
    return (
      <div className="client-picker">
        <div className="client-picker-selected">
          <span className="client-picker-selected-name">{selected.name}</span>
          <span className="client-picker-selected-phone" dir="ltr">{selected.commissionPercent}%</span>
          <button type="button" className="text-action" onClick={() => onSelect(undefined)}>تغيير</button>
        </div>
      </div>
    );
  }

  return (
    <div className="client-picker">
      <input
        className="search-input"
        type="text"
        placeholder="ابحث بالاسم أو رقم الهاتف"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="client-picker-list">
        {matches.length === 0 && <p className="client-picker-empty">لا يوجد مندوب مطابق</p>}
        {matches.map((r) => (
          <button key={r.id} type="button" className="client-picker-option" onClick={() => onSelect(r.id)}>
            <span>{r.name}</span>
            <span className="client-picker-option-phone" dir="ltr">{r.commissionPercent}%</span>
          </button>
        ))}
      </div>
      {!showNewForm ? (
        <button
          type="button"
          className="text-action"
          onClick={() => {
            setShowNewForm(true);
            setNewName(query);
          }}
        >
          + إضافة مندوب جديد
        </button>
      ) : (
        <div className="client-picker-new-form">
          <input
            className="search-input"
            placeholder="اسم المندوب *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <input
            className="search-input"
            type="number" lang="en"
            min="0"
            step="0.1"
            dir="ltr"
            placeholder="نسبة العمولة % *"
            value={newCommissionPercent}
            onChange={(e) => setNewCommissionPercent(e.target.value)}
          />
          <div className="phone-input-row">
            <select
              className="phone-country-select"
              dir="ltr"
              value={newPhoneDialCode}
              onChange={(e) => setNewPhoneDialCode(e.target.value)}
              aria-label="رمز الدولة"
            >
              {PHONE_COUNTRY_CODES.map((c) => (
                <option key={c.dialCode} value={c.dialCode}>{c.country} {c.dialCode}</option>
              ))}
            </select>
            <input
              className="phone-local-input"
              dir="ltr"
              type="tel"
              placeholder="رقم الهاتف بدون رمز الدولة (اختياري)"
              value={newPhoneLocalNumber}
              onChange={(e) => setNewPhoneLocalNumber(e.target.value)}
            />
          </div>
          <div className="client-picker-new-actions">
            <button type="button" className="dialog-secondary" onClick={() => setShowNewForm(false)}>إلغاء</button>
            <button type="button" className="dialog-primary" onClick={submitNewRepresentative} disabled={!newName.trim() || !newCommissionPercent}>
              إضافة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
