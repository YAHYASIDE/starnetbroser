"use client";

import { useMemo, useState } from "react";
import { Client, CreateClientInput } from "@/lib/clientStore";
import { clientMatches, detectPhone, isPhoneQuery, newClientInput, type ClientPickerInfo } from "@/lib/clientPicker";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS } from "@/lib/ledgerStore";
import { combinePhoneNumber, DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_CODES, splitPhoneNumber } from "@/lib/phoneCountryCodes";
import { duplicateQuestion, findClientDuplicates } from "@/lib/duplicates";
import { DuplicateWarning } from "./DuplicateWarning";

interface Props {
  clients: Client[];
  selectedClientId?: string;
  onSelect: (clientId: string | undefined) => void;
  onCreateClient: (input: CreateClientInput) => Client;
  /** ✎ «تعديل» the chosen customer right here (his Oct 30 2026 ask) - absent = no edit button. */
  onUpdateClient?: (clientId: string, input: CreateClientInput) => void;
  /** 📊 His devices and balance, shown in the list. */
  clientInfo?: (clientId: string) => ClientPickerInfo;
}

/**
 * Search-or-create picker for linking a device/account to a Client record (see clientStore.ts).
 * Never links by name/email similarity - only an explicit selection here, or a freshly created
 * client, ever sets clientId.
 */
