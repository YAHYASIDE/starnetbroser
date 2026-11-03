"use client";

import { useState } from "react";
import { PartySheet } from "./AccountsSection";
import { loadRepCopy } from "@/lib/repCopy";
import { loadOutbox, markFlagSent, MAX_FLAG_NOTE, newRepFlag, outboxForDevice, queueFlag, saveOutbox } from "@/lib/repFlags";
import { pushFlags } from "@/lib/repFlagLink";

function when(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 🚩 The rep's «تحذير للمسؤول» on one device: a description, sent by itself over the operator's
 * Firebase (lib/repFlags.ts) - and what he sent on this device before, with «⏳ / ✓ وصل». */
export function RepFlagSheet({ deviceId, deviceName, email, onClose }: { deviceId: string; deviceName: string; email?: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outbox, setOutbox] = useState(loadOutbox);
  const copy = loadRepCopy();
  const mine = outboxForDevice(outbox, deviceId);

  async function send() {
    if (!copy) {
      setStatus("افتح نسختك من المسؤول أولًا");
      return;
    }
    const flag = newRepFlag({ repId: copy.repId, deviceId, deviceName, ...(email ? { email } : {}), note });
    if (!flag) {
      setStatus("اكتب وصف التحذير");
      return;
    }
    let next = queueFlag(loadOutbox(), flag);
    saveOutbox(next);
    setOutbox(next);
    setNote("");
    if (!copy.flagLink) {
      setStatus("⏳ حُفظ - هاتفك يحتاج نسخة جديدة من المسؤول ليصله التحذير. يُرسل وحده بمجرد أن تفتح النسخة");
      return;
    }
    setBusy(true);
    const result = await pushFlags(copy.flagLink, [flag]);
    setBusy(false);
    if (result.sent.includes(flag.id)) {
      next = markFlagSent(loadOutbox(), flag.id);
      saveOutbox(next);
      setOutbox(next);
      setStatus("✅ وصل التحذير للمسؤول");
    } else {
      setStatus(`⏳ حُفظ - يُرسل وحده حين يتصل الإنترنت${result.message ? ` (${result.message})` : ""}`);
    }
  }

  return (
    <PartySheet title={`🚩 تحذير للمسؤول - ${deviceName}`} onClose={onClose}>
      <div className="rep-flag-form" data-tour="rep-flag">
        <textarea
          className="search-input rep-flag-text"
          rows={3}
          maxLength={MAX_FLAG_NOTE}
          placeholder="ما المشكلة في هذا الجهاز؟ (مثلًا: الطبق لا يتصل منذ يومين)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="button" className="dialog-primary rep-flag-send" disabled={busy || !note.trim()} onClick={() => void send()}>
          {busy ? "⏳ يُرسل…" : "🚩 أرسل التحذير"}
        </button>
        {status && <p className="rep-flag-status">{status}</p>}
        {mine.length > 0 && (
          <ul className="rep-flag-history">
            {mine.map((i) => (
              <li key={i.flag.id}>
                <span>{i.sentAt ? "✓ وصل" : "⏳ ينتظر"}</span> · <bdi dir="ltr">{when(i.flag.at)}</bdi> · {i.flag.note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PartySheet>
  );
}
