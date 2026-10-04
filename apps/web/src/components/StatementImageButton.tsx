"use client";

import { useState } from "react";
import { exportStatementImage } from "@/lib/imageExport";
import type { StatementData } from "@/lib/statementDocument";

/** «🖼️ صورة الكشف» - the statement as an invoice-style picture, straight to the share sheet
 * (WhatsApp...). Built only when tapped. */
export function StatementImageButton({ build }: { build: () => StatementData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    const result = await exportStatementImage(build());
    setBusy(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <>
      <button type="button" className="party-action party-action-pdf party-action-image" onClick={share} disabled={busy}>
        {busy ? "⏳ جارِ التجهيز…" : "🖼️ صورة الكشف"}
      </button>
      {error && <span className="account-card-alert ledger-form-error">{error}</span>}
    </>
  );
}
