"use client";

import { useMemo, useState } from "react";
import { Client, CreateClientInput } from "@/lib/clientStore";
import { combinePhoneNumber, DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_CODES } from "@/lib/phoneCountryCodes";

interface Props {
  clients: Client[];
  selectedClientId?: string;
  onSelect: (clientId: string | undefined) => void;
  onCreateClient: (input: CreateClientInput) => Client;
}

/**
 * Search-or-create picker for linking a device/account to a Client record (see clientStore.ts).
 * Never links by name/email similarity - only an explicit selection here, or a freshly created
 * client, ever sets clientId.
 */
export function ClientPicker({ clients, selectedClientId, onSelect, onCreateClient }: Props) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  // Kept as two independent pieces of state (never derived from one combined phone string) so
  // picking a country before typing any digits isn't silently lost - see phoneCountryCodes.ts's
  // combinePhoneNumber doc for why a derived approach breaks on that exact, natural order.
  const [newPhoneDialCode, setNewPhoneDialCode] = useState(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
  const [newPhoneLocalNumber, setNewPhoneLocalNumber] = useState("");

  const selected = clients.find((c) => c.id === selectedClientId);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [clients, query]);

  function submitNewClient() {
    if (!newName.trim()) return;
    const phone = combinePhoneNumber(newPhoneDialCode, newPhoneLocalNumber);
    const created = onCreateClient({ name: newName, phone: phone || undefined });
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
        {matches.length === 0 && <p className="client-picker-empty">لا يوجد زبون مطابق</p>}
        {matches.map((c) => (
          <button key={c.id} type="button" className="client-picker-option" onClick={() => onSelect(c.id)}>
            <span>{c.name}</span>
            {c.phone && <span className="client-picker-option-phone" dir="ltr">{c.phone}</span>}
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
          + إضافة زبون جديد
        </button>
      ) : (
        <div className="client-picker-new-form">
          <input
            className="search-input"
            placeholder="اسم الزبون *"
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
            <button type="button" className="dialog-primary" onClick={submitNewClient} disabled={!newName.trim()}>
              إضافة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
