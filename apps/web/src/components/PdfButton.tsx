"use client";

import { useState } from "react";
import { PrintableDocument } from "@/lib/pdfDocument";
import { exportPrintablePdf } from "@/lib/pdfExport";

/** "📄 PDF" - builds the document only when tapped (never on every render). */
export function PdfButton({ build, className = "party-action", label = "🖨️ PDF" }: { build: () => PrintableDocument; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await exportPrintablePdf(build());
    setBusy(false);
    if (!result.ok) setError(result.message);
  }

  return (
    <>
      <button type="button" className={className} onClick={run} disabled={busy}>
        {busy ? "⏳ جارِ التجهيز…" : label}
      </button>
      {error && <span className="account-card-alert ledger-form-error">{error}</span>}
    </>
  );
}
