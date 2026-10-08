"use client";

import { useState } from "react";
import { PartySheet } from "./AccountsSection";
import { DateInput } from "./DateInput";
import { MAX_NOTE_LENGTH, pinAgeText, type DeviceNote } from "@/lib/deviceNotes";

export type DeviceNoteSheetMode = "menu" | "note";

/** 📌 The device's long-press menu (تثبيت / ملاحظة / التفاصيل) and its note editor, whose two save
 * buttons answer his question «في التثبيتات أم ملاحظة فقط؟» (lib/deviceNotes.ts). */
export function DeviceNoteSheet({
  deviceName,
  note,
  mode: initialMode,
  onSave,
  onSetPinned,
  onDetails,
  onClose,
}: {
  deviceName: string;
  note?: DeviceNote;
  mode: DeviceNoteSheetMode;
  onSave: (input: { text: string; pin: boolean; until?: string }) => void;
  onSetPinned: (pinned: boolean) => void;
  onDetails: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [text, setText] = useState(note?.text ?? "");
  const [until, setUntil] = useState(note?.pinUntil ?? "");
  const pinned = Boolean(note?.pinnedAt);

  if (mode === "menu") {
    return (
      <PartySheet title={deviceName} onClose={onClose}>
        <div className="party-sheet-options device-note-menu">
          <button
            type="button"
            className="party-sheet-option"
            onClick={() => {
              onSetPinned(!pinned);
              onClose();
            }}
          >
            <span aria-hidden="true">📌</span>
            <span>
              <strong>{pinned ? "إلغاء التثبيت" : "تثبيت"}</strong>
              <small>{pinned ? `مثبت ${pinAgeText(note!.pinnedAt!)}` : "يظهر في «📌 المثبتة» أعلى الرئيسية"}</small>
            </span>
          </button>
          <button type="button" className="party-sheet-option" onClick={() => setMode("note")}>
            <span aria-hidden="true">📝</span>
            <span>
              <strong>{note?.text ? "تعديل الملاحظة" : "إضافة ملاحظة"}</strong>
              <small>{note?.text ? note.text : "تظهر فوق الجهاز باللون البنفسجي - لك وحدك"}</small>
            </span>
          </button>
          <button
            type="button"
            className="party-sheet-option"
            onClick={() => {
              onDetails();
              onClose();
            }}
          >
            <span aria-hidden="true">📋</span>
            <span>
              <strong>التفاصيل</strong>
              <small>كما تفتحها اللمسة الواحدة</small>
            </span>
          </button>
        </div>
      </PartySheet>
    );
  }

  function save(pin: boolean) {
    onSave({ text, pin, until: pin ? until : undefined });
    onClose();
  }

  return (
    <PartySheet title={`📝 ملاحظة - ${deviceName}`} onClose={onClose}>
      <div className="device-note-editor">
        <textarea
          id="device-note-text"
          className="search-input device-note-text"
          value={text}
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
          dir="auto"
          placeholder="مثال: الطبق عند الفني - يرجع الخميس"
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <label className="device-note-until">
          <span>⏰ حتى تاريخ (اختياري - يظهر في «خطة اليوم» يومها)</span>
          <DateInput className="search-input" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <p className="settings-hint">لك وحدك: لا تصل للمندوب، ولا تظهر في رسائل الزبون ولا الكشوف.</p>
        <button type="button" className="dialog-primary" onClick={() => save(true)} disabled={!text.trim() && !until && !pinned}>
          📌 حفظ وتثبيت
        </button>
        <button type="button" className="dialog-secondary" onClick={() => save(false)} disabled={!text.trim() && !note?.text}>
          💾 ملاحظة فقط
        </button>
        {note?.text && (
          <button
            type="button"
            className="text-action device-note-delete"
            onClick={() => {
              onSave({ text: "", pin: false });
              onClose();
            }}
          >
            🗑 حذف الملاحظة
          </button>
        )}
      </div>
    </PartySheet>
  );
}
