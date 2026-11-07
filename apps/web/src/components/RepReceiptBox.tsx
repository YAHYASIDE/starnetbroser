"use client";

import { useEffect, useState } from "react";
import { formatMoneyShort } from "@/lib/telegramRepMessages";
import { getProof } from "@/lib/paymentProofStore";
import { CFA_PER_SIFA, checkReceiptAmount, receiptDateLabel, receiptIsOld } from "@/lib/receiptCheck";
import { formatAmount } from "@/lib/formatAmount";
import { receiptLocked } from "@/lib/receiptReader";
import { loadRepRequests, REP_REQUESTS_CHANGED, saveRepRequests, type RepRequest } from "@/lib/repRequests";
import { downloadRepImage } from "@/lib/telegram";
import { requestProofKey } from "./ReceiptReaderRunner";

function dayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 🧾 The rep's receipt on his request (his Nov 7 2026 ask): a small picture - tap it for the whole screen - and beside
 * it what was read: the reference, the amount (against what he wrote, 1 سيفا = 5 فرنك) and the date (older than a day
 * is flagged). The same receipt as an earlier request locks the approval until «أعرف، سجّله مع ذلك».
 */
export function RepReceiptBox({ request, repName, onLoaded }: { request: RepRequest; repName: (repId: string) => string; onLoaded?: (dataUrl: string) => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState(false);

  useEffect(() => {
    let alive = true;
    void getProof(requestProofKey(request.id)).then((url) => {
      if (!alive || !url) return;
      setDataUrl(url);
      onLoaded?.(url);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.receipt?.readAt]);

  async function show() {
    if (dataUrl) return setOpen(true);
    if (!request.proofFileId || loading) return;
    setLoading(true);
    setFailed(false);
    const url = await downloadRepImage(request.proofFileId, request.proofBot);
    setLoading(false);
    if (!url) return setFailed(true);
    setDataUrl(url);
    onLoaded?.(url);
    setOpen(true);
  }

  function registerAnyway() {
    saveRepRequests(loadRepRequests().map((r) => (r.id === request.id ? { ...r, receiptOverride: true } : r)));
    setOverride(true);
    window.dispatchEvent(new Event(REP_REQUESTS_CHANGED));
  }

  const r = request.receipt;
  const amountCheck = r ? checkReceiptAmount(r, request.amount, request.currency) : "unknown";
  const locked = receiptLocked({ ...request, receiptOverride: request.receiptOverride || override });

  return (
    <>
      <div className="rep-receipt">
        <button type="button" className="rep-receipt-thumb" onClick={() => void show()} aria-label="عرض صورة الإيصال كاملة">
          {dataUrl ? <img src={dataUrl} alt="صورة الإيصال" /> : <span>{loading ? "⏳" : failed ? "⚠️" : "📸"}</span>}
        </button>
        <div className="rep-receipt-info">
          {!r ? (
            <span className="rep-receipt-muted">⏳ يُقرأ الإيصال عند وصوله - اضغط الصورة لتراها</span>
          ) : r.error ? (
            <span className="rep-receipt-muted">⚠️ تعذّر تنزيل الصورة بعد - اضغطها لتجرّب</span>
          ) : (
            <>
              <span>
                🔖 المرجع: {r.ref ? <bdi dir="ltr" className="rep-receipt-ref">{r.ref}</bdi> : <span className="rep-receipt-muted">لم يُقرأ</span>}
              </span>
              {r.amount !== undefined && (
                <span className={amountCheck === "mismatch" ? "rep-receipt-warn" : undefined}>
                  💰 <bdi dir="ltr">{formatAmount(r.amount)} {r.unit === "CFA" ? "CFA" : ""}</bdi>
                  {r.unit === "MRU" ? " أوقية" : ""}
                  {r.unit === "CFA" ? (
                    <>
                      {" = "}
                      <bdi dir="ltr">{formatAmount(r.amount / CFA_PER_SIFA)}</bdi> سيفا
                    </>
                  ) : null}
                  {amountCheck === "ok" ? " ✓ مطابق" : amountCheck === "mismatch" && request.amount && request.currency ? ` ⚠️ لا يطابق ما كتبه (${formatMoneyShort(request.amount, request.currency)})` : ""}
                </span>
              )}
              {r.at && (
                <span className={receiptIsOld(r, request.createdAt) ? "rep-receipt-warn" : undefined}>
                  📅 <bdi dir="ltr">{receiptDateLabel(r.at)}</bdi>
                  {receiptIsOld(r, request.createdAt) ? " ⚠️ أقدم من طلبه بأكثر من يوم" : ""}
                </span>
              )}
              {!r.ref && r.amount === undefined && !r.at && <span className="rep-receipt-muted">لم يُقرأ نص من الصورة - راجعها بعينك</span>}
            </>
          )}
        </div>
      </div>
      {request.receiptDup && (
        <div className={`rep-receipt-dup${locked ? "" : " rep-receipt-dup-ok"}`} role="alert">
          <span>
            ⛔ هذا التحويل سُجّل من قبل ({request.receiptDup.by === "ref" ? "المرجع نفسه" : "الصورة نفسها"}): طلب {repName(request.receiptDup.repId)} يوم{" "}
            <bdi dir="ltr">{dayTime(request.receiptDup.at)}</bdi>
            {locked ? " - الموافقة مقفلة." : " - سمحت بتسجيله."}
          </span>
          {locked && (
            <button type="button" className="text-action" onClick={registerAnyway}>
              أعرف، سجّله مع ذلك
            </button>
          )}
        </div>
      )}
      {open && dataUrl && (
        <div className="rep-receipt-viewer" role="dialog" aria-label="صورة الإيصال" onClick={() => setOpen(false)}>
          <button type="button" className="rep-receipt-close" aria-label="إغلاق" onClick={() => setOpen(false)}>
            ✕
          </button>
          <img src={dataUrl} alt="صورة الإيصال" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
