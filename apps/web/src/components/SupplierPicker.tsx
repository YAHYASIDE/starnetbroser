"use client";

import { useMemo, useState } from "react";
import { CreateSupplierInput, Supplier } from "@/lib/supplierStore";
import { combinePhoneNumber, DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_CODES } from "@/lib/phoneCountryCodes";

interface Props {
  suppliers: Supplier[];
  selectedSupplierId?: string;
  onSelect: (supplierId: string | undefined) => void;
  onCreateSupplier: (input: CreateSupplierInput) => Supplier;
}

/** Search-or-create picker for linking a purchase invoice to a Supplier record (supplierStore.ts)
 * - the mirror of ClientPicker.tsx, same search/create UX, applied to who the operator buys from
 * instead of who they sell to. */
export function SupplierPicker({ suppliers, selectedSupplierId, onSelect, onCreateSupplier }: Props) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  // Kept as two independent pieces of state (never derived from one combined phone string) so
  // picking a country before typing any digits isn't silently lost - see phoneCountryCodes.ts's
  // combinePhoneNumber doc for why a derived approach breaks on that exact, natural order.
  const [newPhoneDialCode, setNewPhoneDialCode] = useState(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
  const [newPhoneLocalNumber, setNewPhoneLocalNumber] = useState("");

  const selected = suppliers.find((s) => s.id === selectedSupplierId);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.phone ?? "").toLowerCase().includes(q),
    );
  }, [suppliers, query]);

  function submitNewSupplier() {
    if (!newName.trim()) return;
    const phone = combinePhoneNumber(newPhoneDialCode, newPhoneLocalNumber);
    const created = onCreateSupplier({ name: newName, phone: phone || undefined });
    onSelect(created.id);
    setShowNewForm(false);
    setNewName("");
    setNewPhoneDialCode(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
    setNewPhoneLocalNumber("");
    setQuery("");
  }

  if (selected) {
    return (
      <div className="client-picker">
        <div className="client-picker-selected">
          <span className="client-picker-selected-name">{selected.name}</span>
          {selected.phone && <span className="client-picker-selected-phone" dir="ltr">{selected.phone}</span>}
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
        {matches.length === 0 && <p className="client-picker-empty">لا يوجد مورّد مطابق</p>}
        {matches.map((s) => (
          <button key={s.id} type="button" className="client-picker-option" onClick={() => onSelect(s.id)}>
            <span>{s.name}</span>
            {s.phone && <span className="client-picker-option-phone" dir="ltr">{s.phone}</span>}
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
          + إضافة مورّد جديد
        </button>
      ) : (
        <div className="client-picker-new-form">
          <input
            className="search-input"
            placeholder="اسم المورّد *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
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
            <button type="button" className="dialog-primary" onClick={submitNewSupplier} disabled={!newName.trim()}>
              إضافة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
