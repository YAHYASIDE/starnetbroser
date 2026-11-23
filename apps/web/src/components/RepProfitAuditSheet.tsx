"use client";

import { useMemo, useState } from "react";
import { browserLinkStorage, loadOrigins } from "@/lib/deviceLink";
import { formatAmount } from "@/lib/formatAmount";
import type { RepConvert } from "@/lib/repAccount";
import type { LoggedOp } from "@/lib/repOpLog";
import { buildProfitAudit, type ShareMakeup } from "@/lib/repProfitAudit";
import type { RepDeviceCommissionRow } from "@/lib/repStore";
import { shareText } from "@/lib/shareText";

/** yyyy-mm-ddThh:mm (local) for <input type="datetime-local">. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function makeupText(m: ShareMakeup): string {
  const parts: string[] = [];
  if (m.saleUsd !== undefined) parts.push(`البيع ${formatAmount(m.saleUsd)}$`);
  if (m.costUsd !== undefined) {
    const foreign = m.costCurrency && m.costCurrency !== "USD" && m.costAmount !== undefined;
    parts.push(`تكلفة ستارلينك ${formatAmount(m.costUsd)}$${foreign ? ` (${formatAmount(m.costAmount!)} ${m.costCurrency}${m.costRate ? ` بسعر 1$ = ${formatAmount(m.costRate)}` : ""})` : ""}`);
  }
  if (m.profitUsd !== undefined) parts.push(`الربح ${formatAmount(m.profitUsd)}$`);
  if (m.hisProfitUsd !== undefined && m.profitUsd !== undefined && Math.abs(m.hisProfitUsd - m.profitUsd) > 0.004) parts.push(`ربحه بسعره ${formatAmount(m.hisProfitUsd)}$`);
  parts.push(`نسبته ${formatAmount(m.percent)}%`);
  return parts.join(" · ");
}

/**
 * 🔍 «فحص حساب الربح» (his Nov 23 2026 report) - read only: what landed late, the doubles, and the operations whose
 * share changed after the bot sent them. Tapping a line opens it (to edit or delete by his own hand).
 */
