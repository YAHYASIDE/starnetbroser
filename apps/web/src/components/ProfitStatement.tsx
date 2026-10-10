"use client";

import { useState } from "react";
import Link from "next/link";
import { PartySheet } from "@/components/AccountsSection";
import { formatAmount } from "@/lib/formatAmount";
import { homeSearchHref } from "@/lib/homeActions";
import type { ProfitDay, ProfitRow } from "@/lib/profitStatement";

/**
 * 📒 «كشف الأرباح» (reports → ستارلينك): the period's profit day by day like a bank statement.
 * Tapping a row opens its whole story (lib/profitStatement.ts); a day can be hidden from the
 * reports (asks for رمز الحذف upstream) without deleting anything.
 */

interface Names {
  device: (accountId: string) => string;
  client: (accountId: string) => string | undefined;
  rep: (repId: string) => string | undefined;
}

function mru(value: number | undefined, approx = false): string {
  if (value === undefined) return "—";
  return `${approx ? "≈ " : ""}${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value)))}`;
}

function money(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined || !currency) return "—";
  return `${formatAmount(amount)} ${currency}`;
}

const PAYMENT_LABEL = { paid: "✅ دفع كاملاً", partial: "🟠 دفع جزءاً", unpaid: "🔴 لم يدفع بعد" } as const;

export function ProfitStatement({
  days,
  names,
  emptyText,
  onHideDay,
}: {
  days: ProfitDay[];
  names: Names;
  emptyText: string;
  onHideDay?: (date: string) => void;
}) {
  const [open, setOpen] = useState<ProfitRow | null>(null);
  if (days.length === 0) return <p className="party-empty">{emptyText}</p>;
  return (
    <>
      <ol className="profit-days">
        {days.map((day) => (
          <li key={day.date} className="profit-day">
            <div className="profit-day-head">
              <bdi dir="ltr" className="profit-day-date">{day.date}</bdi>
              <span className="profit-day-count">{day.rows.length} شحنة</span>
              <strong className={day.profitMru < 0 ? "report-bad" : "report-good"}>
                <bdi dir="ltr">{mru(day.profitMru)}</bdi>
              </strong>
              {onHideDay && (
                <button type="button" className="profit-day-hide" onClick={() => onHideDay(day.date)} aria-label={`إخفاء أرباح ${day.date}`}>
                  🙈
                </button>
              )}
            </div>
            <ul className="profit-rows">
              {day.rows.map((row) => (
                <li key={row.entryId}>
                  <button type="button" className="profit-row" onClick={() => setOpen(row)}>
                    <span className="profit-row-main">
                      <strong>{names.device(row.accountId)}</strong>
                      <small>
                        {names.client(row.accountId) ?? "بدون زبون"}
                        {row.rep ? ` · ${names.rep(row.rep.id) ?? "مندوب"}` : ""}
                      </small>
                    </span>
                    <span className="profit-row-side">
                      <strong className={row.profitUsd < 0 ? "report-bad" : "report-good"}>
                        <bdi dir="ltr">{mru(row.profitMru, !row.mruExact)}</bdi>
                      </strong>
                      <small className={`profit-chip profit-chip-${row.status}`}>{row.status === "confirmed" ? "✓ مؤكد" : "D متوقع"}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {open && <ProfitDetail row={open} names={names} onClose={() => setOpen(null)} />}
    </>
  );
}

function ProfitDetail({ row, names, onClose }: { row: ProfitRow; names: Names; onClose: () => void }) {
  const device = names.device(row.accountId);
  const loss = row.profitUsd < 0;
  const costState = row.cost.waived
    ? "أُلغيت (جهاز معطّل)"
    : row.status === "confirmed"
      ? `مدفوعة يوم ${row.cost.paidAt ?? "—"}${row.cost.viaCard ? " من الكاش" : ""}`
      : "D - لم تُدفع لـ Starlink بعد";
  return (
    <PartySheet title={device} onClose={onClose}>
      <dl className="profit-detail">
        <div>
          <dt>👤 الزبون</dt>
          <dd>{names.client(row.accountId) ?? "بدون زبون"}</dd>
        </div>
        <div>
          <dt>📅 تاريخ البيع</dt>
          <dd><bdi dir="ltr">{row.saleDate}</bdi></dd>
        </div>
        <div className="profit-detail-block profit-detail-sale">
          <dt>💵 البيع للزبون</dt>
          <dd>
            <bdi dir="ltr">{money(row.sale.amount, row.sale.currency)}</bdi>
            {row.sale.currency !== "USD" && row.sale.usd !== undefined && (
              <small>
                تساوي <bdi dir="ltr">{formatAmount(row.sale.usd)} USD</bdi>
                {row.sale.rateFromUsd !== undefined && <> · السعر <bdi dir="ltr">{formatAmount(row.sale.rateFromUsd)}</bdi></>}
              </small>
            )}
          </dd>
        </div>
        <div className="profit-detail-block profit-detail-cost">
          <dt>🛰️ تكلفة Starlink</dt>
          <dd>
            <bdi dir="ltr">{money(row.cost.amount, row.cost.currency)}</bdi>
            {row.cost.currency !== "USD" && row.cost.usd !== undefined && (
              <small>
                تساوي <bdi dir="ltr">{formatAmount(row.cost.usd)} USD</bdi>
                {row.cost.rateFromUsd !== undefined && <> · السعر <bdi dir="ltr">{formatAmount(row.cost.rateFromUsd)}</bdi></>}
              </small>
            )}
            <small>{costState}</small>
          </dd>
        </div>
        <div className={`profit-detail-block ${loss ? "profit-detail-loss" : "profit-detail-profit"}`}>
          <dt>{loss ? "📉 الخسارة" : "📈 الربح"} = البيع − التكلفة</dt>
          <dd>
            <bdi dir="ltr">{formatAmount(row.profitUsd)} USD</bdi>
            <strong>
              <bdi dir="ltr">{mru(row.profitMru, !row.mruExact)}</bdi> أوقية
            </strong>
            <small>{row.mruExact ? "بسعر الأوقية المثبت يوم الدفع" : "بسعر الأوقية اليوم - يتثبت عند الدفع"}</small>
          </dd>
        </div>
        {row.rep && (
          <div className="profit-detail-block profit-detail-rep">
            <dt>🤝 المندوب {names.rep(row.rep.id) ?? ""}</dt>
            <dd>
              <span>
                <bdi dir="ltr">{row.rep.percent}%</bdi> = <bdi dir="ltr">{mru(row.rep.shareMru, !row.mruExact)}</bdi> أوقية
              </span>
              <small>{row.rep.sharesLosses ? "يشارك في الخسارة" : "لا يشارك في الخسارة"}</small>
            </dd>
          </div>
        )}
        <div className="profit-detail-block profit-detail-ours">
          <dt>✅ صافي ربحك</dt>
          <dd>
            <strong>
              <bdi dir="ltr">{mru(row.ourMru, !row.mruExact)}</bdi> أوقية
            </strong>
          </dd>
        </div>
        <div>
          <dt>💳 دفع الزبون</dt>
          <dd>{PAYMENT_LABEL[row.clientPayment]}</dd>
        </div>
        {row.note.trim() && (
          <div>
            <dt>📝 ملاحظة</dt>
            <dd>{row.note}</dd>
          </div>
        )}
      </dl>
      <Link href={homeSearchHref(device)} className="party-action profit-detail-open">
        📄 فتح الجهاز
      </Link>
    </PartySheet>
  );
}
