"use client";

import { useState } from "react";
import { PartySheet } from "./AccountsSection";
import { OP_NOTE_MAX, type ChatOp, type OpStatus } from "@/lib/chatOps";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";

function currency(code: string): string {
  if (code === "FRANC") return "فرنك";
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function money(v: number, sign = false): string {
  const t = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : sign && v > 0 ? "+" : ""}${t}`;
}

/**
 * 💳 One money operation in the rep's conversation (lib/chatOps.ts, his Nov 9 2026 brief): what, when, its number, then
 * per currency «قبل · العملية · بعد» on one row (the operation in the middle, green / red), the rep's answer. On the
 * rep's phone: «✅ جيد» / «❌ غير جيد» (why); on the operator's: the state. Never changes a balance.
 */
export function ChatOpCard({ op, status, rep, onRate }: { op: ChatOp; status: OpStatus; rep: boolean; onRate: (verdict: "good" | "bad", note?: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [changing, setChanging] = useState(false);
  const answered = status.state !== "waiting" && !changing;
  return (
    <div className={`op-card op-card-${status.state}`}>
      <div className="op-card-head">
        <strong>💳 {op.headline}</strong>
        <small>
          <bdi dir="ltr">
            {op.day}
            {op.time ? ` ${op.time}` : ""}
          </bdi>
          {op.serial ? (
            <>
              {" · "}
              <bdi dir="ltr">#{op.serial}</bdi>
            </>
          ) : null}
        </small>
      </div>
      <p className="op-card-what">
        {op.kind}
        {op.note ? ` · ${op.note}` : ""}
      </p>
      <p className="op-card-account">{op.account}</p>
      {op.device && (
        <p className="op-card-device">
          📡 {op.device.name}
          {op.device.email && op.device.email !== op.device.name ? (
            <>
              {" · "}
              <bdi dir="ltr">{op.device.email}</bdi>
            </>
          ) : null}
        </p>
      )}
      {op.figures.map((f) => (
        <div key={f.code} className="op-card-row">
          <span className="op-card-cell">
            <small>قبل</small>
            <bdi dir="ltr">{money(f.before)}</bdi>
          </span>
          <span className={`op-card-cell op-card-amount ${f.amount >= 0 ? "is-plus" : "is-minus"}`}>
            <small>العملية</small>
            <bdi dir="ltr">{money(f.amount, true)}</bdi>
          </span>
          <span className="op-card-cell">
            <small>بعد</small>
            <bdi dir="ltr">{money(f.after)}</bdi>
          </span>
          <span className="op-card-code">{currency(f.code)}</span>
        </div>
      ))}
      {answered ? (
        <p className={`op-card-status is-${status.state}`}>
          {status.state === "good" ? "✅ أكّدها المندوب" : `❌ غير جيد${status.state === "bad" && status.note ? `: ${status.note}` : ""}`}
          {rep && (
            <button type="button" className="text-action" onClick={() => setChanging(true)}>
              تغيير
            </button>
          )}
        </p>
      ) : rep ? (
        <div className="op-card-actions">
          <button
            type="button"
            className="op-card-btn is-good"
            onClick={() => {
              setChanging(false);
              onRate("good");
            }}
          >
            ✅ جيد
          </button>
          <button type="button" className="op-card-btn is-bad" onClick={() => setAsking(true)}>
            ❌ غير جيد
          </button>
        </div>
      ) : (
        <p className="op-card-status is-waiting">⏳ بانتظار مراجعة المندوب</p>
      )}
      {asking && (
        <PartySheet title="❌ غير جيد - ما المشكلة؟" onClose={() => setAsking(false)}>
          <p className="settings-hint">اكتب ما الخطأ: المبلغ الصحيح، أو العملية التي لم تحدث… يصل للمسؤول فورًا.</p>
          <textarea className="msg-input" rows={3} maxLength={OP_NOTE_MAX} placeholder="مثلًا: استلمت 900 وليس 1000" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <button
            type="button"
            className="dialog-primary"
            onClick={() => {
              onRate("bad", note.trim() || undefined);
              setAsking(false);
              setChanging(false);
              setNote("");
            }}
          >
            إرسال «غير جيد»
          </button>
        </PartySheet>
      )}
    </div>
  );
}