export function RepProfitAuditSheet({
  rows,
  ops,
  convert,
  list,
  accountName,
  accountEmail,
  onOpen,
}: {
  rows: RepDeviceCommissionRow[];
  ops: LoggedOp[];
  convert: RepConvert;
  list: (values: Record<string, number>) => string;
  accountName: (accountId: string) => string;
  accountEmail: (accountId: string) => string;
  onOpen: (row: RepDeviceCommissionRow) => void;
}) {
  const [since, setSince] = useState(() => localInput(new Date(Date.now() - 48 * 3600_000)));
  const [note, setNote] = useState<string | null>(null);
  const origins = useMemo(() => (typeof window === "undefined" ? {} : loadOrigins(browserLinkStorage())), []);
  const sinceIso = useMemo(() => {
    const d = new Date(since);
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
  }, [since]);
  const audit = useMemo(() => buildProfitAudit({ rows, origins, ops, since: sinceIso, convert }), [rows, origins, ops, sinceIso, convert]);
  const share = (r: RepDeviceCommissionRow) => list(convert(r.repShareUsd ?? 0, "USD", r.entry.profitCurrencyRates));
  const device = (id: string) => {
    const email = accountEmail(id);
    return email ? `${accountName(id)} (${email})` : accountName(id);
  };

  const text = useMemo(() => {
    const out: string[] = [`🔍 فحص حساب الربح - منذ ${when(sinceIso)}`, "", `1) حصص دخلت بعد هذا الوقت وتاريخها أقدم (${audit.late.length}):`];
    for (const l of audit.late) out.push(`- ${device(l.row.accountId)} · يوم ${l.day} · حصته ${share(l.row)} · سجّلها ${l.by ?? "هذا الهاتف"} · وصلت ${when(l.landedAt)}`);
    out.push("", `2) حصتان لنفس الجهاز في شهر (${audit.doubles.length}):`);
    for (const g of audit.doubles) out.push(`- ${device(g.accountId)} · ${g.month}: ${g.rows.map((r) => `${share(r)} (${r.entry.starlinkCost?.paidAt ?? r.entry.date})`).join(" + ")}`);
    out.push("", `3) عمليات تغيّرت حصتها بعد رسالة البوت (${audit.drifts.length}):`);
    for (const d of audit.drifts) out.push(`- #${d.op.serial} ${device(d.row.accountId)} · البوت: ${list(d.then)} · الآن: ${list(d.now)} · ${makeupText(d.makeup)}${d.origin ? ` · آخر تعديل ${d.origin.by} ${when(d.origin.at)}` : ""}`);
    return out.join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit, sinceIso]);

  return (
    <div className="rep-audit">
      <p className="settings-hint">للقراءة فقط - لا يُحذف ولا يُعدَّل شيء. اضغط أي سطر لفتح عمليته إن أردت تعديلها بيدك.</p>
      <label className="rep-form-field">
        <span>منذ</span>
        <input className="search-input" type="datetime-local" dir="ltr" value={since} onChange={(e) => setSince(e.target.value)} />
      </label>

      <h3 className="rep-audit-title">1️⃣ حصص دخلت بعد هذا الوقت وتاريخها أقدم ({audit.late.length})</h3>
      {audit.late.length === 0 && <p className="settings-hint">لا شيء.</p>}
      {audit.late.map((l) => (
        <button key={l.row.entry.id} type="button" className="party-sheet-option" onClick={() => onOpen(l.row)}>
          <span aria-hidden="true">🕓</span>
          <span>
            <strong>
              {device(l.row.accountId)} · حصته {share(l.row)}
            </strong>
            <small>
              يوم <bdi dir="ltr">{l.day}</bdi> · سجّلها {l.by ? `🔗 ${l.by}` : "هذا الهاتف"} · وصلت <bdi dir="ltr">{when(l.landedAt)}</bdi>
            </small>
          </span>
        </button>
      ))}

      <h3 className="rep-audit-title">2️⃣ حصتان لنفس الجهاز في شهر ({audit.doubles.length})</h3>
      {audit.doubles.length === 0 && <p className="settings-hint">لا شيء.</p>}
      {audit.doubles.map((g) =>
        g.rows.map((r, i) => (
          <button key={r.entry.id} type="button" className="party-sheet-option" onClick={() => onOpen(r)}>
            <span aria-hidden="true">{i === 0 ? "1️⃣" : "⚠️"}</span>
            <span>
              <strong>
                {device(g.accountId)} · <bdi dir="ltr">{g.month}</bdi> · حصته {share(r)}
              </strong>
              <small>
                دُفع <bdi dir="ltr">{r.entry.starlinkCost?.paidAt ?? r.entry.date}</bdi>
                {r.entry.note ? ` · ${r.entry.note}` : ""}
              </small>
            </span>
          </button>
        )),
      )}

      <h3 className="rep-audit-title">3️⃣ عمليات تغيّرت حصتها بعد رسالة البوت ({audit.drifts.length})</h3>
      {audit.drifts.length === 0 && <p className="settings-hint">لا شيء.</p>}
      {audit.drifts.map((d) => (
        <button key={d.op.serial} type="button" className="party-sheet-option" onClick={() => onOpen(d.row)}>
          <span aria-hidden="true">🔢</span>
          <span>
            <strong>
              #{d.op.serial} {device(d.row.accountId)} · البوت {list(d.then)} ← الآن {list(d.now)}
            </strong>
            <small>
              {makeupText(d.makeup)}
              {d.origin ? ` · آخر تعديل 🔗 ${d.origin.by} ` : ""}
              {d.origin && <bdi dir="ltr">{when(d.origin.at)}</bdi>}
            </small>
          </span>
        </button>
      ))}

      <button
        type="button"
        className="dialog-primary"
        onClick={async () => {
          const r = await shareText(text, "فحص حساب الربح");
          setNote(r === "copied" ? "✓ نُسخت القائمة - الصقها لي" : r === "failed" ? "تعذّر الإرسال" : null);
        }}
      >
        📤 أرسل القائمة
      </button>
      {note && <p className="settings-hint">{note}</p>}
    </div>
  );
}