export function ClientPicker({ clients, selectedClientId, onSelect, onCreateClient, onUpdateClient, clientInfo }: Props) {
  const [query, setQuery] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  // Kept as two independent pieces of state (never derived from one combined phone string) so
  // picking a country before typing any digits isn't silently lost - see phoneCountryCodes.ts's
  // combinePhoneNumber doc for why a derived approach breaks on that exact, natural order.
  const [newPhoneDialCode, setNewPhoneDialCode] = useState(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
  const [newPhoneLocalNumber, setNewPhoneLocalNumber] = useState("");
  // ✎ the chosen customer being edited
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDial, setEditDial] = useState(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
  const [editLocal, setEditLocal] = useState("");

  const selected = clients.find((c) => c.id === selectedClientId);
  const newDuplicates = useMemo(
    () => (showNewForm ? findClientDuplicates({ name: newName, phone: combinePhoneNumber(newPhoneDialCode, newPhoneLocalNumber) }, clients) : []),
    [showNewForm, newName, newPhoneDialCode, newPhoneLocalNumber, clients],
  );

  const matches = useMemo(() => clients.filter((c) => clientMatches(c, query)), [clients, query]);

  const newInput = newClientInput(newName, combinePhoneNumber(newPhoneDialCode, newPhoneLocalNumber));

  function submitNewClient() {
    if (!newInput) return;
    if (newDuplicates.length > 0 && !window.confirm(duplicateQuestion(newDuplicates))) return;
    const created = onCreateClient(newInput);
    onSelect(created.id);
    setShowNewForm(false);
    setNewName("");
    setNewPhoneDialCode(DEFAULT_PHONE_COUNTRY_CODE.dialCode);
    setNewPhoneLocalNumber("");
    setQuery("");
  }

  /** ➕ The searched number as a customer, in one tap. */
  function addSearchedNumber() {
    const phone = detectPhone(query, DEFAULT_PHONE_COUNTRY_CODE.dialCode);
    const input = newClientInput("", combinePhoneNumber(phone.dialCode, phone.localNumber));
    if (!input) return;
    const created = onCreateClient(input);
    onSelect(created.id);
    setQuery("");
  }

  function startEdit(client: Client) {
    const split = splitPhoneNumber(client.phone);
    setEditName(client.noName ? "" : client.name);
    setEditDial(split.dialCode);
    setEditLocal(split.localNumber);
    setEditing(true);
  }

  const editInput = newClientInput(editName, combinePhoneNumber(editDial, editLocal));

  function saveEdit(client: Client) {
    if (!editInput || !onUpdateClient) return;
    // Every other detail of his (limit, currency, categories) stays.
    onUpdateClient(client.id, { ...editInput, creditLimit: client.creditLimit });
    setEditing(false);
  }

  if (selected) {
    if (editing) {
      return (
        <div className="client-picker">
          <div className="client-picker-new-form">
            <input className="search-input" placeholder="اسم الزبون (اختياري إن وُجد رقمه)" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            <PhoneRow
              dialCode={editDial}
              localNumber={editLocal}
              onChange={(dial, local) => {
                setEditDial(dial);
                setEditLocal(local);
              }}
            />
            <div className="client-picker-new-actions">
              <button type="button" className="dialog-secondary" onClick={() => setEditing(false)}>إلغاء</button>
              <button type="button" className="dialog-primary" onClick={() => saveEdit(selected)} disabled={!editInput}>
                حفظ
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="client-picker">
        <div className="client-picker-selected">
          <span className="client-picker-selected-name">
            {selected.noName ? <bdi dir="ltr">{selected.name}</bdi> : selected.name}
            {selected.noName && <span className="client-picker-noname">بلا اسم</span>}
          </span>
          {selected.phone && !selected.noName && <span className="client-picker-selected-phone" dir="ltr">{selected.phone}</span>}
          {onUpdateClient && (
            <button type="button" className="text-action" onClick={() => startEdit(selected)}>✎ تعديل</button>
          )}
          <button type="button" className="text-action" onClick={() => onSelect(undefined)}>تغيير</button>
        </div>
      </div>
    );
  }

  return (
    <div className="client-picker">
      <input
        className="search-input"
        data-tour="client-picker"
        type="text"
        placeholder="ابحث بالاسم أو رقم الهاتف"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="client-picker-list">
        {matches.length === 0 && <p className="client-picker-empty">لا يوجد زبون مطابق</p>}
        {matches.map((c) => {
          const info = clientInfo?.(c.id);
          return (
            <button key={c.id} type="button" className="client-picker-option" onClick={() => onSelect(c.id)}>
              <span className="client-picker-option-main">
                <span>
                  {c.noName ? <bdi dir="ltr">{c.name}</bdi> : c.name}
                  {c.noName && <span className="client-picker-noname">بلا اسم</span>}
                </span>
                {info && (
                  <span className="client-picker-option-info">
                    📡 {info.devices}
                    {info.owed.map(([code, v]) => (
                      <span key={code} className={v > 0 ? "client-picker-due" : "client-picker-credit"}>
                        {v > 0 ? "عليه" : "له"} <bdi dir="ltr">{formatAmount(Math.abs(v))}</bdi> {LEDGER_CURRENCY_LABELS[code] ?? code}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {c.phone && !c.noName && <span className="client-picker-option-phone" dir="ltr">{c.phone}</span>}
            </button>
          );
        })}
      </div>
      {matches.length === 0 && isPhoneQuery(query) && (
        <button type="button" className="dialog-primary client-picker-add-number" onClick={addSearchedNumber}>
          ➕ أضف هذا الرقم كزبون (بلا اسم)
        </button>
      )}
      {!showNewForm ? (
        <button
          type="button"
          className="text-action"
          onClick={() => {
            setShowNewForm(true);
            // a searched number goes in the phone field, a name in the name field
            if (isPhoneQuery(query)) {
              const phone = detectPhone(query, newPhoneDialCode);
              setNewPhoneDialCode(phone.dialCode);
              setNewPhoneLocalNumber(phone.localNumber);
              setNewName("");
            } else setNewName(query);
          }}
        >
          + إضافة زبون جديد
        </button>
      ) : (
        <div className="client-picker-new-form">
          <input
            className="search-input"
            placeholder="اسم الزبون (اختياري إن كتبت رقمه)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <PhoneRow
            dialCode={newPhoneDialCode}
            localNumber={newPhoneLocalNumber}
            onChange={(dial, local) => {
              setNewPhoneDialCode(dial);
              setNewPhoneLocalNumber(local);
            }}
          />
          <DuplicateWarning
            hits={newDuplicates}
            onUse={(hit) => {
              if (!hit.id) return;
              onSelect(hit.id);
              setShowNewForm(false);
              setNewName("");
              setNewPhoneLocalNumber("");
              setQuery("");
            }}
          />
          <div className="client-picker-new-actions">
            <button type="button" className="dialog-secondary" onClick={() => setShowNewForm(false)}>إلغاء</button>
            <button type="button" className="dialog-primary" onClick={submitNewClient} disabled={!newInput}>
              إضافة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The country + number row; a number typed or pasted with its country code (212…, +213…, 00223…) picks the country. */
function PhoneRow({ dialCode, localNumber, onChange }: { dialCode: string; localNumber: string; onChange: (dialCode: string, localNumber: string) => void }) {
  return (
    <div className="phone-input-row">
      <select className="phone-country-select" dir="ltr" value={dialCode} onChange={(e) => onChange(e.target.value, localNumber)} aria-label="رمز الدولة">
        {PHONE_COUNTRY_CODES.map((c) => (
          <option key={c.dialCode} value={c.dialCode}>{c.country} {c.dialCode}</option>
        ))}
      </select>
      <input
        className="phone-local-input"
        dir="ltr"
        type="tel"
        placeholder="رقم الهاتف (اختياري إن كتبت الاسم)"
        value={localNumber}
        onChange={(e) => {
          const phone = detectPhone(e.target.value, dialCode);
          onChange(phone.dialCode, phone.localNumber);
        }}
      />
    </div>
  );
}
