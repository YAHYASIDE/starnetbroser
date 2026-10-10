"use client";

import { useMemo, useState } from "react";
import { addClientNote, deleteClientNote, loadClientNotes, saveClientNotes, sortedClientNotes, togglePinClientNote } from "@/lib/clientNotes";
import { loadPromises, reliabilityByClient } from "@/lib/paymentPromises";

function when(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** 📝 The customer's notes log (inside a PartySheet) + how reliably he keeps payment promises. */
export function ClientNotesPanel({ clientId, onCountChange }: { clientId: string; onCountChange?: (count: number) => void }) {
  const [store, setStore] = useState(() => loadClientNotes());
  const [text, setText] = useState("");
  const notes = sortedClientNotes(store[clientId]);
  const reliability = useMemo(() => reliabilityByClient(loadPromises())[clientId], [clientId]);

  function update(next: typeof store) {
    saveClientNotes(next);
    setStore(next);
    onCountChange?.(next[clientId]?.length ?? 0);
  }

  return (
    <div className="client-notes">
      {reliability && reliability.rate !== null && (
        <p className={`client-notes-reliability ${reliability.rate >= 0.7 ? "telegram-running" : "telegram-stopped"}`}>
          🤝 يفي بوعود الدفع {Math.round(reliability.rate * 100)}% ({reliability.kept} من {reliability.kept + reliability.broken})
        </p>
      )}
      <div className="client-notes-add">
        <textarea className="search-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="ملاحظة جديدة…" />
        <button
          type="button"
          className="dialog-primary"
          disabled={!text.trim()}
          onClick={() => {
            update(addClientNote(store, clientId, text));
            setText("");
          }}
        >
          إضافة
        </button>
      </div>
      {notes.length === 0 && <p className="settings-hint">لا توجد ملاحظات بعد.</p>}
      <ul className="client-notes-list">
        {notes.map((note) => (
          <li key={note.id} className={note.pinned ? "client-note-pinned" : undefined}>
            <p>{note.text}</p>
            <div className="client-note-meta">
              <small>{when(note.createdAt)}</small>
              <button type="button" className="text-action" onClick={() => update(togglePinClientNote(store, clientId, note.id))}>
                {note.pinned ? "📌 مثبتة" : "📌 تثبيت"}
              </button>
              <button type="button" className="text-action" aria-label="حذف" onClick={() => window.confirm("حذف الملاحظة؟") && update(deleteClientNote(store, clientId, note.id))}>
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function clientNoteCount(clientId: string): number {
  return loadClientNotes()[clientId]?.length ?? 0;
}
