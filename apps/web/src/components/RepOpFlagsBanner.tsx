"use client";

import { useEffect, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { loadRepresentativeStore } from "@/lib/repStore";
import { loadOpRatings, markReviewed, OP_RATINGS_CHANGED, openFlags, saveOpRatings, type OpenFlag } from "@/lib/repOpRatings";

function when(at: number): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 🚨 «❌ غير جيد» from a rep on an operation of the money bot (lib/repOpRatings.ts): a red badge on every
 * page - not closable - until he opens it and taps «✓ راجعتها» on each one. The quiet «✅ جيد» never
 * shows here (only a line in the 🔔 list).
 */
export function RepOpFlagsBanner() {
  const [flags, setFlags] = useState<OpenFlag[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const reload = () => setFlags(openFlags(loadOpRatings()));
    reload();
    window.addEventListener(OP_RATINGS_CHANGED, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(OP_RATINGS_CHANGED, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  if (!flags.length) return null;
  const reps = loadRepresentativeStore();

  return (
    <>
      <button type="button" className="op-flags-badge" role="alert" aria-label={`${flags.length} عمليات قيّمها المندوب «غير جيد» - راجعها`} data-tour="op-flags" onClick={() => setOpen(true)}>
        🚨 {flags.length} للمراجعة «غير جيد»
      </button>
      {open && (
        <PartySheet title="🚨 عمليات قيّمها المندوب «غير جيد»" onClose={() => setOpen(false)}>
          <ul className="op-flags-list">
            {flags.map((f) => (
              <li key={f.rating.token} className="op-flag">
                <p className="op-flag-who">
                  ❌ {reps[f.rating.repId]?.name ?? "المندوب"}
                  {f.rating.by && f.rating.by !== reps[f.rating.repId]?.name ? ` (${f.rating.by})` : ""} · <bdi dir="ltr">{when(f.rating.at)}</bdi>
                  {f.op ? ` · ${f.op.account}` : ""}
                </p>
                <pre className="op-flag-text">{f.text || "(لا نص)"}</pre>
                <button
                  type="button"
                  className="dialog-primary op-flag-done"
                  onClick={() => {
                    const next = markReviewed(loadOpRatings(), f.rating.token, Date.now());
                    saveOpRatings(next);
                    if (!openFlags(next).length) setOpen(false);
                  }}
                >
                  ✓ راجعتها
                </button>
              </li>
            ))}
          </ul>
        </PartySheet>
      )}
    </>
  );
}
