"use client";

import { useMemo, useState } from "react";
import { daysAgoLabel, DebtorAging, totalAgingByCurrency } from "@/lib/debtAging";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import { buildStoreDebtReminderMessage, buildWhatsAppLink } from "@/lib/whatsapp";

function currencyLabel(code: string): string {
  return LEDGER_CURRENCY_LABELS[code as LedgerCurrency] ?? code;
}

function ageClass(days: number): string {
  return days > 60 ? "aging-overdue" : days > 30 ? "aging-late" : "aging-fresh";
}

const PREVIEW_COUNT = 8;

/** أعمار الديون - per-currency bucket totals, then "من أطالب أولًا": every debtor, oldest debt
 * first, each with a one-tap WhatsApp reminder. */
export function DebtAgingSection({ debtors }: { debtors: DebtorAging[] }) {
  const [showAll, setShowAll] = useState(false);
  const totals = useMemo(() => totalAgingByCurrency(debtors), [debtors]);
  const visible = showAll ? debtors : debtors.slice(0, PREVIEW_COUNT);

  return (
    <section className="section">
      <h2 className="report-section-title">⏳ أعمار الديون - من أطالب أولًا ({debtors.length})</h2>
      {debtors.length === 0 ? (
        <p className="empty-state">لا توجد ديون مستحقة 👍</p>
      ) : (
        <>
          {Object.entries(totals).map(([code, t]) => (
            <div key={code} className="aging-buckets">
              <span className="aging-currency">{currencyLabel(code)}</span>
              <div className="aging-bucket aging-fresh">
                <small>حتى 30 يومًا</small>
                <strong dir="ltr">{formatAmount(t.fresh)}</strong>
              </div>
              <div className="aging-bucket aging-late">
                <small>31 - 60 يومًا</small>
                <strong dir="ltr">{formatAmount(t.late)}</strong>
              </div>
              <div className="aging-bucket aging-overdue">
                <small>أكثر من 60 يومًا</small>
                <strong dir="ltr">{formatAmount(t.overdue)}</strong>
              </div>
            </div>
          ))}
          <ul className="aging-list">
            {visible.map((d) => {
              const link = buildWhatsAppLink(d.phone, buildStoreDebtReminderMessage(d.name, { [d.currencyCode]: d.total }));
              return (
                <li key={`${d.kind}-${d.id}-${d.currencyCode}`} className={`aging-row ${ageClass(d.oldestDays)}`}>
                  <div className="aging-row-main">
                    <strong>
                      {d.kind === "client" ? "👤" : "📡"} {d.name}
                    </strong>
                    <span>
                      <bdi dir="ltr">{formatAmount(d.total)}</bdi> {currencyLabel(d.currencyCode)} · أقدم دين {daysAgoLabel(d.oldestDays)}
                    </span>
                  </div>
                  {link ? (
                    <a className="aging-wa" href={link} target="_blank" rel="noreferrer" aria-label={`مطالبة ${d.name} عبر واتساب`}>
                      💬
                    </a>
                  ) : (
                    <span className="aging-no-phone" title="لا يوجد رقم">—</span>
                  )}
                </li>
              );
            })}
          </ul>
          {debtors.length > PREVIEW_COUNT && (
            <button type="button" className="text-action" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "عرض أقل" : `عرض الكل (${debtors.length})`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
