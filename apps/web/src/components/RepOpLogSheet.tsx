"use client";

import { useEffect, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { exportPrintableImage } from "@/lib/imageExport";
import { getProof, putProof } from "@/lib/paymentProofStore";
import { loadOpRatings } from "@/lib/repOpRatings";
import { findOps, loadOpLog, markProofKept, OP_LOG_CHANGED, opProofKey, opReceiptDoc, saveOpLog, type LoggedOp } from "@/lib/repOpLog";
import { downloadRepImage } from "@/lib/telegram";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ratingOf(op: LoggedOp): string {
  const r = loadOpRatings().ratings[op.token];
  if (!r) return "⚪ لم يقيّمها";
  if (r.verdict === "good") return `✅ جيد · ${r.by}`;
  return `❌ غير جيد · ${r.by}${r.reviewedAt ? " · ✓ راجعتها" : ""}`;
}

function amountOf(op: LoggedOp): string {
  const f = op.figures[0];
  if (!f) return "";
  return `${f.amount > 0 ? "+" : "-"}${Math.abs(f.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${f.code === "SIFA" ? "سيفا" : f.code === "MRU" ? "أوقية" : f.code}`;
}

/** 📜 «سجل العمليات» of one rep (lib/repOpLog.ts): every operation the money bot sent him, by its number. */
export function RepOpLogSheet({ repId, repName, onClose }: { repId: string; repName: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [store, setStore] = useState(loadOpLog);
  const [open, setOpen] = useState<LoggedOp | null>(null);
  useEffect(() => {
    const reload = () => setStore(loadOpLog());
    window.addEventListener(OP_LOG_CHANGED, reload);
    return () => window.removeEventListener(OP_LOG_CHANGED, reload);
  }, []);
  const list = findOps(store, repId, query);

  if (open) return <OpDetail op={open} repName={repName} onBack={() => setOpen(null)} onClose={onClose} />;

  return (
    <PartySheet title={`📜 سجل عمليات ${repName}`} onClose={onClose}>
      <input
        className="search-input op-log-search"
        inputMode="search"
        placeholder="🔢 رقم العملية، مبلغ أو كلمة"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {list.length === 0 ? (
        <p className="party-empty">{query ? "لا عملية بهذا البحث" : "لا عمليات بعد - كل عملية يرسلها بوت الأموال للمندوب تُحفظ هنا برقمها."}</p>
      ) : (
        <ul className="op-log-list" data-tour="op-log">
          {list.map((op) => (
            <li key={op.serial}>
              <button type="button" className="op-log-item" onClick={() => setOpen(op)}>
                <strong className="op-log-serial">#{op.serial}</strong>
                <span className="op-log-main">
                  <span>{op.kind || op.text.split("\n")[0]}</span>
                  <small>
                    <bdi dir="ltr">{when(op.at)}</bdi> · {op.account}
                    {op.proofFileId || op.proofKept ? " · 📸" : ""}
                    {op.receiptRef ? <> · 🔖 <bdi dir="ltr">{op.receiptRef}</bdi></> : null}
                  </small>
                </span>
                <span className="op-log-amount">
                  <bdi dir="ltr">{amountOf(op)}</bdi>
                  <small>{ratingOf(op).split(" · ")[0]}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PartySheet>
  );
}

function OpDetail({ op, repName, onBack, onClose }: { op: LoggedOp; repName: string; onBack: () => void; onClose: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const kept = (await getProof(opProofKey(op))) ?? (op.recordId ? await getProof(op.recordId) : undefined);
      if (alive && kept) setPhoto(kept);
    })();
    return () => {
      alive = false;
    };
  }, [op]);

  async function fetchPhoto() {
    if (!op.proofFileId) return;
    setStatus("⏳ يُنزّل الصورة…");
    const dataUrl = await downloadRepImage(op.proofFileId, op.proofBot ?? "reps");
    if (!dataUrl) return setStatus("تعذّر التنزيل - تحقق من الإنترنت");
    await putProof(opProofKey(op), dataUrl);
    saveOpLog(markProofKept(loadOpLog(), op.repId, op.serial));
    setPhoto(dataUrl);
    setStatus(null);
  }

  return (
    <PartySheet title={`📜 العملية #${op.serial}`} onClose={onClose}>
      <div className="op-log-detail">
        <p className="op-log-row"><span>🔢 الرقم</span><strong>#{op.serial}</strong></p>
        <p className="op-log-row"><span>🗓️ وقت العملية</span><bdi dir="ltr">{when(op.at)}</bdi></p>
        <p className="op-log-row"><span>📨 أُرسلت له</span><bdi dir="ltr">{when(op.sentAt)}</bdi></p>
        <p className="op-log-row"><span>⭐ تقييمه</span><span>{ratingOf(op)}</span></p>
        {op.receiptRef && <p className="op-log-row"><span>🔖 مرجع التحويل</span><bdi dir="ltr">{op.receiptRef}</bdi></p>}
        <div className="op-log-source">
          <strong>🧭 من أين جاءت</strong>
          <p>{op.source}</p>
        </div>
        <pre className="op-log-text">{op.text}</pre>
        {photo ? (
          <img className="op-log-photo" src={photo} alt={`صورة المندوب مع العملية #${op.serial}`} />
        ) : op.proofFileId ? (
          <button type="button" className="dialog-secondary" onClick={() => void fetchPhoto()}>📸 تنزيل صورة المندوب</button>
        ) : (
          <p className="settings-hint">📸 لم يرسل صورة مع هذه العملية</p>
        )}
        {status && <p className="settings-hint">{status}</p>}
        <div className="op-log-actions">
          <button type="button" className="dialog-secondary" onClick={onBack}>→ السجل</button>
          <button
            type="button"
            className="dialog-primary"
            onClick={async () => {
              const r = await exportPrintableImage(opReceiptDoc(op, repName), `op-${op.serial}`);
              if (!r.ok) setStatus(r.message);
            }}
          >
            🖼️ صورة الإيصال
          </button>
        </div>
      </div>
    </PartySheet>
  );
}
