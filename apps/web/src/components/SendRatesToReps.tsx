"use client";

import { useMemo, useState } from "react";
import { PartySheet } from "@/components/AccountsSection";
import { loadCurrencyStore } from "@/lib/currencyStore";
import { ratesLines, repSendSummary, type RepSendRow } from "@/lib/repCopyAuto";
import { sendRatesToAllReps } from "@/lib/repCopySend";
import type { Representative } from "@/lib/repStore";
import type { StarlinkAccountSummary } from "@starnet/shared";

/**
 * 💱📤 «أرسل العملات لكل المندوبين الآن» (his Nov 27 2026): shows the rates this phone (the main one) holds, then sends every
 * linked rep his copy with those rates through the reps bot, and says who got it and who is not linked.
 */
export function SendRatesToReps({ reps, accounts }: { reps: Representative[]; accounts: StarlinkAccountSummary[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<RepSendRow[] | null>(null);
  const lines = useMemo(() => (open ? ratesLines(loadCurrencyStore()) : []), [open]);

  async function send() {
    setBusy(true);
    setRows(null);
    const result = await sendRatesToAllReps(reps, accounts, setProgress);
    setRows(result);
    setProgress("");
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="dialog-secondary" onClick={() => setOpen(true)}>
        💱 أرسل العملات لكل المندوبين الآن
      </button>
      {open && (
        <PartySheet title="💱 العملات للمندوبين" onClose={() => !busy && setOpen(false)}>
          <p className="settings-hint">
            تُرسل لكل مندوب نسخته من هذا الهاتف (الرئيسي) مع هذه الأسعار الآن، عبر بوت المندوبين. تأكد أنها صحيحة قبل الإرسال:
          </p>
          <ul className="settings-hint" dir="rtl">
            {lines.map((l) => (
              <li key={l}>
                <bdi dir="ltr">{l}</bdi>
              </li>
            ))}
            {lines.length === 0 && <li>لا توجد عملات.</li>}
          </ul>
          <p className="settings-hint">المندوبون: {reps.length}. من لم يربط بوته وهاتفه لا يصله شيء.</p>
          <button type="button" className="dialog-primary" disabled={busy || reps.length === 0} onClick={() => void send()}>
            {busy ? progress || "⏳ يرسل…" : "📤 أرسل الآن"}
          </button>
          {rows && (
            <>
              <p className="settings-hint">{repSendSummary(rows)}</p>
              <ul className="settings-hint" dir="rtl">
                {rows.map((r) => (
                  <li key={r.repId}>
                    {r.status === "sent" ? "✓" : r.status === "skipped" ? "⏭️" : "✗"} {r.name}: {r.note}
                  </li>
                ))}
              </ul>
            </>
          )}
        </PartySheet>
      )}
    </>
  );
}
