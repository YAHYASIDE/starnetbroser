"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { LedgerByAccount } from "@/lib/ledgerStore";
import { ClientStore, getClient } from "@/lib/clientStore";
import { loadRepresentativeStore, RepresentativeStore } from "@/lib/repStore";
import {
  buildMonthReport,
  buildMonthReportPdf,
  closeMonth,
  loadMonthClosings,
  monthLabel,
  MonthClosings,
  recentMonths,
  reopenMonth,
  saveMonthClosings,
} from "@/lib/monthClosing";
import { formatAmount } from "@/lib/formatAmount";
import { PdfButton } from "./PdfButton";

function mru(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value)))} أوقية`;
}

/** "إقفال الشهر": the chosen month's profit and each rep's share, the owner's PDF, each rep's own
 * statement for that month, and closing/reopening the month. */
export function MonthClosingSection({
  ledgerStore,
  accounts,
  clientStore,
  mruRate,
}: {
  ledgerStore: LedgerByAccount;
  accounts: StarlinkAccountSummary[];
  clientStore: ClientStore;
  mruRate: number | undefined;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const months = useMemo(() => recentMonths(today, 12), [today]);
  const [month, setMonth] = useState(months[0]!);
  const [closings, setClosings] = useState<MonthClosings>({});
  const [repStore, setRepStore] = useState<RepresentativeStore>({});
  useEffect(() => {
    setClosings(loadMonthClosings());
    setRepStore(loadRepresentativeStore());
  }, []);

  const report = useMemo(() => (mruRate ? buildMonthReport(ledgerStore, month, mruRate) : null), [ledgerStore, month, mruRate]);
  const closing = closings[month];
  const repName = (id: string) => repStore[id]?.name ?? "مندوب محذوف";

  function toggleClosed() {
    if (closing) {
      if (!window.confirm(`فتح ${monthLabel(month)} من جديد؟ لن يُسأل عن التأكيد عند تعديل عملياته.`)) return;
      const next = reopenMonth(closings, month);
      saveMonthClosings(next);
      setClosings(next);
      return;
    }
    if (!window.confirm(`إقفال ${monthLabel(month)}؟ بعد الإقفال يسألك التطبيق للتأكيد قبل تعديل أي عملية من هذا الشهر.`)) return;
    const next = closeMonth(closings, month);
    saveMonthClosings(next);
    setClosings(next);
  }

  return (
    <section className="section month-closing">
      <div className="month-closing-head">
        <h2 className="report-section-title">🗓️ إقفال الشهر</h2>
        <select className="month-closing-select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {closings[m] ? " 🔒" : ""}
            </option>
          ))}
        </select>
      </div>

      {!report ? (
        <p className="settings-hint">سجّل سعر الأوقية في صفحة العملات لحساب تقرير الشهر.</p>
      ) : (
        <>
          <div className="report-grid report-grid-3">
            <div className="report-tile">
              <span className="report-tile-label">ربح الشهر</span>
              <strong className="report-tile-value">
                <bdi dir="ltr">{mru(report.profitMru)}</bdi>
              </strong>
            </div>
            <div className="report-tile">
              <span className="report-tile-label">حصص المندوبين</span>
              <strong className="report-tile-value">
                <bdi dir="ltr">{mru(report.repSharesMru)}</bdi>
              </strong>
            </div>
            <div className="report-tile">
              <span className="report-tile-label">صافي ربحي</span>
              <strong className="report-tile-value">
                <bdi dir="ltr">{mru(report.netMru)}</bdi>
              </strong>
            </div>
          </div>
          <p className="settings-hint">
            {report.rows.length} شحنة دُفعت تكلفتها لستارلينك في {monthLabel(month)}
            {report.exact ? "" : " - بعضها محسوب بسعر الأوقية اليوم (≈)"}.
          </p>

          {report.reps.length > 0 && (
            <ul className="month-closing-reps">
              {report.reps.map((rep) => (
                <li key={rep.representativeId} className="month-closing-rep">
                  <div className="month-closing-rep-main">
                    <strong>🤝 {repName(rep.representativeId)}</strong>
                    <span>
                      {rep.shipmentCount} شحنة · حصته <bdi dir="ltr">{mru(rep.repShareMru)}</bdi>
                    </span>
                  </div>
                  <Link
                    className="party-action"
                    href={`/representatives?rep=${encodeURIComponent(rep.representativeId)}&month=${month}`}
                  >
                    📄 كشفه PDF
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="month-closing-actions">
            <PdfButton
              className="dialog-primary"
              label="🖨️ تقرير الشهر PDF"
              build={() =>
                buildMonthReportPdf(
                  report,
                  {
                    accountName: (id) => accounts.find((a) => a.id === id)?.name ?? "جهاز محذوف",
                    clientName: (id) => getClient(clientStore, accounts.find((a) => a.id === id)?.clientId)?.name,
                    repName,
                  },
                  closing?.closedAt,
                )
              }
            />
            <button type="button" className={`party-action${closing ? "" : " month-closing-close"}`} onClick={toggleClosed}>
              {closing ? "🔓 فتح الشهر من جديد" : "🔒 إقفال الشهر"}
            </button>
          </div>
          {closing && (
            <p className="month-closing-note">
              🔒 أُقفل يوم <bdi dir="ltr">{closing.closedAt.slice(0, 10)}</bdi> - تعديل أي عملية منه يطلب التأكيد.
            </p>
          )}
        </>
      )}
    </section>
  );
}
