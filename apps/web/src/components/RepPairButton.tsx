"use client";

import { useState } from "react";
import { shareRepPairing } from "@/lib/repChangesSend";

/** 🔗 «ربط هاتفي» (rep's phone): sends this phone's own key to the operator through the reps bot -
 * from then on his copies open on this phone only (repDeviceTransfer.ts). */
export function RepPairButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="rep-pair">
      <button
        type="button"
        className="dialog-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const result = await shareRepPairing();
          setBusy(false);
          setMessage(result.ok ? "📤 أرسله في محادثة بوت المندوبين - يصلك «🔗 رُبط هاتفك» ثم نسختك." : result.message);
        }}
      >
        {busy ? "⏳ …" : "🔗 ربط هاتفي بالمسؤول"}
      </button>
      <p className="settings-hint">نسخة أجهزتك لا تُفتح إلا على الهاتف المربوط، حتى لو أخذ أحد الملف والرمز.</p>
      {message && <p className="settings-hint rep-mode-message">{message}</p>}
    </div>
  );
}
